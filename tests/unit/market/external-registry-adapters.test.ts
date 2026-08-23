import { describe, expect, it } from "vitest";

import {
  fetchAgenticMarketCatalog,
  fetchTregCatalog,
} from "@/modules/market/registry-source-adapters";

function json(document: unknown): Response {
  return Response.json(document);
}

describe("registry origin adapters", () => {
  it("enumerates every Agentic Market service page and keeps endpoint identity", async () => {
    const offsets: number[] = [];
    const result = await fetchAgenticMarketCatalog({
      pageSize: 2,
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        return json(
          agenticMarketPage(
            offset === 0
              ? [agenticService("alpha", 2), agenticService("beta", 1)]
              : [{
                  ...agenticService("gamma", 0),
                  providerUrl: "",
                  priceSummary: null,
                }],
            3,
            2,
            offset,
          ),
        );
      },
      now: () => 1_000,
    });

    expect(offsets).toEqual([0, 2]);
    expect(result).toMatchObject({
      source: "agentic_market",
      complete: true,
      sourceReportedCount: 3,
      fetchedServiceCount: 3,
      fetchedAt: 1_000,
    });
    expect(result.entries).toHaveLength(4);
    expect(result.entries[0]).toMatchObject({
      kind: "registry_source_entry",
      source: "agentic_market",
      upstreamServiceId: "alpha",
      upstreamEndpointId: "POST:https://api.alpha.example/route-0",
      method: "POST",
      access: "x402",
      authority: "source_metadata_only",
    });
  });

  it("marks an Agentic Market ceiling as incomplete instead of claiming full coverage", async () => {
    const result = await fetchAgenticMarketCatalog({
      pageSize: 1,
      maxServices: 1,
      fetch: async () => json(agenticMarketPage([agenticService("alpha", 1)], 2, 1, 0)),
    });

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toBe("entry_ceiling_reached");
    expect(result.sourceReportedCount).toBe(2);
  });

  it("deduplicates repeated Agentic Market sweeps because offset ordering is unstable", async () => {
    const offsets: number[] = [];
    let request = 0;
    const pages = [
      [agenticService("alpha", 1), agenticService("beta", 1)],
      [agenticService("beta", 1)],
      [agenticService("gamma", 1), agenticService("alpha", 1)],
      [agenticService("beta", 1)],
    ];
    const result = await fetchAgenticMarketCatalog({
      pageSize: 2,
      maxSweeps: 2,
      fetch: async (url) => {
        const offset = Number(new URL(url).searchParams.get("offset"));
        offsets.push(offset);
        const services = pages[request++] ?? [];
        return json(agenticMarketPage(services, 3, 2, offset));
      },
    });

    expect(offsets).toEqual([0, 2, 0, 2]);
    expect(result.complete).toBe(true);
    expect(result.fetchedServiceCount).toBe(3);
    expect(result.entries.map((entry) => entry.upstreamServiceId).sort()).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("enumerates the Treg shelf index and every hidden-inclusive shelf exactly once", async () => {
    const requested: string[] = [];
    const result = await fetchTregCatalog({
      fetch: async (url) => {
        requested.push(url);
        if (url.endsWith("/catalog/platforms")) {
          return json({
            generated_from: "catalog",
            platforms: [
              tregPlatform("companies", 1),
              tregPlatform("stocks", 2),
            ],
          });
        }
        const slug = new URL(url).pathname.split("/").at(-1)!;
        return json(tregShelf(slug));
      },
      now: () => 2_000,
    });

    expect(requested).toEqual([
      "https://treg.to/catalog/platforms",
      "https://treg.to/catalog/platforms/companies?include_hidden=1",
      "https://treg.to/catalog/platforms/stocks?include_hidden=1",
    ]);
    expect(result).toMatchObject({
      source: "treg",
      complete: true,
      fetchedShelfCount: 2,
      sourceReportedCount: 3,
      fetchedAt: 2_000,
    });
    expect(result.entries.map((entry) => entry.upstreamEndpointId)).toEqual([
      "companies.search",
      "companies.extended",
      "stocks.search",
      "stocks.extended",
    ]);
    expect(result.entries[0]).toMatchObject({
      source: "treg",
      sourceUrl: "https://treg.to/catalog/endpoints/companies.search",
      access: "provider_account",
      authority: "source_metadata_only",
    });
  });

  it("rejects wrapper drift and unsafe source URLs", async () => {
    await expect(
      fetchAgenticMarketCatalog({
        fetch: async () => json({ ...agenticMarketPage([], 0, 100, 0), unexpected: true }),
      }),
    ).rejects.toThrow();

    await expect(
      fetchTregCatalog({
        fetch: async () =>
          json({ platforms: [{ ...tregPlatform("companies", 1), slug: "../secrets" }] }),
      }),
    ).rejects.toThrow();
  });

  it("fails closed on timeouts and conflicting duplicate origin identities", async () => {
    await expect(
      fetchAgenticMarketCatalog({
        fetch: async () => {
          throw new DOMException("Timed out", "AbortError");
        },
      }),
    ).rejects.toThrow();

    await expect(
      fetchTregCatalog({
        fetch: async (url) => {
          if (url.endsWith("/catalog/platforms")) {
            return json({ platforms: [tregPlatform("companies", 1)] });
          }
          const shelf = tregShelf("companies");
          const duplicate = {
            ...shelf.capabilities[0]!.endpoints[0]!,
            summary: "Conflicting duplicate metadata",
          };
          return json({ ...shelf, extended: [duplicate] });
        },
      }),
    ).rejects.toThrow("treg_catalog_duplicate_identity_conflict");
  });
});

function agenticMarketPage(
  services: unknown[],
  total: number,
  limit: number,
  offset: number,
) {
  return { services, total, limit, offset };
}

function agenticService(id: string, endpointCount: number) {
  return {
    id,
    name: `${id} API`,
    description: `${id} description`,
    domain: `${id}.example`,
    provider: `${id}.example`,
    providerUrl: `https://${id}.example`,
    category: "Search",
    networks: ["Base"],
    enriched: true,
    endpoints: Array.from({ length: endpointCount }, (_, index) => ({
      url: `https://api.${id}.example/route-${index}`,
      description: `Route ${index}`,
      pricing: {
        amount: "0.01",
        currency: "USDC",
        network: "eip155:8453",
        scheme: "exact",
        maxAmount: "",
        minAmount: "",
      },
      method: "POST",
      providerName: "",
      parameters: [],
      serviceName: `${id} API`,
      tags: ["search"],
      quality: {
        l30DaysTotalCalls: "12",
        l30DaysUniquePayers: "3",
      },
    })),
    integrationType: "1P",
    isNew: false,
    priceSummary: {
      minAmount: "0.01",
      maxAmount: "0.01",
      avgCostPerTransaction: "0.01",
      avgCostBasis: "exact",
      currency: "USDC",
    },
    serviceName: `${id} API`,
    tags: ["search"],
    iconUrl: "",
  };
}

function tregPlatform(slug: string, endpoints: number) {
  return {
    slug,
    label: `${slug} label`,
    category: "Data",
    featured: null,
    summary: `${slug} summary`,
    price_from: null,
    capabilities: 1,
    endpoints,
    verified: 0,
    providers: [`${slug}-provider`],
  };
}

function tregShelf(slug: string) {
  return {
    platform: { slug, label: `${slug} label`, category: "Data" },
    capabilities: [
      {
        id: `${slug}.search`,
        description: `${slug} search`,
        endpoints: [{
          ...tregEndpoint(`${slug}.search`, "core"),
          miss: { reason: "not_in_fixture" },
        }],
      },
    ],
    domains: [],
    extended: [tregEndpoint(`${slug}.extended`, "extended")],
    hidden_count: 1,
    providers: {},
  };
}

function tregEndpoint(id: string, tier: string) {
  return {
    id,
    provider: id.split(".")[0],
    provider_display: `${id.split(".")[0]} provider`,
    name: `${id} endpoint`,
    summary: `${id} summary`,
    method: "GET",
    path: "/v1/search",
    scope: "any_account",
    tier,
    kind: "data",
    domain: "search",
    call_template: `treg call ${id}`,
    cost: { type: "per_call", value: 1, currency: "credit", unit: "call" },
    platform_eligible: false,
    platform_blocked: null,
    miss: null,
    status: null,
    status_note: null,
    superseded_by: null,
    verified: null,
    docs_url: "https://example.com/docs",
    has_example: false,
    input: null,
    test_request: null,
  };
}

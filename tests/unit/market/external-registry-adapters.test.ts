import { describe, expect, it, vi } from "vitest";

import {
  fetchAgenticMarketCatalog,
  fetchTregCatalog,
} from "@/modules/market/registry-source-adapters";

import { run as refreshExternalRegistry } from "../../../convex/marketExternalRegistryRefresh";

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
    expect(result.entries).toHaveLength(3);
    expect(result.excludedCount).toBe(0);
    expect(result.entries[0]).toMatchObject({
      kind: "registry_source_entry",
      source: "agentic_market",
      upstreamServiceId: "alpha",
      upstreamEndpointId: "POST:https://api.alpha.example/route-0",
      routeIdentity: "POST https://api.alpha.example/route-0",
      method: "POST",
      access: "x402",
      exactPrice: {
        scheme: "exact",
        amount: "0.01",
        currency: "USDC",
        network: "eip155:8453",
      },
      credentialRequirements: ["x402_payment"],
      readiness: "source_declared_callable",
      authority: "source_metadata_only",
      probeRequest: {
        method: "POST",
        url: "https://api.alpha.example/route-0",
        headers: [],
      },
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

  it("admits only routes with a standard method, exact positive price, safe credentials, schema, and example", async () => {
    const service = agenticService("quality", 1);
    const valid = service.endpoints[0]!;
    const result = await fetchAgenticMarketCatalog({
      fetch: async () =>
        json(
          agenticMarketPage(
            [{
              ...service,
              endpoints: [
                valid,
                { ...valid, url: "https://api.quality.example/compound", method: "GET, POST" },
                {
                  ...valid,
                  url: "https://api.quality.example/unpriced",
                  pricing: { ...valid.pricing, amount: "" },
                },
                {
                  ...valid,
                  url: "https://api.quality.example/credential-leak",
                  parameters: [{
                    group: "headers",
                    name: "Authorization",
                    type: "string",
                    description: "Provider token",
                    example: "Bearer secret",
                    enumValues: [],
                    default: null,
                    required: true,
                  }],
                },
                {
                  ...valid,
                  url: "https://api.quality.example/no-example",
                  parameters: [{
                    group: "query",
                    name: "query",
                    type: "string",
                    description: "Search query",
                    example: null,
                    enumValues: [],
                    default: null,
                    required: true,
                  }],
                },
              ],
            }],
            1,
            200,
            0,
          ),
        ),
      now: () => Date.parse("2026-08-23T00:00:00.000Z"),
    });

    expect(result.complete).toBe(true);
    expect(result.excludedCount).toBe(4);
    expect(result.entries).toHaveLength(1);
    expect(JSON.parse(result.entries[0]!.inputSchemaJson)).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(result.entries[0]!.exampleInvocation).toContain(
      "curl --request POST",
    );
    expect(result.entries[0]!.lastObservedAt).toBe(
      "2026-08-23T00:00:00.000Z",
    );
  });

  it("streams admitted entries without retaining the catalogue in action memory", async () => {
    const batches: string[][] = [];
    const result = await fetchAgenticMarketCatalog({
      fetch: async () =>
        json(agenticMarketPage([agenticService("streamed", 2)], 1, 200, 0)),
      onEntries: async (entries) => {
        batches.push(entries.map((entry) => entry.routeIdentity));
      },
    });

    expect(result.complete).toBe(true);
    expect(result.admittedCount).toBe(2);
    expect(result.entries).toEqual([]);
    expect(batches.flat()).toEqual([
      "POST https://api.streamed.example/route-0",
      "POST https://api.streamed.example/route-1",
    ]);
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

  it("enumerates every hidden-inclusive Treg shelf as metadata only", async () => {
    const requested: string[] = [];
    const result = await fetchTregCatalog({
      fetch: async (url) => {
        requested.push(url);
        if (url.endsWith("/catalog/platforms")) {
          return json({
            generated_from: "catalog",
            platforms: [tregPlatform("companies", 2), tregPlatform("stocks", 2)],
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
      sourceReportedCount: 4,
      admittedCount: 4,
      excludedCount: 0,
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
    expect(result.entries[0]).not.toHaveProperty("endpointUrl");
    expect(result.entries[0]).not.toHaveProperty("probeRequest");
    expect(result.entries[0]).not.toHaveProperty("exactPrice");
  });

  it("marks an incomplete Treg shelf traversal without claiming coverage", async () => {
    const result = await fetchTregCatalog({
      maxShelves: 1,
      fetch: async (url) =>
        url.endsWith("/catalog/platforms")
          ? json({ platforms: [tregPlatform("companies", 2), tregPlatform("stocks", 2)] })
          : json(tregShelf("companies")),
    });

    expect(result).toMatchObject({
      source: "treg",
      complete: false,
      incompleteReason: "page_ceiling_reached",
      fetchedShelfCount: 1,
      sourceReportedCount: 4,
    });
  });

  it("rejects wrapper drift", async () => {
    await expect(
      fetchAgenticMarketCatalog({
        fetch: async () => json({ ...agenticMarketPage([], 0, 100, 0), unexpected: true }),
      }),
    ).rejects.toThrow();
  });

  it("fails closed on timeouts", async () => {
    await expect(
      fetchAgenticMarketCatalog({
        fetch: async () => {
          throw new DOMException("Timed out", "AbortError");
        },
      }),
    ).rejects.toThrow();

  });

  it("persists all source rows but schedules only a bounded 100-candidate launch cohort", async () => {
    const services = Array.from({ length: 25 }, (_, index) =>
      agenticService(`provider-${index}`, 6),
    );
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.agentic.market") {
        return json(agenticMarketPage(services, services.length, 200, 0));
      }
      if (url.href === "https://treg.to/catalog/platforms") {
        return json({ generated_from: "catalog", platforms: [] });
      }
      throw new Error(`unexpected refresh URL: ${url.href}`);
    });
    const writes: number[] = [];
    const runMutation = vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
      if (Array.isArray(args.entries)) {
        writes.push(args.entries.length);
        return { inserted: args.entries.length, replayed: 0 };
      }
      return null;
    });
    const runAfter = vi.fn(async (
      _delayMs: number,
      _reference: unknown,
      _args: Record<string, unknown>,
    ) => undefined);
    const handler = refreshHandler();

    try {
      const result = await handler({
        runMutation,
        scheduler: { runAfter },
      });
      expect(result).toMatchObject({ kind: "refreshed", entries: 150 });
      expect(writes.reduce((total, count) => total + count, 0)).toBe(150);
      expect(runAfter).toHaveBeenCalledOnce();
      const scheduled = runAfter.mock.calls[0]?.[2] as unknown as {
        generation: string;
        candidates: { documentId: string; sourceDigest: string }[];
      };
      expect(scheduled.candidates).toHaveLength(100);
      expect(new Set(scheduled.candidates.map(({ documentId }) => documentId)).size).toBe(100);
    } finally {
      fetch.mockRestore();
    }
  });

  it("schedules no graduation when either source refresh is incomplete", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.agentic.market") {
        return json(agenticMarketPage([], 1, 200, 0));
      }
      if (url.href === "https://treg.to/catalog/platforms") {
        return json({ generated_from: "catalog", platforms: [] });
      }
      throw new Error(`unexpected refresh URL: ${url.href}`);
    });
    const runMutation = vi.fn(async () => null);
    const runAfter = vi.fn(async (
      _delayMs: number,
      _reference: unknown,
      _args: Record<string, unknown>,
    ) => undefined);
    const handler = refreshHandler();

    try {
      await expect(handler({
        runMutation,
        scheduler: { runAfter },
      })).resolves.toMatchObject({
        kind: "preserved",
        entries: 0,
        reason: "agentic_market:source_count_mismatch",
      });
      expect(runAfter).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});

function refreshHandler() {
  const handler = (refreshExternalRegistry as unknown as {
    _handler: (
      ctx: {
        runMutation: (
          reference: unknown,
          args: Record<string, unknown>,
        ) => Promise<unknown>;
        scheduler: {
          runAfter: (
            delayMs: number,
            reference: unknown,
            args: Record<string, unknown>,
          ) => Promise<void>;
        };
      },
      args: Record<string, never>,
    ) => Promise<unknown>;
  })._handler;
  return (
    ctx: {
      runMutation: (
        reference: unknown,
        args: Record<string, unknown>,
      ) => Promise<unknown>;
      scheduler: {
        runAfter: (
          delayMs: number,
          reference: unknown,
          args: Record<string, unknown>,
        ) => Promise<void>;
      };
    },
  ) => handler(ctx, {});
}

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
    capabilities: [{
      id: `${slug}.search`,
      description: `${slug} search`,
      endpoints: [tregEndpoint(`${slug}.search`, "core")],
    }],
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

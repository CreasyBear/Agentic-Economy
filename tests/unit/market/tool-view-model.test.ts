import { describe, expect, it } from "vitest";

import {
  catalogGroupKey,
  catalogJobLabel,
  catalogJobSummary,
  groupToolCards,
  compareToolPrices,
  capabilityFromPrice,
  type ToolCardViewModel,
} from "@/modules/market/tool-view-model";

const category = {
  id: "commerce" as const,
  label: "Commerce",
  description: "Purchasing and customer operations.",
};

describe("catalog job presentation", () => {
  it("names HTTP path identities as jobs, not path fragments", () => {
    expect(
      catalogJobLabel("post.glim-sh.api-v1-amazon-search"),
    ).toBe("Amazon Search");
    expect(catalogJobLabel("get.host.v0-outline")).toBe("Outline");
    expect(
      catalogJobLabel(
        "get.dns-example.mx",
        "get.dns-example.mx",
        "Look up MX records for a domain.",
      ),
    ).toBe("Look up MX records for a domain");
    expect(catalogJobLabel("identity.company_search")).toBe("Company Search");
    expect(
      catalogJobLabel(
        "post.glim-sh.api-v1-amazon-search",
        "glim.sh",
      ),
    ).toBe("Amazon Search");
  });

  it("prefers a human service name over a path-shaped offering label", () => {
    expect(
      catalogJobLabel(
        "post.glim-sh.api-v1-amazon-search",
        "Amazon product search",
      ),
    ).toBe("Amazon product search");
    expect(
      catalogJobLabel(
        "post.glim-sh.api-v1-amazon-search",
        "post.glim-sh.api-v1-amazon-search",
      ),
    ).toBe("Amazon Search");
  });

  it("strips protocol residue from public summaries", () => {
    expect(
      catalogJobSummary(
        "Search Amazon listings. See /.well-known/first-buy.json for HIP-3 x402 payment required.",
      ),
    ).toBe("Search Amazon listings.");
    expect(
      catalogJobSummary("Facilitator-discovered Market Tool."),
    ).toBe("");
  });

  it("groups substitutable HTTP listings by job, not host", () => {
    expect(catalogGroupKey("post.glim-sh.api-v1-amazon-search")).toBe(
      "amazon-search",
    );
    expect(catalogGroupKey("identity.company_search")).toBe(
      "identity.company_search",
    );

    const grouped = groupToolCards([
      card({
        toolRef: "operation:v1:amazon-a",
        capabilityId: "post.glim-sh.api-v1-amazon-search",
        capability: "Amazon Search",
        providerSlug: "glim",
        providerName: "Glim",
      }),
      card({
        toolRef: "operation:v1:amazon-b",
        capabilityId: "post.other-host.api-v1-amazon-search",
        capability: "Amazon Search",
        providerSlug: "other",
        providerName: "Other Host",
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.label).toBe("Amazon Search");
    expect(grouped[0]?.providerCount).toBe(2);
    expect(grouped[0]?.tools).toHaveLength(2);
  });

  it("groups distinctive job names even when capability ids differ", () => {
    const grouped = groupToolCards([
      card({
        toolRef: "operation:v1:dns-a",
        capabilityId: "get.dns-atlas.lookup",
        capability: "DNS & WHOIS Domain Lookup",
        providerSlug: "atlas",
        providerName: "x402 dns.use.x402atlas.com",
      }),
      card({
        toolRef: "operation:v1:dns-b",
        capabilityId: "get.dns-atlas.whois",
        capability: "DNS & WHOIS Domain Lookup",
        providerSlug: "atlas",
        providerName: "x402 dns.use.x402atlas.com",
      }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.tools).toHaveLength(2);
    expect(grouped[0]?.providerCount).toBe(1);
  });
});

function card(
  overrides: Partial<ToolCardViewModel>,
): ToolCardViewModel {
  return {
    toolRef: "operation:v1:listing",
    title: "Amazon product search",
    summary: "Search Amazon listings and return structured results.",
    providerName: "Glim",
    providerSlug: "glim",
    providerInitials: "GL",
    capabilityId: "post.glim-sh.api-v1-amazon-search",
    capability: "Amazon Search",
    category,
    price: "USD 0.01",
    authentication: "x402 payment",
    callLabel: "Use capability",
    readiness: "Routeable",
    readinessLabel: "Ready now",
    trustFact: "Ready to run through Agentic Economy",
    rating: {
      kind: "unrated",
      count: 0,
      display: "No ratings yet",
      definition: "No ratings",
    },
    popularity: {
      kind: "no_activity",
      completedCalls: 0,
      display: "No completed calls yet",
      definition: "No calls",
    },
    latency: {
      kind: "insufficient_sample",
      sampleSize: 0,
      minimumSampleSize: 5,
      display: "Not enough data",
      definition: "No sample",
    },
    ...overrides,
  };
}


describe("exact Tool price comparison", () => {
  it("orders sub-cent and multi-dollar amounts numerically, with unknown prices last", () => {
    const tools = [
      card({ price: "About A$10.00", priceAmount: { currency: "AUD", exponent: 6, units: "10000000" } }),
      card({ price: "Price on request" }),
      card({ price: "About A$0.000001", priceAmount: { currency: "AUD", exponent: 6, units: "1" } }),
      card({ price: "About A$2.00", priceAmount: { currency: "AUD", exponent: 2, units: "200" } }),
    ];
    expect([...tools].sort(compareToolPrices).map((tool) => tool.price)).toEqual([
      "About A$0.000001", "About A$2.00", "About A$10.00", "Price on request",
    ]);
    expect(capabilityFromPrice(tools)).toBe("from About A$0.000001");
  });
  it("does not compare unrelated currencies or use expired estimates", () => {
    expect(capabilityFromPrice([
      card({ price: "AUD 1", priceAmount: { currency: "AUD", exponent: 0, units: "1" } }),
      card({ price: "USD 1", priceAmount: { currency: "USD", exponent: 0, units: "1" } }),
    ])).toBe("Prices vary");
    expect(compareToolPrices(
      card({ priceAmount: { currency: "AUD", exponent: 6, units: "1" }, priceValidUntil: 1 }),
      card({ priceAmount: { currency: "AUD", exponent: 6, units: "2000000" } }),
    )).toBe(1);
  });
});

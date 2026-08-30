import { describe, expect, it } from "vitest";

import {
  catalogGroupKey,
  catalogJobLabel,
  catalogJobSummary,
  groupOperationCards,
  type OperationCardViewModel,
} from "@/modules/market/operation-view-model";

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
      catalogJobSummary("Facilitator-discovered Market Operation."),
    ).toBe("");
  });

  it("groups substitutable HTTP listings by job, not host", () => {
    expect(catalogGroupKey("post.glim-sh.api-v1-amazon-search")).toBe(
      "amazon-search",
    );
    expect(catalogGroupKey("identity.company_search")).toBe(
      "identity.company_search",
    );

    const grouped = groupOperationCards([
      card({
        operationRef: "operation:v1:amazon-a",
        capabilityId: "post.glim-sh.api-v1-amazon-search",
        capability: "Amazon Search",
        supplierSlug: "glim",
        supplierName: "Glim",
      }),
      card({
        operationRef: "operation:v1:amazon-b",
        capabilityId: "post.other-host.api-v1-amazon-search",
        capability: "Amazon Search",
        supplierSlug: "other",
        supplierName: "Other Host",
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.label).toBe("Amazon Search");
    expect(grouped[0]?.providerCount).toBe(2);
    expect(grouped[0]?.operations).toHaveLength(2);
  });

  it("groups distinctive job names even when capability ids differ", () => {
    const grouped = groupOperationCards([
      card({
        operationRef: "operation:v1:dns-a",
        capabilityId: "get.dns-atlas.lookup",
        capability: "DNS & WHOIS Domain Lookup",
        supplierSlug: "atlas",
        supplierName: "x402 dns.use.x402atlas.com",
      }),
      card({
        operationRef: "operation:v1:dns-b",
        capabilityId: "get.dns-atlas.whois",
        capability: "DNS & WHOIS Domain Lookup",
        supplierSlug: "atlas",
        supplierName: "x402 dns.use.x402atlas.com",
      }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.operations).toHaveLength(2);
    expect(grouped[0]?.providerCount).toBe(1);
  });
});

function card(
  overrides: Partial<OperationCardViewModel>,
): OperationCardViewModel {
  return {
    operationRef: "operation:v1:listing",
    title: "Amazon product search",
    summary: "Search Amazon listings and return structured results.",
    supplierName: "Glim",
    supplierSlug: "glim",
    supplierInitials: "GL",
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
      completedInvocations: 0,
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

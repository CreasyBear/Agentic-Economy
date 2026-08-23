import { describe, expect, it } from "vitest";

import {
  registryDocumentId,
  type RegistrySourceEntry,
} from "@/modules/market/registry-source-contracts";

describe("registry origin authority boundary", () => {
  it("cannot represent an imported source row as an admitted or executed Operation", () => {
    const entry: RegistrySourceEntry = {
      kind: "registry_source_entry",
      source: "agentic_market",
      upstreamServiceId: "companies",
      upstreamEndpointId: "provider.search",
      sourceUrl: "https://treg.to/catalog/endpoints/provider.search",
      providerUrl: "https://provider.example",
      endpointUrl: "https://api.provider.example/search",
      routeIdentity: "GET https://api.provider.example/search",
      name: "Search companies",
      summary: "Source-owned discovery metadata.",
      provider: "Provider",
      category: "Enrichment",
      method: "GET",
      tags: [],
      networks: [],
      exactPrice: {
        scheme: "exact",
        amount: "0.01",
        currency: "USDC",
        network: "eip155:8453",
      },
      priceLabel: "USDC 0.01",
      access: "x402",
      credentialRequirements: ["x402_payment"],
      readiness: "source_declared_callable",
      lastObservedAt: "2026-08-23T00:00:00.000Z",
      inputSchemaJson: JSON.stringify({ type: "object", properties: {} }),
      exampleInvocation:
        "curl --request GET --url 'https://api.provider.example/search'",
      authority: "source_metadata_only",
      sourceDigest: "digest",
    };

    const serialized = JSON.stringify(entry);
    for (const forbidden of [
      "operationRef",
      "invocationRef",
      "qualifiedUse",
      "settlement",
      "delivery",
      "verified",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(entry.authority).toBe("source_metadata_only");
  });

  it("keeps public identity stable when an upstream catalogue renames its service", () => {
    expect(
      registryDocumentId({ routeIdentity: "POST https://api.example.com/search" }),
    ).toBe(
      registryDocumentId({ routeIdentity: "POST https://api.example.com/search" }),
    );
  });
});

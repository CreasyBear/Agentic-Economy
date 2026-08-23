import { describe, expect, it } from "vitest";

import type { RegistrySourceEntry } from "@/modules/market/registry-source-contracts";

describe("registry origin authority boundary", () => {
  it("cannot represent an imported source row as an admitted or executed Operation", () => {
    const entry: RegistrySourceEntry = {
      kind: "registry_source_entry",
      source: "treg",
      upstreamServiceId: "companies",
      upstreamEndpointId: "provider.search",
      sourceUrl: "https://treg.to/catalog/endpoints/provider.search",
      name: "Search companies",
      summary: "Source-owned discovery metadata.",
      provider: "Provider",
      category: "Enrichment",
      method: "GET",
      tags: [],
      networks: [],
      access: "provider_account",
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
});

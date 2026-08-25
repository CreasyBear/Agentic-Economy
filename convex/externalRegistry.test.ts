/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Agentic Economy registry generations", () => {
  it("is replay-safe and activates a complete generation atomically", async () => {
    const backend = convexTest(schema, modules);
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "generation-1",
      startedAt: 1,
    });
    const firstEntry = entry("alpha");
    const entries = [firstEntry, tregEntry("beta")];
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "generation-1",
      entries,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "generation-1",
      entries,
    });

    expect(
      await backend.query(api.marketExternalRegistry.search, {
        query: "",
        access: "all",
        limit: 12,
        cursor: null,
      }),
    ).toMatchObject({ kind: "unavailable" });

    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "generation-1",
      completedAt: 2,
      expectedEntries: 2,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
      tregReported: 1,
      tregFetched: 1,
    });

    const result = await backend.query(api.marketExternalRegistry.search, {
      query: "search",
      access: "all",
      limit: 12,
      cursor: null,
    });
    expect(result).toMatchObject({
      kind: "ok",
      generation: "generation-1",
      coverage: {
        entries: 2,
      },
    });
    if (result.kind !== "ok") throw new Error("expected API registry");
    expect(result.page).toHaveLength(2);
    expect(JSON.stringify(result.page)).not.toContain("operationRef");
    expect(JSON.stringify(result.page)).not.toContain("probeRequest");
    expect(JSON.stringify(result.page)).not.toContain("sourceDigest");
    expect(result.page.every((item) => item.documentId.startsWith("registry:"))).toBe(true);
    expect(result.page[0]).not.toHaveProperty("source");
    expect(result.page[0]).not.toHaveProperty("upstreamServiceId");
    expect(result.page.some((item) => item.access === "provider_account")).toBe(true);

    const firstPage = await backend.query(api.marketExternalRegistry.search, {
      query: "",
      access: "all",
      limit: 1,
      cursor: null,
    });
    if (firstPage.kind !== "ok") throw new Error("expected first registry page");
    const secondPage = await backend.query(api.marketExternalRegistry.search, {
      query: "",
      access: "all",
      limit: 1,
      cursor: firstPage.continueCursor,
    });
    if (secondPage.kind !== "ok") throw new Error("expected second registry page");
    expect([
      ...firstPage.page.map((item) => item.documentId),
      ...secondPage.page.map((item) => item.documentId),
    ]).toEqual(entries.map((item) => item.documentId).sort());

    const detail = await backend.query(internal.marketExternalRegistry.entry, {
      documentId: firstEntry.documentId,
    });
    expect(detail).toMatchObject({
      kind: "found",
      entry: {
        documentId: firstEntry.documentId,
        authority: "registry_metadata_only",
      },
    });
    if (detail.kind !== "found") throw new Error("expected registry entry");
    expect(detail.entry).not.toHaveProperty("source");
    expect(detail.entry).not.toHaveProperty("upstreamEndpointId");

    await expect(
      backend.query(internal.marketExternalRegistry.admissionCandidate, {
        documentId: firstEntry.documentId,
        expectedSourceDigest: firstEntry.sourceDigest,
      }),
    ).resolves.toMatchObject({
      kind: "found",
      candidate: {
        documentId: firstEntry.documentId,
        sourceDigest: firstEntry.sourceDigest,
        probeRequest: firstEntry.probeRequest,
      },
    });
    await expect(
      backend.query(internal.marketExternalRegistry.admissionCandidate, {
        documentId: firstEntry.documentId,
        expectedSourceDigest: `sha256:${"f".repeat(64)}`,
      }),
    ).resolves.toEqual({ kind: "source_changed" });
    await expect(
      backend.query(internal.marketExternalRegistry.admissionCandidate, {
        documentId: entries[1]!.documentId,
        expectedSourceDigest: entries[1]!.sourceDigest,
      }),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      backend.query(internal.marketExternalRegistry.admissionCandidates, {
        generation: "generation-1",
        cursor: null,
        limit: 12,
      }),
    ).resolves.toMatchObject({
      kind: "page",
      candidates: [
        { documentId: entries[0]?.documentId },
      ],
      isDone: true,
    });
  });

  it("resolves same-route Agentic duplicates identically across batches and order", async () => {
    const preferred = duplicateAgenticEntry(
      "api.myceliasignal.com",
      `sha256:${"c".repeat(64)}`,
    );
    const alternate = duplicateAgenticEntry(
      "myceliasignal.com",
      `sha256:${"d".repeat(64)}`,
    );

    for (const [index, ordered] of [[preferred, alternate], [alternate, preferred]].entries()) {
      const backend = convexTest(schema, modules);
      const generation = `duplicate-order-${index}`;
      await backend.mutation(internal.marketExternalRegistry.begin, {
        generation,
        startedAt: index + 1,
      });
      await expect(backend.mutation(internal.marketExternalRegistry.writeBatch, {
        generation,
        entries: [ordered[0]!],
      })).resolves.toEqual({ inserted: 1, replayed: 0 });
      await expect(backend.mutation(internal.marketExternalRegistry.writeBatch, {
        generation,
        entries: [ordered[1]!],
      })).resolves.toEqual({ inserted: 0, replayed: 1 });

      const stored = await backend.run(async (ctx) => ({
        entry: await ctx.db
          .query("marketExternalRegistryEntries")
          .withIndex("by_generation_and_documentId", (query) =>
            query.eq("generation", generation).eq("documentId", preferred.documentId),
          )
          .unique(),
        generation: await ctx.db
          .query("marketExternalRegistryGenerations")
          .withIndex("by_generation", (query) => query.eq("generation", generation))
          .unique(),
      }));
      expect(stored.entry).toMatchObject({
        provider: preferred.provider,
        sourceDigest: preferred.sourceDigest,
      });
      expect(stored.generation?.ingestedCount).toBe(1);
    }
  });

  it("retains hard conflicts for TREG and differing Agentic route identities", async () => {
    const tregBackend = convexTest(schema, modules);
    await tregBackend.mutation(internal.marketExternalRegistry.begin, {
      generation: "treg-conflict",
      startedAt: 1,
    });
    const treg = tregEntry("beta");
    await tregBackend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "treg-conflict",
      entries: [treg],
    });
    await expect(tregBackend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "treg-conflict",
      entries: [{ ...treg, sourceDigest: `sha256:${"e".repeat(64)}` }],
    })).rejects.toThrow("external_registry_generation_identity_conflict");

    const routeBackend = convexTest(schema, modules);
    await routeBackend.mutation(internal.marketExternalRegistry.begin, {
      generation: "route-conflict",
      startedAt: 1,
    });
    const original = entry("alpha");
    await routeBackend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "route-conflict",
      entries: [original],
    });
    const conflictingUrl = "https://api.example.com/different";
    await expect(routeBackend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "route-conflict",
      entries: [{
        ...original,
        endpointUrl: conflictingUrl,
        routeIdentity: `GET ${conflictingUrl}`,
        probeRequest: { method: "GET" as const, url: conflictingUrl, headers: [] },
      }],
    })).rejects.toThrow("external_registry_generation_identity_conflict");
  });

  it("preserves the last-known-good generation when a refresh is incomplete", async () => {
    const backend = convexTest(schema, modules);
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "good",
      startedAt: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "good",
      entries: [entry("alpha"), tregEntry("beta")],
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "good",
      completedAt: 2,
      expectedEntries: 2,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
      tregReported: 1,
      tregFetched: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "partial",
      startedAt: 3,
    });
    await backend.mutation(internal.marketExternalRegistry.fail, {
      generation: "partial",
      failedAt: 4,
      reason: "treg:deadline_reached",
    });

    const result = await backend.query(api.marketExternalRegistry.search, {
      query: "",
      access: "all",
      limit: 12,
      cursor: null,
    });
    expect(result).toMatchObject({ kind: "ok", generation: "good" });
  });

  it("persists concrete same-origin path and query probe URLs", async () => {
    const backend = convexTest(schema, modules);
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "concrete-probes",
      startedAt: 1,
    });
    const pathEndpoint = "https://api.example.com/users/{userId}";
    const queryEndpoint = "https://api.example.com/search";
    const pathEntry = {
      ...entry("alpha"),
      endpointUrl: pathEndpoint,
      routeIdentity: `GET ${pathEndpoint}`,
      probeRequest: {
        method: "GET" as const,
        url: "https://api.example.com/users/example-user",
        headers: [],
      },
    };
    const queryEntry = {
      ...entry("beta"),
      endpointUrl: queryEndpoint,
      routeIdentity: `GET ${queryEndpoint}`,
      probeRequest: {
        method: "GET" as const,
        url: "https://api.example.com/search?q=example",
        headers: [],
      },
    };

    await expect(backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "concrete-probes",
      entries: [pathEntry, queryEntry],
    })).resolves.toEqual({ inserted: 2, replayed: 0 });
  });

  it("refuses cross-origin, malformed, unsafe-scheme, and method-mismatched probes", async () => {
    const invalidProbes = [
      { method: "GET" as const, url: "https://other.example.com/alpha", headers: [] },
      { method: "GET" as const, url: "not-a-url", headers: [] },
      { method: "GET" as const, url: "file:///tmp/alpha", headers: [] },
      { method: "POST" as const, url: "https://api.example.com/alpha", headers: [] },
    ];

    for (const [index, probeRequest] of invalidProbes.entries()) {
      const backend = convexTest(schema, modules);
      const generation = `invalid-probe-${index}`;
      await backend.mutation(internal.marketExternalRegistry.begin, {
        generation,
        startedAt: index + 1,
      });
      await expect(backend.mutation(internal.marketExternalRegistry.writeBatch, {
        generation,
        entries: [{ ...entry("alpha"), probeRequest }],
      })).rejects.toThrow("external_registry_batch_invalid");
    }
  });

  it("withdraws entries absent from the next complete generation", async () => {
    const backend = convexTest(schema, modules);
    const firstEntries = [entry("alpha"), entry("beta")];
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "first",
      startedAt: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "first",
      entries: firstEntries,
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "first",
      completedAt: 2,
      expectedEntries: 2,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
    });

    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "second",
      startedAt: 3,
    });
    const retainedEntry = firstEntries[0];
    if (retainedEntry === undefined) throw new Error("expected retained registry entry");
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "second",
      entries: [retainedEntry],
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "second",
      completedAt: 4,
      expectedEntries: 1,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
    });

    const result = await backend.query(api.marketExternalRegistry.search, {
      query: "",
      access: "all",
      limit: 12,
      cursor: null,
    });
    expect(result).toMatchObject({ kind: "ok", generation: "second" });
    if (result.kind !== "ok") throw new Error("expected active registry");
    expect(result.page).toHaveLength(1);
    expect(result.page[0]?.name).toContain("alpha");
  });

  it("does not let an older concurrent refresh replace a newer generation", async () => {
    const backend = convexTest(schema, modules);
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "older",
      startedAt: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "older",
      entries: [entry("alpha")],
    });
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "newer",
      startedAt: 2,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "newer",
      entries: [entry("beta")],
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "newer",
      completedAt: 3,
      expectedEntries: 1,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "older",
      completedAt: 4,
      expectedEntries: 1,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
    });

    const result = await backend.query(api.marketExternalRegistry.search, {
      query: "",
      access: "all",
      limit: 12,
      cursor: null,
    });
    expect(result).toMatchObject({ kind: "ok", generation: "newer" });
  });
});

function entry(id: string) {
  const endpointUrl = `https://api.example.com/${id}`;
  return {
    documentId: `registry:${(id === "alpha" ? "a" : "b").repeat(64)}`,
    source: "agentic_market" as const,
    upstreamServiceId: "service",
    upstreamEndpointId: id,
    sourceUrl: `https://example.com/${id}`,
    providerUrl: "https://example.com",
    endpointUrl,
    routeIdentity: `GET ${endpointUrl}`,
    name: `${id} search`,
    summary: "Search public data",
    provider: `${id} provider`,
    category: "Search",
    method: "GET" as const,
    tags: ["search"],
    networks: [],
    exactPrice: {
      scheme: "exact" as const,
      amount: "0.01",
      currency: "USDC",
      network: "eip155:8453",
    },
    priceLabel: "USDC 0.01",
    access: "x402" as const,
    credentialRequirements: ["x402_payment" as const],
    readiness: "source_declared_callable" as const,
    lastObservedAt: "2026-08-23T00:00:00.000Z",
    inputSchemaJson: JSON.stringify({ type: "object", properties: {} }),
    exampleInvocation: `curl --request GET --url '${endpointUrl}'`,
    probeRequest: { method: "GET" as const, url: endpointUrl, headers: [] },
    quality: "callable" as const,
    authority: "source_metadata_only" as const,
    sourceDigest: `sha256:${"a".repeat(64)}`,
    searchText: `${id} search public data provider`,
  };
}

function duplicateAgenticEntry(provider: string, sourceDigest: string) {
  return {
    ...entry("alpha"),
    upstreamServiceId: provider,
    provider,
    sourceCalls30d: "366",
    sourcePayers30d: "10",
    sourceDigest,
  };
}

function tregEntry(id: string) {
  return {
    documentId: `registry:${"b".repeat(64)}`,
    source: "treg" as const,
    upstreamServiceId: "service",
    upstreamEndpointId: id,
    sourceUrl: `https://treg.to/catalog/endpoints/${id}`,
    docsUrl: "https://example.com/docs",
    name: `${id} search`,
    summary: "Search public data",
    provider: `${id} provider`,
    category: "Search",
    method: "GET" as const,
    tags: ["search"],
    networks: [],
    priceLabel: "1 credit",
    access: "provider_account" as const,
    authority: "source_metadata_only" as const,
    sourceDigest: `sha256:${"b".repeat(64)}`,
    searchText: `${id} search public data provider`,
  };
}

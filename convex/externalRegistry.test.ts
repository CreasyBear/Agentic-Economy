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
    const entries = [entry("agentic_market", "alpha"), entry("treg", "beta")];
    const firstEntry = entries[0];
    if (firstEntry === undefined) throw new Error("expected first registry entry");
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
    expect(result.page.every((item) => item.documentId.startsWith("registry:"))).toBe(true);
    expect(result.page[0]).not.toHaveProperty("source");
    expect(result.page[0]).not.toHaveProperty("upstreamServiceId");

    const detail = await backend.query(api.marketExternalRegistry.entry, {
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
  });

  it("preserves the last-known-good generation when a refresh is incomplete", async () => {
    const backend = convexTest(schema, modules);
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "good",
      startedAt: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "good",
      entries: [entry("agentic_market", "alpha")],
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "good",
      completedAt: 2,
      expectedEntries: 1,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
      tregReported: 0,
      tregFetched: 0,
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

  it("withdraws entries absent from the next complete generation", async () => {
    const backend = convexTest(schema, modules);
    const firstEntries = [entry("agentic_market", "alpha"), entry("treg", "beta")];
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
      tregReported: 1,
      tregFetched: 1,
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
      tregReported: 0,
      tregFetched: 0,
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
      entries: [entry("agentic_market", "alpha")],
    });
    await backend.mutation(internal.marketExternalRegistry.begin, {
      generation: "newer",
      startedAt: 2,
    });
    await backend.mutation(internal.marketExternalRegistry.writeBatch, {
      generation: "newer",
      entries: [entry("treg", "beta")],
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "newer",
      completedAt: 3,
      expectedEntries: 1,
      agenticMarketReported: 0,
      agenticMarketFetched: 0,
      tregReported: 1,
      tregFetched: 1,
    });
    await backend.mutation(internal.marketExternalRegistry.finalize, {
      generation: "older",
      completedAt: 4,
      expectedEntries: 1,
      agenticMarketReported: 1,
      agenticMarketFetched: 1,
      tregReported: 0,
      tregFetched: 0,
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

function entry(source: "agentic_market" | "treg", id: string) {
  const endpointUrl = `https://api.example.com/${id}`;
  return {
    documentId: `registry:${(id === "alpha" ? "a" : "b").repeat(64)}`,
    source,
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
    method: "GET",
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
    quality: "callable" as const,
    authority: "source_metadata_only" as const,
    sourceDigest: `sha256:${"a".repeat(64)}`,
    searchText: `${id} search public data provider`,
  };
}

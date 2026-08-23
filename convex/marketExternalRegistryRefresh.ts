import { v } from "convex/values";

import {
  registryDocumentId,
  type RegistrySourceEntry,
} from "@/modules/market/registry-source-contracts";
import {
  fetchAgenticMarketCatalog,
  fetchTregCatalog,
} from "@/modules/market/registry-source-adapters";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const WRITE_BATCH_SIZE = 50;

export const run = internalAction({
  args: {},
  returns: v.object({
    kind: v.union(v.literal("refreshed"), v.literal("preserved")),
    generation: v.string(),
    entries: v.number(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const startedAt = Date.now();
    const generation = `registry-${startedAt}-${crypto.randomUUID()}`;
    await ctx.runMutation(internal.marketExternalRegistry.begin, {
      generation,
      startedAt,
    });
    try {
      const [agenticMarket, treg] = await Promise.all([
        fetchAgenticMarketCatalog({ jobTimeoutMs: 300_000 }),
        fetchTregCatalog({ jobTimeoutMs: 300_000 }),
      ]);
      if (!agenticMarket.complete || !treg.complete) {
        const reason = [
          ...(agenticMarket.complete
            ? []
            : [`agentic_market:${agenticMarket.incompleteReason ?? "incomplete"}`]),
          ...(treg.complete
            ? []
            : [`treg:${treg.incompleteReason ?? "incomplete"}`]),
        ].join(",");
        await ctx.runMutation(internal.marketExternalRegistry.fail, {
          generation,
          failedAt: Date.now(),
          reason,
        });
        return { kind: "preserved" as const, generation, entries: 0, reason };
      }
      const entries = deduplicateEntries([
        ...agenticMarket.entries,
        ...treg.entries,
      ]);
      for (let offset = 0; offset < entries.length; offset += WRITE_BATCH_SIZE) {
        await ctx.runMutation(internal.marketExternalRegistry.writeBatch, {
          generation,
          entries: entries
            .slice(offset, offset + WRITE_BATCH_SIZE)
            .map(toPersistedEntry),
        });
      }
      await ctx.runMutation(internal.marketExternalRegistry.finalize, {
        generation,
        completedAt: Date.now(),
        expectedEntries: entries.length,
        agenticMarketReported: agenticMarket.sourceReportedCount,
        agenticMarketFetched: agenticMarket.fetchedServiceCount ?? 0,
        tregReported: treg.sourceReportedCount,
        tregFetched: treg.entries.length,
      });
      return {
        kind: "refreshed" as const,
        generation,
        entries: entries.length,
      };
    } catch (error) {
      const reason = publicFailureReason(error);
      await ctx.runMutation(internal.marketExternalRegistry.fail, {
        generation,
        failedAt: Date.now(),
        reason,
      });
      return { kind: "preserved" as const, generation, entries: 0, reason };
    }
  },
});

function deduplicateEntries(
  entries: readonly RegistrySourceEntry[],
): RegistrySourceEntry[] {
  const byDocumentId = new Map<string, RegistrySourceEntry>();
  for (const entry of entries) {
    const documentId = registryDocumentId(entry);
    const existing = byDocumentId.get(documentId);
    if (existing !== undefined && existing.sourceDigest !== entry.sourceDigest) {
      throw new Error("external_registry_source_identity_conflict");
    }
    byDocumentId.set(documentId, entry);
  }
  return [...byDocumentId.values()].sort((left, right) =>
    registryDocumentId(left).localeCompare(registryDocumentId(right)),
  );
}

function toPersistedEntry(entry: RegistrySourceEntry) {
  return {
    documentId: registryDocumentId(entry),
    source: entry.source,
    upstreamServiceId: entry.upstreamServiceId,
    upstreamEndpointId: entry.upstreamEndpointId,
    sourceUrl: entry.sourceUrl,
    ...(entry.endpointUrl === undefined ? {} : { endpointUrl: entry.endpointUrl }),
    ...(entry.docsUrl === undefined ? {} : { docsUrl: entry.docsUrl }),
    name: entry.name,
    summary: entry.summary,
    provider: entry.provider,
    category: entry.category,
    ...(entry.capability === undefined ? {} : { capability: entry.capability }),
    ...(entry.method === undefined ? {} : { method: entry.method }),
    tags: [...entry.tags],
    networks: [...entry.networks],
    ...(entry.priceLabel === undefined ? {} : { priceLabel: entry.priceLabel }),
    access: entry.access,
    ...(entry.sourceCheckedAt === undefined
      ? {}
      : { sourceCheckedAt: entry.sourceCheckedAt }),
    ...(entry.sourceCalls30d === undefined
      ? {}
      : { sourceCalls30d: entry.sourceCalls30d }),
    ...(entry.sourcePayers30d === undefined
      ? {}
      : { sourcePayers30d: entry.sourcePayers30d }),
    ...(entry.sourceMedianLatencyMs === undefined
      ? {}
      : { sourceMedianLatencyMs: entry.sourceMedianLatencyMs }),
    ...(entry.sourceP95LatencyMs === undefined
      ? {}
      : { sourceP95LatencyMs: entry.sourceP95LatencyMs }),
    ...(entry.sourceSampleSize === undefined
      ? {}
      : { sourceSampleSize: entry.sourceSampleSize }),
    authority: entry.authority,
    sourceDigest: entry.sourceDigest,
    searchText: searchDocument(entry),
  };
}

function searchDocument(entry: RegistrySourceEntry): string {
  return [
    entry.name,
    entry.summary,
    entry.provider,
    entry.category,
    entry.capability,
    entry.method,
    entry.upstreamServiceId,
    entry.upstreamEndpointId,
    ...entry.tags,
    ...entry.networks,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .slice(0, 8_000);
}

function publicFailureReason(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message.slice(0, 500);
  }
  return "external_registry_refresh_failed";
}

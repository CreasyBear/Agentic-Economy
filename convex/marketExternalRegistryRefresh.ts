import { v } from "convex/values";

import {
  registryDocumentId,
  type RegistrySourceEntry,
} from "@/modules/market/registry-source-contracts";
import {
  fetchAgenticMarketCatalog,
} from "@/modules/market/registry-source-adapters";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

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
      let insertedEntries = 0;
      const agenticMarket = await fetchAgenticMarketCatalog({
        jobTimeoutMs: 300_000,
        onEntries: async (sourceEntries) => {
          const written = await ctx.runMutation(
            internal.marketExternalRegistry.writeBatch,
            {
              generation,
              entries: sourceEntries.map(toPersistedEntry),
            },
          );
          insertedEntries += written.inserted;
        },
      });
      if (!agenticMarket.complete) {
        const reason = `agentic_market:${agenticMarket.incompleteReason ?? "incomplete"}`;
        await ctx.runMutation(internal.marketExternalRegistry.fail, {
          generation,
          failedAt: Date.now(),
          reason,
        });
        return { kind: "preserved" as const, generation, entries: 0, reason };
      }
      await ctx.runMutation(internal.marketExternalRegistry.finalize, {
        generation,
        completedAt: Date.now(),
        expectedEntries: insertedEntries,
        agenticMarketReported: agenticMarket.sourceReportedCount,
        agenticMarketFetched: agenticMarket.fetchedServiceCount ?? 0,
      });
      await ctx.scheduler.runAfter(0, internal.marketRegistryGraduation.sweep, {
        generation,
        cursor: null,
      });
      return {
        kind: "refreshed" as const,
        generation,
        entries: insertedEntries,
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

function toPersistedEntry(entry: RegistrySourceEntry) {
  return {
    documentId: registryDocumentId(entry),
    source: entry.source,
    upstreamServiceId: entry.upstreamServiceId,
    upstreamEndpointId: entry.upstreamEndpointId,
    sourceUrl: entry.sourceUrl,
    ...(entry.providerUrl === undefined ? {} : { providerUrl: entry.providerUrl }),
    endpointUrl: entry.endpointUrl,
    ...(entry.docsUrl === undefined ? {} : { docsUrl: entry.docsUrl }),
    routeIdentity: entry.routeIdentity,
    name: entry.name,
    summary: entry.summary,
    provider: entry.provider,
    category: entry.category,
    ...(entry.capability === undefined ? {} : { capability: entry.capability }),
    method: entry.method,
    tags: [...entry.tags],
    networks: [...entry.networks],
    priceLabel: entry.priceLabel,
    exactPrice: entry.exactPrice,
    access: entry.access,
    credentialRequirements: [...entry.credentialRequirements],
    readiness: entry.readiness,
    lastObservedAt: entry.lastObservedAt,
    ...(entry.lastVerifiedAt === undefined
      ? {}
      : { lastVerifiedAt: entry.lastVerifiedAt }),
    inputSchemaJson: entry.inputSchemaJson,
    exampleInvocation: entry.exampleInvocation,
    probeRequest: {
      ...entry.probeRequest,
      headers: entry.probeRequest.headers.map((header) => ({ ...header })),
    },
    quality: "callable" as const,
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
    entry.routeIdentity,
    entry.exactPrice.currency,
    entry.exactPrice.network,
    ...entry.credentialRequirements,
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

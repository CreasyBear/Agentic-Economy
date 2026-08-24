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
      let insertedEntries = 0;
      const [agenticMarket, treg] = await Promise.all([
        fetchAgenticMarketCatalog({
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
        }),
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
      for (let offset = 0; offset < treg.entries.length; offset += WRITE_BATCH_SIZE) {
        const written = await ctx.runMutation(
          internal.marketExternalRegistry.writeBatch,
          {
            generation,
            entries: treg.entries
              .slice(offset, offset + WRITE_BATCH_SIZE)
              .map(toPersistedEntry),
          },
        );
        insertedEntries += written.inserted;
      }
      await ctx.runMutation(internal.marketExternalRegistry.finalize, {
        generation,
        completedAt: Date.now(),
        expectedEntries: insertedEntries,
        agenticMarketReported: agenticMarket.sourceReportedCount,
        agenticMarketFetched: agenticMarket.fetchedServiceCount ?? 0,
        tregReported: treg.sourceReportedCount,
        tregFetched: treg.entries.length,
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
  const common = {
    documentId: registryDocumentId(entry),
    upstreamServiceId: entry.upstreamServiceId,
    upstreamEndpointId: entry.upstreamEndpointId,
    sourceUrl: entry.sourceUrl,
    ...(entry.providerUrl === undefined ? {} : { providerUrl: entry.providerUrl }),
    ...(entry.docsUrl === undefined ? {} : { docsUrl: entry.docsUrl }),
    name: entry.name,
    summary: entry.summary,
    provider: entry.provider,
    category: entry.category,
    ...(entry.capability === undefined ? {} : { capability: entry.capability }),
    tags: [...entry.tags],
    networks: [...entry.networks],
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
  if (entry.source === "treg") {
    return {
      ...common,
      source: "treg" as const,
      access: "provider_account" as const,
      ...(entry.endpointUrl === undefined ? {} : { endpointUrl: entry.endpointUrl }),
      ...(entry.routeIdentity === undefined
        ? {}
        : { routeIdentity: entry.routeIdentity }),
      ...(entry.method === undefined ? {} : { method: entry.method }),
      ...(entry.priceLabel === undefined ? {} : { priceLabel: entry.priceLabel }),
      ...(entry.exactPrice === undefined ? {} : { exactPrice: entry.exactPrice }),
    };
  }
  return {
    ...common,
    source: "agentic_market" as const,
    access: "x402" as const,
    endpointUrl: entry.endpointUrl,
    routeIdentity: entry.routeIdentity,
    method: entry.method,
    priceLabel: entry.priceLabel,
    exactPrice: entry.exactPrice,
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
    entry.exactPrice?.currency,
    entry.exactPrice?.network,
    ...(entry.credentialRequirements ?? []),
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

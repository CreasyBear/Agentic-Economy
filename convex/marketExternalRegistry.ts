import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const sourceValue = v.union(v.literal("agentic_market"), v.literal("treg"));
const accessValue = v.union(
  v.literal("x402"),
  v.literal("provider_account"),
  v.literal("unknown"),
);
const entryInputValue = v.object({
  documentId: v.string(),
  source: sourceValue,
  upstreamServiceId: v.string(),
  upstreamEndpointId: v.string(),
  sourceUrl: v.string(),
  endpointUrl: v.optional(v.string()),
  docsUrl: v.optional(v.string()),
  name: v.string(),
  summary: v.string(),
  provider: v.string(),
  category: v.string(),
  capability: v.optional(v.string()),
  method: v.optional(v.string()),
  tags: v.array(v.string()),
  networks: v.array(v.string()),
  priceLabel: v.optional(v.string()),
  access: accessValue,
  sourceCheckedAt: v.optional(v.string()),
  sourceCalls30d: v.optional(v.string()),
  sourcePayers30d: v.optional(v.string()),
  sourceMedianLatencyMs: v.optional(v.number()),
  sourceP95LatencyMs: v.optional(v.number()),
  sourceSampleSize: v.optional(v.number()),
  authority: v.literal("source_metadata_only"),
  sourceDigest: v.string(),
  searchText: v.string(),
});
const publicEntryValue = v.object({
  documentId: v.string(),
  sourceUrl: v.string(),
  endpointUrl: v.optional(v.string()),
  docsUrl: v.optional(v.string()),
  name: v.string(),
  summary: v.string(),
  provider: v.string(),
  category: v.string(),
  capability: v.optional(v.string()),
  method: v.optional(v.string()),
  tags: v.array(v.string()),
  networks: v.array(v.string()),
  priceLabel: v.optional(v.string()),
  access: accessValue,
  sourceCheckedAt: v.optional(v.string()),
  sourceCalls30d: v.optional(v.string()),
  sourcePayers30d: v.optional(v.string()),
  sourceMedianLatencyMs: v.optional(v.number()),
  sourceP95LatencyMs: v.optional(v.number()),
  sourceSampleSize: v.optional(v.number()),
  authority: v.literal("registry_metadata_only"),
});
const coverageValue = v.object({
  entries: v.number(),
  completedAt: v.number(),
});
const searchResultValue = v.union(
  v.object({ kind: v.literal("unavailable") }),
  v.object({
    kind: v.literal("ok"),
    generation: v.string(),
    coverage: coverageValue,
    page: v.array(publicEntryValue),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
);
const entryResultValue = v.union(
  v.object({ kind: v.literal("found"), entry: publicEntryValue }),
  v.object({ kind: v.literal("not_found") }),
  v.object({ kind: v.literal("unavailable") }),
);

const MAX_BATCH_ENTRIES = 50;
const MAX_ENTRY_BYTES = 32_768;
const encoder = new TextEncoder();

export const begin = internalMutation({
  args: { generation: v.string(), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertGeneration(args.generation);
    const existing = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", args.generation),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("marketExternalRegistryGenerations", {
        generation: args.generation,
        status: "refreshing",
        startedAt: args.startedAt,
        ingestedCount: 0,
      });
    } else if (existing.status !== "refreshing") {
      throw new Error("external_registry_generation_not_refreshable");
    }
    const state = await registryState(ctx);
    if (state !== null && state.lastAttemptAt > args.startedAt) return null;
    const next = {
      key: "registry" as const,
      ...(state?.activeGeneration === undefined
        ? {}
        : { activeGeneration: state.activeGeneration }),
      lastAttemptAt: args.startedAt,
      lastAttemptStatus: "refreshing" as const,
    };
    if (state === null) await ctx.db.insert("marketExternalRegistryState", next);
    else await ctx.db.replace(state._id, next);
    return null;
  },
});

export const writeBatch = internalMutation({
  args: { generation: v.string(), entries: v.array(entryInputValue) },
  returns: v.object({ inserted: v.number(), replayed: v.number() }),
  handler: async (ctx, args) => {
    if (
      args.entries.length === 0 ||
      args.entries.length > MAX_BATCH_ENTRIES ||
      args.entries.some((entry) => !validEntry(entry))
    ) {
      throw new Error("external_registry_batch_invalid");
    }
    const generation = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", args.generation),
      )
      .unique();
    if (generation === null || generation.status !== "refreshing") {
      throw new Error("external_registry_generation_not_refreshing");
    }
    let inserted = 0;
    let replayed = 0;
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("marketExternalRegistryEntries")
        .withIndex("by_generation_and_documentId", (index) =>
          index
            .eq("generation", args.generation)
            .eq("documentId", entry.documentId),
        )
        .unique();
      if (existing !== null) {
        if (existing.sourceDigest !== entry.sourceDigest) {
          throw new Error("external_registry_generation_identity_conflict");
        }
        replayed += 1;
        continue;
      }
      await ctx.db.insert("marketExternalRegistryEntries", {
        generation: args.generation,
        ...entry,
        updatedAt: Date.now(),
      });
      inserted += 1;
    }
    if (inserted > 0) {
      await ctx.db.patch(generation._id, {
        ingestedCount: generation.ingestedCount + inserted,
      });
    }
    return { inserted, replayed };
  },
});

export const finalize = internalMutation({
  args: {
    generation: v.string(),
    completedAt: v.number(),
    expectedEntries: v.number(),
    agenticMarketReported: v.number(),
    agenticMarketFetched: v.number(),
    tregReported: v.number(),
    tregFetched: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const generation = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", args.generation),
      )
      .unique();
    if (
      generation === null ||
      generation.status !== "refreshing" ||
      generation.ingestedCount !== args.expectedEntries ||
      !validCoverage(args)
    ) {
      throw new Error("external_registry_generation_incomplete");
    }
    await ctx.db.patch(generation._id, {
      status: "complete",
      completedAt: args.completedAt,
      agenticMarketReported: args.agenticMarketReported,
      agenticMarketFetched: args.agenticMarketFetched,
      tregReported: args.tregReported,
      tregFetched: args.tregFetched,
    });
    const state = await registryState(ctx);
    if (state !== null && state.lastAttemptAt > generation.startedAt) {
      await scheduleGenerationCleanup(ctx, args.generation);
      return null;
    }
    const previousActiveGeneration = state?.activeGeneration;
    const next = {
      key: "registry" as const,
      activeGeneration: args.generation,
      lastAttemptAt: args.completedAt,
      lastAttemptStatus: "complete" as const,
    };
    if (state === null) await ctx.db.insert("marketExternalRegistryState", next);
    else await ctx.db.replace(state._id, next);
    if (
      previousActiveGeneration !== undefined &&
      previousActiveGeneration !== args.generation
    ) {
      await scheduleGenerationCleanup(ctx, previousActiveGeneration);
    }
    return null;
  },
});

export const fail = internalMutation({
  args: {
    generation: v.string(),
    failedAt: v.number(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const generation = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", args.generation),
      )
      .unique();
    const shouldCleanup = generation !== null && generation.status === "refreshing";
    if (shouldCleanup) {
      await ctx.db.patch(generation._id, {
        status: "failed",
        failedAt: args.failedAt,
        failureReason: args.reason.slice(0, 500),
      });
    }
    const state = await registryState(ctx);
    if (state !== null && generation !== null && state.lastAttemptAt > generation.startedAt) {
      if (shouldCleanup) await scheduleGenerationCleanup(ctx, args.generation);
      return null;
    }
    const next = {
      key: "registry" as const,
      ...(state?.activeGeneration === undefined
        ? {}
        : { activeGeneration: state.activeGeneration }),
      lastAttemptAt: args.failedAt,
      lastAttemptStatus: "failed" as const,
      lastError: args.reason.slice(0, 500),
    };
    if (state === null) await ctx.db.insert("marketExternalRegistryState", next);
    else await ctx.db.replace(state._id, next);
    if (shouldCleanup) await scheduleGenerationCleanup(ctx, args.generation);
    return null;
  },
});

export const deleteGenerationBatch = internalMutation({
  args: { generation: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await registryState(ctx);
    if (state?.activeGeneration === args.generation) return null;

    const rows = await ctx.db
      .query("marketExternalRegistryEntries")
      .withIndex("by_generation_and_documentId", (index) =>
        index.eq("generation", args.generation),
      )
      .take(100);
    await Promise.all(rows.map(async (row) => await ctx.db.delete(row._id)));
    if (rows.length === 100) {
      await scheduleGenerationCleanup(ctx, args.generation);
      return null;
    }

    const generation = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", args.generation),
      )
      .unique();
    if (generation !== null) await ctx.db.delete(generation._id);
    return null;
  },
});

export const search = query({
  args: {
    query: v.string(),
    access: v.union(accessValue, v.literal("all")),
    limit: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: searchResultValue,
  handler: async (ctx, args) => {
    if (args.query.length > 200 || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
      throw new Error("external_registry_search_invalid");
    }
    const state = await registryState(ctx);
    if (state?.activeGeneration === undefined) return { kind: "unavailable" as const };
    const activeGeneration = state.activeGeneration;
    const generation = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", activeGeneration),
      )
      .unique();
    if (generation === null || generation.status !== "complete") {
      return { kind: "unavailable" as const };
    }
    const pagination = { cursor: args.cursor, numItems: args.limit };
    const normalizedQuery = args.query.trim();
    const selectedAccess = args.access === "all" ? undefined : args.access;
    const page = normalizedQuery === ""
      ? selectedAccess === undefined
        ? await ctx.db
            .query("marketExternalRegistryEntries")
            .withIndex("by_generation_and_documentId", (index) =>
              index.eq("generation", activeGeneration),
            )
            .paginate(pagination)
        : await ctx.db
            .query("marketExternalRegistryEntries")
            .withIndex("by_generation_access_and_documentId", (index) =>
              index
                .eq("generation", activeGeneration)
                .eq("access", selectedAccess),
            )
            .paginate(pagination)
      : selectedAccess === undefined
        ? await ctx.db
            .query("marketExternalRegistryEntries")
            .withSearchIndex("search_searchText_by_generation_source", (search) =>
              search
                .search("searchText", normalizedQuery)
                .eq("generation", activeGeneration),
            )
            .paginate(pagination)
        : await ctx.db
            .query("marketExternalRegistryEntries")
            .withSearchIndex("search_searchText_by_generation_source", (search) =>
              search
                .search("searchText", normalizedQuery)
                .eq("generation", activeGeneration)
                .eq("access", selectedAccess),
            )
            .paginate(pagination);
    return {
      kind: "ok" as const,
      generation: generation.generation,
      coverage: {
        entries: generation.ingestedCount,
        completedAt: generation.completedAt ?? generation.startedAt,
      },
      page: page.page.map(publicEntry),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const entry = query({
  args: { documentId: v.string() },
  returns: entryResultValue,
  handler: async (ctx, args) => {
    if (!/^registry:[0-9a-f]{64}$/u.test(args.documentId)) {
      return { kind: "not_found" as const };
    }
    const state = await registryState(ctx);
    if (state?.activeGeneration === undefined) {
      return { kind: "unavailable" as const };
    }
    const activeGeneration = state.activeGeneration;
    const generation = await ctx.db
      .query("marketExternalRegistryGenerations")
      .withIndex("by_generation", (index) =>
        index.eq("generation", activeGeneration),
      )
      .unique();
    if (generation === null || generation.status !== "complete") {
      return { kind: "unavailable" as const };
    }
    const row = await ctx.db
      .query("marketExternalRegistryEntries")
      .withIndex("by_generation_and_documentId", (index) =>
        index
          .eq("generation", activeGeneration)
          .eq("documentId", args.documentId),
      )
      .unique();
    return row === null
      ? { kind: "not_found" as const }
      : { kind: "found" as const, entry: publicEntry(row) };
  },
});

function publicEntry(row: Doc<"marketExternalRegistryEntries">) {
  return {
    documentId: row.documentId,
    sourceUrl: row.sourceUrl,
    ...(row.endpointUrl === undefined ? {} : { endpointUrl: row.endpointUrl }),
    ...(row.docsUrl === undefined ? {} : { docsUrl: row.docsUrl }),
    name: row.name,
    summary: row.summary,
    provider: row.provider,
    category: row.category,
    ...(row.capability === undefined ? {} : { capability: row.capability }),
    ...(row.method === undefined ? {} : { method: row.method }),
    tags: row.tags,
    networks: row.networks,
    ...(row.priceLabel === undefined ? {} : { priceLabel: row.priceLabel }),
    access: row.access,
    ...(row.sourceCheckedAt === undefined ? {} : { sourceCheckedAt: row.sourceCheckedAt }),
    ...(row.sourceCalls30d === undefined ? {} : { sourceCalls30d: row.sourceCalls30d }),
    ...(row.sourcePayers30d === undefined ? {} : { sourcePayers30d: row.sourcePayers30d }),
    ...(row.sourceMedianLatencyMs === undefined ? {} : { sourceMedianLatencyMs: row.sourceMedianLatencyMs }),
    ...(row.sourceP95LatencyMs === undefined ? {} : { sourceP95LatencyMs: row.sourceP95LatencyMs }),
    ...(row.sourceSampleSize === undefined ? {} : { sourceSampleSize: row.sourceSampleSize }),
    authority: "registry_metadata_only" as const,
  };
}

async function registryState(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("marketExternalRegistryState")
    .withIndex("by_key", (index) => index.eq("key", "registry"))
    .unique();
}

async function scheduleGenerationCleanup(
  ctx: MutationCtx,
  generation: string,
): Promise<void> {
  await ctx.scheduler.runAfter(
    0,
    internal.marketExternalRegistry.deleteGenerationBatch,
    { generation },
  );
}

function validEntry(entry: {
  documentId: string;
  sourceDigest: string;
  tags: string[];
  networks: string[];
  searchText: string;
}): boolean {
  const serialized = JSON.stringify(entry);
  return (
    entry.documentId.length > 0 &&
    entry.documentId.length <= 1_000 &&
    /^sha256:[0-9a-f]{64}$/u.test(entry.sourceDigest) &&
    entry.tags.length <= 50 &&
    entry.networks.length <= 40 &&
    entry.searchText.length <= 8_000 &&
    encoder.encode(serialized).byteLength <= MAX_ENTRY_BYTES
  );
}

function validCoverage(args: {
  expectedEntries: number;
  agenticMarketReported: number;
  agenticMarketFetched: number;
  tregReported: number;
  tregFetched: number;
}): boolean {
  return [
    args.expectedEntries,
    args.agenticMarketReported,
    args.agenticMarketFetched,
    args.tregReported,
    args.tregFetched,
  ].every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  );
}

function assertGeneration(value: string): void {
  if (value.length < 1 || value.length > 200) {
    throw new Error("external_registry_generation_invalid");
  }
}

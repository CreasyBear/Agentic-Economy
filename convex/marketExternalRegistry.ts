import { v } from "convex/values";

import { resolveAgenticMarketRouteWinner } from "@/modules/market/registry-launch-cohort";

import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";

import {
  accessValue,
  admissionCandidateResultValue,
  admissionCandidatesResultValue,
  entryInputValue,
  entryResultValue,
  searchResultValue,
} from './lib/marketExternalRegistry/contracts'
import {
  assertGeneration,
  publicEntry,
  registryState,
  scheduleGenerationCleanup,
  validCoverage,
  validEntry,
} from './lib/marketExternalRegistry/validation'

const MAX_BATCH_ENTRIES = 50;
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
        if (
          existing.source !== entry.source ||
          existing.routeIdentity !== entry.routeIdentity
        ) {
          throw new Error("external_registry_generation_identity_conflict");
        }
        if (existing.sourceDigest !== entry.sourceDigest) {
          if (
            existing.source !== "agentic_market" ||
            entry.source !== "agentic_market"
          ) {
            throw new Error("external_registry_generation_identity_conflict");
          }
          if (resolveAgenticMarketRouteWinner(existing, entry) === "right") {
            await ctx.db.replace(existing._id, {
              generation: args.generation,
              ...entry,
              updatedAt: Date.now(),
            });
          }
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
    tregReported: v.optional(v.number()),
    tregFetched: v.optional(v.number()),
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
      ...(args.tregReported === undefined
        ? {}
        : { tregReported: args.tregReported }),
      ...(args.tregFetched === undefined
        ? {}
        : { tregFetched: args.tregFetched }),
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
      page: page.page.flatMap((row) => {
        const entry = publicEntry(row);
        return entry === undefined ? [] : [entry];
      }),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const entry = internalQuery({
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
    if (row === null) return { kind: "not_found" as const };
    const projected = publicEntry(row);
    return projected === undefined
      ? { kind: "not_found" as const }
      : { kind: "found" as const, entry: projected };
  },
});

export const admissionCandidate = internalQuery({
  args: {
    documentId: v.string(),
    expectedSourceDigest: v.string(),
    expectedGeneration: v.optional(v.string()),
  },
  returns: admissionCandidateResultValue,
  handler: async (ctx, args) => {
    if (
      !/^registry:[0-9a-f]{64}$/u.test(args.documentId) ||
      !/^sha256:[0-9a-f]{64}$/u.test(args.expectedSourceDigest)
    ) {
      return { kind: "not_found" as const };
    }
    const state = await registryState(ctx);
    if (state?.activeGeneration === undefined) return { kind: "unavailable" as const };
    if (
      args.expectedGeneration !== undefined &&
      state.activeGeneration !== args.expectedGeneration
    ) {
      return { kind: "unavailable" as const };
    }
    const activeGeneration = state.activeGeneration;
    const row = await ctx.db
      .query("marketExternalRegistryEntries")
      .withIndex("by_generation_and_documentId", (index) =>
        index.eq("generation", activeGeneration).eq("documentId", args.documentId),
      )
      .unique();
    if (
      row === null ||
      row.source !== "agentic_market" ||
      row.probeRequest === undefined
    ) {
      return { kind: "not_found" as const };
    }
    if (row.sourceDigest !== args.expectedSourceDigest) return { kind: "source_changed" as const };
    return {
      kind: "found" as const,
      candidate: {
        documentId: row.documentId,
        sourceDigest: row.sourceDigest,
        probeRequest: row.probeRequest,
      },
    };
  },
});

export const admissionCandidates = internalQuery({
  args: {
    generation: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  returns: admissionCandidatesResultValue,
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 12) {
      throw new Error("external_registry_admission_page_invalid");
    }
    const state = await registryState(ctx);
    if (state?.activeGeneration !== args.generation) {
      return { kind: "stale_generation" as const };
    }
    const page = await ctx.db
      .query("marketExternalRegistryEntries")
      .withIndex("by_generation_and_documentId", (index) =>
        index.eq("generation", args.generation),
      )
      .paginate({ cursor: args.cursor, numItems: args.limit });
    return {
      kind: "page" as const,
      candidates: page.page.flatMap((row) =>
        row.source !== "agentic_market" || row.probeRequest === undefined
          ? []
          : [{ documentId: row.documentId, sourceDigest: row.sourceDigest }],
      ),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

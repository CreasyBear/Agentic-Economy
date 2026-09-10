import { v } from "convex/values";

import {
  query,
} from "./_generated/server";

import {
  accessValue,
  searchResultValue,
} from './lib/marketExternalRegistry/contracts'
import {
  publicEntry,
} from './lib/marketExternalRegistry/validation'
import { directoryState } from "./lib/x402DirectoryIndex/rows";


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
    const state = await directoryState(ctx);
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


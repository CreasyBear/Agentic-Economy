import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const accessValue = v.union(
  v.literal("x402"),
  v.literal("provider_account"),
  v.literal("unknown"),
);
const exactPriceValue = v.object({
  scheme: v.literal("exact"),
  amount: v.string(),
  currency: v.string(),
  network: v.string(),
});
const probeRequestValue = v.object({
  method: v.union(v.literal("GET"), v.literal("POST")),
  url: v.string(),
  headers: v.array(v.object({ name: v.string(), value: v.string() })),
  bodyJson: v.optional(v.string()),
});
const commonEntryFields = {
  documentId: v.string(),
  upstreamServiceId: v.string(),
  upstreamEndpointId: v.string(),
  sourceUrl: v.string(),
  providerUrl: v.optional(v.string()),
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
  sourceCheckedAt: v.optional(v.string()),
  sourceCalls30d: v.optional(v.string()),
  sourcePayers30d: v.optional(v.string()),
  sourceMedianLatencyMs: v.optional(v.number()),
  sourceP95LatencyMs: v.optional(v.number()),
  sourceSampleSize: v.optional(v.number()),
  authority: v.literal("source_metadata_only"),
  sourceDigest: v.string(),
  searchText: v.string(),
};
const entryInputValue = v.union(
  v.object({
    ...commonEntryFields,
    source: v.literal("agentic_market"),
    endpointUrl: v.string(),
    routeIdentity: v.string(),
    method: v.union(v.literal("GET"), v.literal("POST")),
    exactPrice: exactPriceValue,
    access: v.literal("x402"),
    credentialRequirements: v.array(v.literal("x402_payment")),
    readiness: v.literal("source_declared_callable"),
    lastObservedAt: v.string(),
    lastVerifiedAt: v.optional(v.string()),
    inputSchemaJson: v.string(),
    exampleInvocation: v.string(),
    probeRequest: probeRequestValue,
    quality: v.literal("callable"),
  }),
  v.object({
    ...commonEntryFields,
    source: v.literal("treg"),
    endpointUrl: v.optional(v.string()),
    routeIdentity: v.optional(v.string()),
    method: v.optional(v.string()),
    exactPrice: v.optional(exactPriceValue),
    access: v.literal("provider_account"),
  }),
);
const publicEntryValue = v.object({
  documentId: v.string(),
  sourceUrl: v.string(),
  providerUrl: v.optional(v.string()),
  endpointUrl: v.optional(v.string()),
  docsUrl: v.optional(v.string()),
  routeIdentity: v.optional(v.string()),
  name: v.string(),
  summary: v.string(),
  provider: v.string(),
  category: v.string(),
  capability: v.optional(v.string()),
  method: v.optional(v.string()),
  tags: v.array(v.string()),
  networks: v.array(v.string()),
  priceLabel: v.optional(v.string()),
  exactPrice: v.optional(exactPriceValue),
  access: accessValue,
  credentialRequirements: v.optional(v.array(v.literal("x402_payment"))),
  readiness: v.optional(v.literal("source_declared_callable")),
  lastObservedAt: v.optional(v.string()),
  lastVerifiedAt: v.optional(v.string()),
  inputSchemaJson: v.optional(v.string()),
  exampleInvocation: v.optional(v.string()),
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
const admissionCandidateResultValue = v.union(
  v.object({ kind: v.literal("found"), candidate: v.object({
    documentId: v.string(),
    sourceDigest: v.string(),
    probeRequest: probeRequestValue,
  }) }),
  v.object({ kind: v.literal("not_found") }),
  v.object({ kind: v.literal("source_changed") }),
  v.object({ kind: v.literal("unavailable") }),
);
const admissionCandidatesResultValue = v.union(
  v.object({ kind: v.literal("stale_generation") }),
  v.object({
    kind: v.literal("page"),
    candidates: v.array(v.object({
      documentId: v.string(),
      sourceDigest: v.string(),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
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
  args: { documentId: v.string(), expectedSourceDigest: v.string() },
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

function publicEntry(row: Doc<"marketExternalRegistryEntries">) {
  return {
    documentId: row.documentId,
    sourceUrl: row.sourceUrl,
    ...(row.providerUrl === undefined ? {} : { providerUrl: row.providerUrl }),
    ...(row.endpointUrl === undefined ? {} : { endpointUrl: row.endpointUrl }),
    ...(row.docsUrl === undefined ? {} : { docsUrl: row.docsUrl }),
    ...(row.routeIdentity === undefined
      ? {}
      : { routeIdentity: row.routeIdentity }),
    name: row.name,
    summary: row.summary,
    provider: row.provider,
    category: row.category,
    ...(row.capability === undefined ? {} : { capability: row.capability }),
    ...(row.method === undefined ? {} : { method: row.method }),
    tags: row.tags,
    networks: row.networks,
    ...(row.priceLabel === undefined ? {} : { priceLabel: row.priceLabel }),
    ...(row.exactPrice === undefined ? {} : { exactPrice: row.exactPrice }),
    access: row.access,
    ...(row.credentialRequirements === undefined
      ? {}
      : { credentialRequirements: row.credentialRequirements }),
    ...(row.readiness === undefined ? {} : { readiness: row.readiness }),
    ...(row.lastObservedAt === undefined
      ? {}
      : { lastObservedAt: row.lastObservedAt }),
    ...(row.lastVerifiedAt === undefined
      ? {}
      : { lastVerifiedAt: row.lastVerifiedAt }),
    ...(row.inputSchemaJson === undefined
      ? {}
      : { inputSchemaJson: row.inputSchemaJson }),
    ...(row.exampleInvocation === undefined
      ? {}
      : { exampleInvocation: row.exampleInvocation }),
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
  source: "agentic_market" | "treg";
  sourceDigest: string;
  endpointUrl?: string;
  routeIdentity?: string;
  method?: string;
  exactPrice?: { scheme: "exact"; amount: string; currency: string; network: string };
  access: "x402" | "provider_account" | "unknown";
  credentialRequirements?: string[];
  readiness?: "source_declared_callable";
  lastObservedAt?: string;
  inputSchemaJson?: string;
  exampleInvocation?: string;
  probeRequest?: {
    method: "GET" | "POST";
    url: string;
    headers: { name: string; value: string }[];
    bodyJson?: string;
  };
  quality?: "callable";
  tags: string[];
  networks: string[];
  searchText: string;
}): boolean {
  const serialized = JSON.stringify(entry);
  const commonValid = (
    /^registry:[0-9a-f]{64}$/u.test(entry.documentId) &&
    /^sha256:[0-9a-f]{64}$/u.test(entry.sourceDigest) &&
    entry.tags.length <= 50 &&
    entry.networks.length <= 40 &&
    entry.searchText.length <= 8_000 &&
    encoder.encode(serialized).byteLength <= MAX_ENTRY_BYTES
  );
  if (!commonValid) return false;
  if (entry.source === "treg") {
    return entry.access === "provider_account" && entry.probeRequest === undefined;
  }
  return (
    validHttpUrl(entry.endpointUrl) &&
    entry.routeIdentity === `${entry.method} ${entry.endpointUrl}` &&
    /^(?:GET|POST)$/u.test(entry.method ?? "") &&
    entry.exactPrice !== undefined &&
    entry.exactPrice.scheme === "exact" &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(entry.exactPrice.amount) &&
    /[1-9]/u.test(entry.exactPrice.amount) &&
    entry.exactPrice.currency.length > 0 &&
    entry.exactPrice.network.length > 0 &&
    entry.access === "x402" &&
    entry.credentialRequirements !== undefined &&
    entry.credentialRequirements.length === 1 &&
    entry.credentialRequirements[0] === "x402_payment" &&
    entry.readiness === "source_declared_callable" &&
    entry.lastObservedAt !== undefined &&
    Number.isFinite(Date.parse(entry.lastObservedAt)) &&
    entry.inputSchemaJson !== undefined &&
    validJsonSchemaDocument(entry.inputSchemaJson) &&
    entry.exampleInvocation !== undefined &&
    entry.exampleInvocation.length > 0 &&
    entry.exampleInvocation.length <= 16_000 &&
    entry.probeRequest !== undefined &&
    entry.probeRequest.method === entry.method &&
    entry.probeRequest.url === entry.endpointUrl &&
    entry.probeRequest.headers.length <= 32 &&
    entry.probeRequest.headers.every(({ name, value }) =>
      /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,100}$/u.test(name) && value.length <= 2_000
    ) &&
    (entry.probeRequest.bodyJson === undefined || (
      entry.probeRequest.bodyJson.length <= 16_000 && validJsonObject(entry.probeRequest.bodyJson)
    )) &&
    entry.quality === "callable"
  );
}

function validJsonObject(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function validHttpUrl(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function validJsonSchemaDocument(value: string): boolean {
  if (value.length < 2 || value.length > 12_000) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "type" in parsed &&
      parsed.type === "object"
    );
  } catch {
    return false;
  }
}

function validCoverage(args: {
  expectedEntries: number;
  agenticMarketReported: number;
  agenticMarketFetched: number;
  tregReported?: number;
  tregFetched?: number;
}): boolean {
  return [
    args.expectedEntries,
    args.agenticMarketReported,
    args.agenticMarketFetched,
    args.tregReported,
    args.tregFetched,
  ].filter((value): value is number => value !== undefined).every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  );
}

function assertGeneration(value: string): void {
  if (value.length < 1 || value.length > 200) {
    throw new Error("external_registry_generation_invalid");
  }
}

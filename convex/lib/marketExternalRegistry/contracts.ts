import { v } from 'convex/values'

export const accessValue = v.union(
  v.literal("x402"),
  v.literal("provider_account"),
  v.literal("unknown"),
);
export const exactPriceValue = v.object({
  scheme: v.literal("exact"),
  amount: v.string(),
  currency: v.string(),
  network: v.string(),
});
export const probeRequestValue = v.object({
  method: v.union(v.literal("GET"), v.literal("POST")),
  url: v.string(),
  headers: v.array(v.object({ name: v.string(), value: v.string() })),
  bodyJson: v.optional(v.string()),
});
export const commonEntryFields = {
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
export const entryInputValue = v.union(
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
export const publicEntryValue = v.object({
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
export const coverageValue = v.object({
  entries: v.number(),
  completedAt: v.number(),
});
export const searchResultValue = v.union(
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
export const entryResultValue = v.union(
  v.object({ kind: v.literal("found"), entry: publicEntryValue }),
  v.object({ kind: v.literal("not_found") }),
  v.object({ kind: v.literal("unavailable") }),
);
export const admissionCandidateResultValue = v.union(
  v.object({ kind: v.literal("found"), candidate: v.object({
    documentId: v.string(),
    sourceDigest: v.string(),
    probeRequest: probeRequestValue,
  }) }),
  v.object({ kind: v.literal("not_found") }),
  v.object({ kind: v.literal("source_changed") }),
  v.object({ kind: v.literal("unavailable") }),
);
export const admissionCandidatesResultValue = v.union(
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



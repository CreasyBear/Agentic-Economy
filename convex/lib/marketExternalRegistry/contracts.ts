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



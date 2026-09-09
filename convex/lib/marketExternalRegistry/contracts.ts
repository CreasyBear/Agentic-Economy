import { v } from 'convex/values'

export const accessValue = v.union(
  v.literal("x402"),
  v.literal("provider_account"),
  v.literal("unknown"),
);
export const publicEntryValue = v.object({
  documentId: v.string(),
  sourceUrl: v.string(),
  endpointUrl: v.optional(v.string()),
  name: v.string(),
  summary: v.string(),
  provider: v.string(),
  category: v.string(),
  method: v.optional(v.string()),
  tags: v.array(v.string()),
  networks: v.array(v.string()),
  access: accessValue,
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



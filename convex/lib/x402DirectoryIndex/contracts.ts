import { v, type Infer } from 'convex/values'
import { paginationResultValidator } from 'convex/server'

const fieldValue = v.object({
  name: v.string(), path: v.string(),
  location: v.union(v.literal('body'), v.literal('queryParams'), v.literal('pathParams'), v.literal('headers'), v.literal('output')),
  source: v.union(v.literal('schema'), v.literal('example')),
  type: v.optional(v.string()), required: v.optional(v.boolean()), description: v.optional(v.string()),
  enumValues: v.optional(v.array(v.string())), defaultJson: v.optional(v.string()), exampleJson: v.optional(v.string()), constraints: v.optional(v.array(v.string())),
})
const contractValue = v.object({
  fields: v.array(fieldValue), type: v.optional(v.string()), schemaJson: v.optional(v.string()), exampleJson: v.optional(v.string()),
  schemaOmitted: v.optional(v.literal(true)), exampleOmitted: v.optional(v.literal(true)), fieldsTruncated: v.optional(v.literal(true)),
})
export const directoryEntryValue = v.object({
  resource: v.string(), title: v.string(), description: v.string(), protocol: v.string(), provider: v.string(), metadataJson: v.string(),
  serviceName: v.optional(v.string()), iconUrl: v.optional(v.string()), skillUrl: v.optional(v.string()), category: v.optional(v.string()),
  input: v.optional(contractValue), output: v.optional(contractValue),
  method: v.optional(v.string()), methodLabel: v.optional(v.string()), outputSummary: v.optional(v.string()), schemaSummary: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  curated: v.optional(v.literal(true)), bundleSlugs: v.optional(v.array(v.string())),
  slug: v.optional(v.string()),
  provenance: v.optional(v.object({ directory: v.literal('Coinbase Bazaar'), metadata: v.literal('provider_declared'), updatedAt: v.optional(v.string()) })),
  activity: v.optional(v.object({ calls30d: v.optional(v.number()), payers30d: v.optional(v.number()), lastCalledAt: v.optional(v.string()) })),
  prices: v.array(v.object({
    network: v.string(), networkLabel: v.optional(v.string()), scheme: v.string(), amount: v.string(),
    asset: v.optional(v.string()), symbol: v.optional(v.string()), decimalAmount: v.optional(v.string()),
  })),
})
export type DirectoryEntry = Infer<typeof directoryEntryValue>
export const indexedEntryValue = v.object({
  entry: directoryEntryValue, category: v.string(),
  categorySource: v.union(v.literal('provider_declared'), v.literal('unclassified')),
  observedAt: v.number(), sourceDigest: v.string(),
  // Admitted Tool ref, joined live from capabilityPublications by
  // sourceRouteRef (convex/x402DirectoryIndex.ts:admittedToolRef) - never
  // stored on the directory row itself, so it always reflects the current
  // disposition even after a publication is withdrawn or superseded.
  toolRef: v.optional(v.string()),
  analytics: v.optional(v.object({
    payerDepth: v.optional(v.number()),
    depthBand: v.string(),
    lastActivatedAt: v.optional(v.number()),
    lastCalledBand: v.string(),
    callDelta: v.optional(v.number()),
    payerDelta: v.optional(v.number()),
    // Optional (Well 8 Lane B): no longer computed going forward (see
    // x402DirectoryIndexBackfill.ts) - only legacy rows still carry a value.
    momentumBand: v.optional(v.string()),
  })),
})
export type IndexedEntry = Infer<typeof indexedEntryValue>
export const coverageValue = v.object({
  source: v.literal('coinbase'), generation: v.string(), indexedTotal: v.number(),
  reportedTotal: v.number(), reportedTotalAtStart: v.number(), sourceChangedDuringScan: v.boolean(),
  duplicateObservations: v.number(), pagesFetched: v.number(), startedAt: v.number(), completedAt: v.number(),
  completeness: v.literal('completed_observed_scan'),
})
export const unavailableValue = v.object({ kind: v.literal('unavailable'), reason: v.string() })
export const filterArgs = {
  query: v.optional(v.string()), category: v.optional(v.string()), provider: v.optional(v.string()), network: v.optional(v.string()),
  minUsdPrice: v.optional(v.number()), minPayers30d: v.optional(v.number()), maxPayers30d: v.optional(v.number()),
  priceBand: v.optional(v.string()), adoptionBand: v.optional(v.string()),
  curatedOnly: v.optional(v.boolean()), tags: v.optional(v.array(v.string())), bundleSlugs: v.optional(v.array(v.string())),
  hasInputFields: v.optional(v.boolean()), hasOutputFields: v.optional(v.boolean()),
  hasInputSchema: v.optional(v.boolean()), hasOutputSchema: v.optional(v.boolean()), hasOutputExample: v.optional(v.boolean()),
  maxUsdPrice: v.optional(v.number()), sort: v.optional(v.union(v.literal('relevance'), v.literal('popular'), v.literal('updated'), v.literal('adoption'), v.literal('price_asc'))),
}
export const pageValue = v.union(unavailableValue, v.object({
  kind: v.literal('ok'), coverage: coverageValue,
  searchMethod: v.union(v.literal('native_full_text'), v.literal('native_index')),
  ...paginationResultValidator(indexedEntryValue).fields,
}))
export const indexedSourceValue = v.object({
  resource: v.string(), entry: directoryEntryValue, sourceJson: v.string(), sourceDigest: v.string(),
})
export type IndexedSource = Infer<typeof indexedSourceValue>
export const progressValue = v.object({
  kind: v.union(v.literal('advanced'), v.literal('complete'), v.literal('stale')),
  generation: v.string(), nextOffset: v.number(), indexedTotal: v.number(),
})
export type IndexProgress = Infer<typeof progressValue>

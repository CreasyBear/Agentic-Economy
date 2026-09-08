import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const marketTables = {
  marketExternalSnapshots: defineTable({
    window: v.union(v.literal('24h'), v.literal('7d'), v.literal('30d')),
    fetchedAt: v.number(),
    sourceTimestamp: v.string(),
    snapshotJson: v.string(),
  }).index('by_window', ['window']),
  marketExternalRegistryState: defineTable({
    key: v.union(v.literal('registry'), v.literal('coinbase')),
    activeGeneration: v.optional(v.string()),
    refreshGeneration: v.optional(v.string()),
    lastAttemptAt: v.number(),
    lastAttemptStatus: v.union(
      v.literal('refreshing'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    lastError: v.optional(v.string()),
  }).index('by_key', ['key']),
  marketExternalRegistryGenerations: defineTable({
    generation: v.string(),
    source: v.optional(v.literal('coinbase')),
    status: v.union(
      v.literal('refreshing'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    ingestedCount: v.number(),
    nextOffset: v.optional(v.number()),
    pageItemCursor: v.optional(v.number()),
    analyticsVersion: v.optional(v.number()),
    analyticsCursor: v.optional(v.string()),
    analyticsProcessed: v.optional(v.number()),
    analyticsStatus: v.optional(v.union(v.literal('building'), v.literal('ready'))),
    sourceReportedInitial: v.optional(v.number()),
    sourceReportedLatest: v.optional(v.number()),
    sourceReportedMinimum: v.optional(v.number()),
    sourceReportedMaximum: v.optional(v.number()),
    pagesFetched: v.optional(v.number()),
    observations: v.optional(v.number()),
    duplicateObservations: v.optional(v.number()),
    terminalObserved: v.optional(v.boolean()),
    agenticMarketReported: v.optional(v.number()),
    agenticMarketFetched: v.optional(v.number()),
    tregReported: v.optional(v.number()),
    tregFetched: v.optional(v.number()),
  }).index('by_generation', ['generation']),
  marketExternalRegistryEntries: defineTable({
    generation: v.string(),
    documentId: v.string(),
    source: v.union(v.literal('agentic_market'), v.literal('treg'), v.literal('coinbase')),
    upstreamServiceId: v.string(),
    upstreamEndpointId: v.string(),
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
    exactPrice: v.optional(v.object({
      scheme: v.literal('exact'),
      amount: v.string(),
      currency: v.string(),
      network: v.string(),
    })),
    access: v.union(
      v.literal('x402'),
      v.literal('provider_account'),
      v.literal('unknown'),
    ),
    sourceCheckedAt: v.optional(v.string()),
    credentialRequirements: v.optional(v.array(v.literal('x402_payment'))),
    readiness: v.optional(v.literal('source_declared_callable')),
    lastObservedAt: v.optional(v.string()),
    lastVerifiedAt: v.optional(v.string()),
    inputSchemaJson: v.optional(v.string()),
    exampleInvocation: v.optional(v.string()),
    probeRequest: v.optional(v.object({
      method: v.union(v.literal('GET'), v.literal('POST')),
      url: v.string(),
      headers: v.array(v.object({ name: v.string(), value: v.string() })),
      bodyJson: v.optional(v.string()),
    })),
    quality: v.optional(v.literal('callable')),
    sourceCalls30d: v.optional(v.string()),
    sourcePayers30d: v.optional(v.string()),
    sourceMedianLatencyMs: v.optional(v.number()),
    sourceP95LatencyMs: v.optional(v.number()),
    sourceSampleSize: v.optional(v.number()),
    authority: v.literal('source_metadata_only'),
    sourceDigest: v.string(),
    searchText: v.string(),
    updatedAt: v.number(),
    directoryEntryJson: v.optional(v.string()),
    directorySourceJson: v.optional(v.string()),
    directoryCategory: v.optional(v.string()),
    directorySourceUpdatedAt: v.optional(v.number()),
    directoryCalls30d: v.optional(v.number()),
  })
    .index('by_generation_and_documentId', ['generation', 'documentId'])
    .index('by_generation_source_and_documentId', [
      'generation',
      'source',
      'documentId',
    ])
    .index('by_generation_access_and_documentId', [
      'generation',
      'access',
      'documentId',
    ])
    .searchIndex('search_searchText_by_generation_source', {
      searchField: 'searchText',
      filterFields: ['generation', 'source', 'access'],
    }),
  // Compact native search projections: one all-network row and one row per
  // supported network for each observed resource. No publication or admission.
  marketDirectorySearchEntries: defineTable({
    generation: v.string(),
    resource: v.string(),
    entryId: v.id('marketExternalRegistryEntries'),
    network: v.string(),
    category: v.string(),
    provider: v.string(),
    searchText: v.string(),
    popularOrder: v.number(),
    updatedOrder: v.number(),
    minimumUsdPrice: v.optional(v.string()),
    minimumUsdPriceOrder: v.number(),
    payersOrder: v.optional(v.number()),
    priceOrder: v.optional(v.number()),
    priceBand: v.optional(v.string()),
    adoptionBand: v.optional(v.string()),
    curated: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    bundleSlugs: v.optional(v.array(v.string())),
    hasInputFields: v.optional(v.boolean()),
    hasOutputFields: v.optional(v.boolean()),
    hasInputSchema: v.optional(v.boolean()),
    hasOutputSchema: v.optional(v.boolean()),
    hasOutputExample: v.optional(v.boolean()),
  })
    .index('by_generation_and_resource', ['generation', 'resource'])
    .index('by_generation_and_network_and_payersOrder', ['generation', 'network', 'payersOrder'])
    .index('by_generation_and_network_and_category_and_payersOrder', ['generation', 'network', 'category', 'payersOrder'])
    .index('by_generation_and_network_and_provider_and_payersOrder', ['generation', 'network', 'provider', 'payersOrder'])
    .index('by_generation_and_network_and_priceOrder', ['generation', 'network', 'priceOrder'])
    .index('by_generation_and_network_and_category_and_priceOrder', ['generation', 'network', 'category', 'priceOrder'])
    .index('by_generation_and_network_and_provider_and_priceOrder', ['generation', 'network', 'provider', 'priceOrder'])
    .index('by_generation_and_network_and_curated_and_payersOrder', ['generation', 'network', 'curated', 'payersOrder'])
    .index('by_generation_and_network_and_resource', ['generation', 'network', 'resource'])
    .index('by_generation_and_network_and_popularOrder', ['generation', 'network', 'popularOrder'])
    .index('by_generation_and_network_and_updatedOrder', ['generation', 'network', 'updatedOrder'])
    .index('by_generation_and_network_and_category_and_popularOrder', ['generation', 'network', 'category', 'popularOrder'])
    .index('by_generation_and_network_and_category_and_updatedOrder', ['generation', 'network', 'category', 'updatedOrder'])
    .index('by_generation_and_network_and_provider_and_popularOrder', ['generation', 'network', 'provider', 'popularOrder'])
    .index('by_generation_and_network_and_provider_and_updatedOrder', ['generation', 'network', 'provider', 'updatedOrder'])
    .searchIndex('search_text_by_generation_network_category_provider', {
      searchField: 'searchText',
      filterFields: ['generation', 'network', 'category', 'provider'],
    }),
  marketDirectoryFacets: defineTable({
    generation: v.string(),
    kind: v.union(v.literal('category'), v.literal('provider'), v.literal('network'), v.literal('tag'), v.literal('bundle')),
    key: v.string(),
    label: v.string(),
    iconUrl: v.optional(v.string()),
  }).index('by_generation_and_kind_and_key', ['generation', 'kind', 'key']),
  marketEvidenceFacts: defineTable({
    kind: v.union(
      v.literal('ae_invocation'),
      v.literal('ae_invocation_completed'),
      v.literal('ae_settlement'),
      v.literal('ae_qualified_use'),
      v.literal('ae_reconciliation_required'),
    ),
    sourceRef: v.string(),
    toolRef: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    occurredAt: v.number(),
  })
    .index('by_kind_and_sourceRef', ['kind', 'sourceRef'])
    .index('by_kind_and_toolRef_and_occurredAt', [
      'kind',
      'toolRef',
      'occurredAt',
    ]),
  marketToolCategories: defineTable({
    toolRef: v.string(),
    categoryId: v.string(),
    assignedBy: v.string(),
    assignedAt: v.number(),
  })
    .index('by_toolRef', ['toolRef'])
    .index('by_categoryId_and_toolRef', ['categoryId', 'toolRef']),
  marketToolRatings: defineTable({
    toolRef: v.string(),
    reviewerRef: v.string(),
    score: v.number(),
    review: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_toolRef_and_reviewerRef', ['toolRef', 'reviewerRef'])
    .index('by_reviewerRef_and_updatedAt', ['reviewerRef', 'updatedAt']),
  marketActiveTools: defineTable({
    toolRef: v.string(),
    businessId: v.id('businesses'),
    activatedAt: v.number(),
  })
    .index('by_toolRef', ['toolRef'])
    .index('by_businessId', ['businessId']),
  marketActiveProviders: defineTable({
    businessId: v.id('businesses'),
    activatedAt: v.number(),
  }).index('by_businessId', ['businessId']),
} as const

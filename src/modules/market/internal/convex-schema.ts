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
    key: v.literal('registry'),
    activeGeneration: v.optional(v.string()),
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
    agenticMarketReported: v.optional(v.number()),
    agenticMarketFetched: v.optional(v.number()),
    tregReported: v.optional(v.number()),
    tregFetched: v.optional(v.number()),
  }).index('by_generation', ['generation']),
  marketExternalRegistryEntries: defineTable({
    generation: v.string(),
    documentId: v.string(),
    source: v.union(v.literal('agentic_market'), v.literal('treg')),
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
  marketAggregateBackfills: defineTable({
    projection: v.string(),
    cursor: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_projection', ['projection']),
  marketEvidenceFacts: defineTable({
    kind: v.union(
      v.literal('ae_invocation'),
      v.literal('ae_invocation_completed'),
      v.literal('ae_settlement'),
      v.literal('ae_qualified_use'),
      v.literal('ae_reconciliation_required'),
    ),
    sourceRef: v.string(),
    operationRef: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    occurredAt: v.number(),
  })
    .index('by_kind_and_sourceRef', ['kind', 'sourceRef'])
    .index('by_kind_and_operationRef_and_occurredAt', [
      'kind',
      'operationRef',
      'occurredAt',
    ]),
  marketOperationCategories: defineTable({
    operationRef: v.string(),
    categoryId: v.string(),
    assignedBy: v.string(),
    assignedAt: v.number(),
  })
    .index('by_operationRef', ['operationRef'])
    .index('by_categoryId_and_operationRef', ['categoryId', 'operationRef']),
  marketOperationRatings: defineTable({
    operationRef: v.string(),
    reviewerRef: v.string(),
    score: v.number(),
    review: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_operationRef_and_reviewerRef', ['operationRef', 'reviewerRef'])
    .index('by_reviewerRef_and_updatedAt', ['reviewerRef', 'updatedAt']),
  marketActiveOperations: defineTable({
    operationRef: v.string(),
    businessId: v.id('businesses'),
    activatedAt: v.number(),
  })
    .index('by_operationRef', ['operationRef'])
    .index('by_businessId', ['businessId']),
  marketActiveSuppliers: defineTable({
    businessId: v.id('businesses'),
    activatedAt: v.number(),
  }).index('by_businessId', ['businessId']),
} as const

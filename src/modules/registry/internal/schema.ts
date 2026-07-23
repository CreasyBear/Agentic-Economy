import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { GenericValidator } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistrySearchDocumentSourceVersion,
  RegistrySearchSyncOperationValues,
  RegistrySearchSyncStatusValues,
  RegistryProjectionSourceVersion,
  RegistryProjectionKindValues,
  RegistryRepairActionValues,
  RegistryRepairResultValues,
  RegistryProjectionStatusValues,
} from '@/modules/registry/public'
import { PublicStatusValues, TrustTierValues } from '@/modules/business/public'
import { FirstRequestModeValues } from '@/modules/catalog/public'

const OfferingV2RegistrySearchDocumentSchemaVersion = 'registry-search-document:v2' as const

const offeringSearchFactSource = v.union(
  v.object({ kind: v.literal('business_supplied') }),
  v.object({
    kind: v.literal('publicly_observed'),
    referenceUrl: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('ae_support'),
    actionId: v.string(),
    actionVersion: v.string(),
  }),
)

function offeringSearchFact<Value extends GenericValidator>(value: Value) {
  return v.union(
    v.object({
      kind: v.literal('known'),
      value,
      source: offeringSearchFactSource,
      observedAt: v.number(),
      validUntil: v.optional(v.number()),
    }),
    v.object({
      kind: v.literal('unknown'),
      explanation: v.string(),
      source: offeringSearchFactSource,
      observedAt: v.number(),
    }),
    v.object({
      kind: v.literal('not_supplied'),
      source: offeringSearchFactSource,
      observedAt: v.number(),
    }),
    v.object({
      kind: v.literal('stale'),
      lastKnown: v.optional(value),
      source: offeringSearchFactSource,
      observedAt: v.number(),
      validUntil: v.number(),
    }),
  )
}

const offeringSearchPriceBasis = v.object({
  description: v.string(),
  currency: v.optional(v.string()),
  amountMinor: v.optional(v.number()),
  unit: v.union(
    v.literal('total'),
    v.literal('hour'),
    v.literal('day'),
    v.literal('month'),
    v.literal('request'),
    v.literal('unit'),
  ),
})

const offeringSearchComparison = v.object({
  schemaVersion: v.literal('offering-comparison:v1'),
  profile: v.union(
    v.object({
      profileId: v.literal('professional_service:v1'),
      scopeBasis: offeringSearchFact(v.string()),
      priceBasis: offeringSearchFact(offeringSearchPriceBasis),
      timingBasis: offeringSearchFact(v.string()),
      serviceArea: offeringSearchFact(v.string()),
    }),
    v.object({
      profileId: v.literal('machine_data:v1'),
      interfaceFormat: offeringSearchFact(v.union(
        v.literal('graphql'),
        v.literal('rest_json'),
        v.literal('csv'),
        v.literal('other'),
      )),
      requestMethod: offeringSearchFact(v.union(v.literal('GET'), v.literal('POST'))),
      authentication: offeringSearchFact(v.union(
        v.literal('none'),
        v.literal('api_key'),
        v.literal('oauth2'),
        v.literal('other'),
      )),
      priceBasis: offeringSearchFact(offeringSearchPriceBasis),
      freshnessOrUpdateCadence: offeringSearchFact(v.string()),
    }),
  ),
})

const legacyRegistrySearchDocument = v.object({
  documentId: v.string(),
  schemaVersion: v.literal(RegistrySearchDocumentSourceVersion),
  businessSlug: v.string(),
  serviceSlug: v.string(),
  businessName: v.string(),
  serviceName: v.string(),
  serviceCategory: v.string(),
  serviceCategoryKey: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publicStatus: v.literal('published'),
  trustTier: literalUnion(TrustTierValues),
  firstRequestMode: literalUnion(FirstRequestModeValues),
  placeKeys: v.array(v.string()),
  serviceKeywords: v.array(v.string()),
  searchText: v.string(),
  serviceArea: v.string(),
  sourceHash: v.optional(v.string()),
  generatedHash: v.string(),
  updatedAt: v.number(),
})

const offeringV2RegistrySearchDocument = v.object({
  documentId: v.string(),
  schemaVersion: v.literal(OfferingV2RegistrySearchDocumentSchemaVersion),
  businessId: v.string(),
  businessSlug: v.string(),
  businessName: v.string(),
  businessCategory: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publicStatus: v.literal('published'),
  placeKeys: v.array(v.string()),
  searchText: v.string(),
  offerings: v.array(v.object({
    offeringRef: v.string(),
    revision: v.number(),
    name: v.string(),
    category: v.string(),
    summary: v.string(),
    comparison: v.optional(offeringSearchComparison),
  })),
  sourceRevision: v.number(),
  sourceDigest: v.string(),
  observedAt: v.number(),
  generatedHash: v.string(),
  updatedAt: v.number(),
})

const registryPublicSurface = v.union(
  v.literal('/registry'),
  v.literal('/api/businesses'),
  v.literal('/api/businesses/search'),
  v.literal('/api/businesses/{slug}')
)

const registryProjectionReadback = v.object({
  businessId: v.id('businesses'),
  slug: v.string(),
  publicUrl: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  sourceHash: v.string(),
  generatedHash: v.optional(v.string()),
  serviceCount: v.number(),
  publicSurfaces: v.array(registryPublicSurface),
  readAt: v.number(),
})

export const registryTables = {
  registryProjectionItems: defineTable({
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    logicalKey: v.string(),
    projectionKind: literalUnion(RegistryProjectionKindValues),
    publicStatus: literalUnion(PublicStatusValues),
    sourceHash: v.string(),
    sourceVersion: v.literal(RegistryProjectionSourceVersion),
    generatedHash: v.string(),
    publicUrl: v.string(),
    serviceCount: v.number(),
    updatedAt: v.number(),
  })
    .index('by_logicalKey', ['logicalKey'])
    .index('by_business', ['businessId'])
    .index('by_service', ['serviceId']),

  registryProjectionAttempts: defineTable({
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    logicalKey: v.string(),
    sourceHash: v.string(),
    sourceVersion: v.literal(RegistryProjectionSourceVersion),
    projectionKind: literalUnion(RegistryProjectionKindValues),
    status: literalUnion(RegistryProjectionStatusValues),
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorRedacted: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    latestReadback: v.optional(registryProjectionReadback),
    staleThresholdAt: v.optional(v.number()),
    repairAction: literalUnion(RegistryRepairActionValues),
    repairResult: literalUnion(RegistryRepairResultValues),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_business_startedAt', ['businessId', 'startedAt'])
    .index('by_logicalKey', ['logicalKey']),

  registrySearchDocuments: defineTable(v.union(
    legacyRegistrySearchDocument,
    offeringV2RegistrySearchDocument,
  ))
    .index('by_documentId', ['documentId'])
    .index('by_business', ['businessSlug'])
    .index('by_businessId', ['businessId'])
    .index('by_service', ['businessSlug', 'serviceSlug'])
    .index('by_publicStatus_updatedAt', ['publicStatus', 'updatedAt'])
    .searchIndex('search_searchText_by_publicStatus', {
      searchField: 'searchText',
      filterFields: ['publicStatus'],
    })
    .searchIndex('search_v2_searchText_by_schemaVersion_and_publicStatus', {
      searchField: 'searchText',
      filterFields: ['schemaVersion', 'publicStatus'],
    }),

  registrySearchSyncAttempts: defineTable({
    attemptId: v.string(),
    documentId: v.string(),
    businessSlug: v.string(),
    serviceSlug: v.string(),
    operation: literalUnion(RegistrySearchSyncOperationValues),
    status: literalUnion(RegistrySearchSyncStatusValues),
    meiliTaskUid: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
    generatedHash: v.optional(v.string()),
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorRedacted: v.optional(v.string()),
    staleReason: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index('by_attemptId', ['attemptId'])
    .index('by_document_status', ['documentId', 'status'])
    .index('by_business_status', ['businessSlug', 'status'])
    .index('by_taskUid', ['meiliTaskUid'])
    .index('by_status_startedAt', ['status', 'startedAt']),

  indexStatus: defineTable({
    targetType: literalUnion(IndexTargetTypeValues),
    targetRef: v.string(),
    businessId: v.optional(v.id('businesses')),
    serviceId: v.optional(v.id('businessServices')),
    status: literalUnion(IndexStatusValues),
    lastAttemptAt: v.number(),
    sourceHash: v.string(),
    sourceVersion: v.literal(RegistryProjectionSourceVersion),
    staleReason: v.optional(v.string()),
  })
    .index('by_target', ['targetType', 'targetRef'])
    .index('by_target_status', ['targetType', 'targetRef', 'status'])
    .index('by_status_lastAttempt', ['status', 'lastAttemptAt']),
} as const

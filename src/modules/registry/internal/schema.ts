import { defineTable } from 'convex/server'
import { v, type GenericValidator } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistrySearchDocumentSourceVersion,
  RegistryProjectionSourceVersion,
  RegistryProjectionKindValues,
  RegistryRepairActionValues,
  RegistryRepairResultValues,
  RegistryProjectionStatusValues,
} from '@/modules/registry/public'
import { PublicStatusValues, TrustTierValues } from '@/modules/business/public'
import { FirstRequestModeValues } from '@/modules/catalog/public'

const registryPublicSurface = v.union(
  v.literal('/api/businesses'),
  v.literal('/api/businesses/search'),
  v.literal('/api/businesses/{slug}')
)

const legacyRegistryPublicSurface = v.union(
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
  offeringCount: v.number(),
  publicSurfaces: v.array(registryPublicSurface),
  readAt: v.number(),
})

const legacyRegistryProjectionReadback = v.object({
  businessId: v.id('businesses'),
  slug: v.string(),
  publicUrl: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  sourceHash: v.string(),
  generatedHash: v.optional(v.string()),
  serviceCount: v.number(),
  publicSurfaces: v.array(legacyRegistryPublicSurface),
  readAt: v.number(),
})

const currentRegistryProjectionItem = v.object({
  businessId: v.id('businesses'),
  offeringRef: v.optional(v.string()),
  logicalKey: v.string(),
  projectionKind: literalUnion(RegistryProjectionKindValues),
  publicStatus: literalUnion(PublicStatusValues),
  sourceHash: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  generatedHash: v.string(),
  publicUrl: v.string(),
  offeringCount: v.number(),
  updatedAt: v.number(),
})

const legacyRegistryProjectionItem = v.object({
  businessId: v.id('businesses'),
  serviceId: v.optional(v.id('businessServices')),
  logicalKey: v.string(),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('service_catalog')),
  publicStatus: literalUnion(PublicStatusValues),
  sourceHash: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  generatedHash: v.string(),
  publicUrl: v.string(),
  serviceCount: v.number(),
  updatedAt: v.number(),
})

const currentRegistryProjectionAttempt = v.object({
  businessId: v.id('businesses'),
  attemptVersion: v.literal('current'),
  offeringRef: v.optional(v.string()),
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

const preVersionCurrentRegistryProjectionAttempt = v.object({
  businessId: v.id('businesses'),
  offeringRef: v.optional(v.string()),
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

const legacyRegistryProjectionAttempt = v.object({
  businessId: v.id('businesses'),
  serviceId: v.optional(v.id('businessServices')),
  logicalKey: v.string(),
  sourceHash: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  projectionKind: v.union(v.literal('business_catalog'), v.literal('service_catalog')),
  status: literalUnion(RegistryProjectionStatusValues),
  retryCount: v.number(),
  retryAfter: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  lastErrorRedacted: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  latestReadback: v.optional(legacyRegistryProjectionReadback),
  staleThresholdAt: v.optional(v.number()),
  repairAction: literalUnion(RegistryRepairActionValues),
  repairResult: literalUnion(RegistryRepairResultValues),
})

// Widen-only compatibility for registry-search-document:v2 rows already stored
// in production. Current writers emit the per-Offering v1 shape below.
const historicalComparisonFactSource = v.union(
  v.object({ kind: v.literal('business_supplied') }),
  v.object({ kind: v.literal('publicly_observed'), referenceUrl: v.optional(v.string()) }),
  v.object({ kind: v.literal('ae_support'), actionId: v.string(), actionVersion: v.string() }),
)

function historicalComparisonFact(value: GenericValidator) {
  return v.union(
    v.object({ kind: v.literal('known'), value, source: historicalComparisonFactSource, observedAt: v.number(), validUntil: v.optional(v.number()) }),
    v.object({ kind: v.literal('unknown'), explanation: v.string(), source: historicalComparisonFactSource, observedAt: v.number() }),
    v.object({ kind: v.literal('not_supplied'), source: historicalComparisonFactSource, observedAt: v.number() }),
    v.object({ kind: v.literal('stale'), lastKnown: v.optional(value), source: historicalComparisonFactSource, observedAt: v.number(), validUntil: v.number() }),
  )
}

const historicalPriceBasis = v.object({
  description: v.string(),
  currency: v.optional(v.string()),
  amountMinor: v.optional(v.number()),
  unit: v.union(v.literal('total'), v.literal('hour'), v.literal('day'), v.literal('month'), v.literal('request'), v.literal('unit')),
})

const historicalOfferingComparison = v.object({
  schemaVersion: v.literal('offering-comparison:v1'),
  profile: v.union(
    v.object({
      profileId: v.literal('professional_service:v1'),
      scopeBasis: historicalComparisonFact(v.string()),
      priceBasis: historicalComparisonFact(historicalPriceBasis),
      timingBasis: historicalComparisonFact(v.string()),
      serviceArea: historicalComparisonFact(v.string()),
    }),
    v.object({
      profileId: v.literal('machine_data:v1'),
      interfaceFormat: historicalComparisonFact(v.union(v.literal('graphql'), v.literal('rest_json'), v.literal('csv'), v.literal('other'))),
      requestMethod: historicalComparisonFact(v.union(v.literal('GET'), v.literal('POST'))),
      authentication: historicalComparisonFact(v.union(v.literal('none'), v.literal('api_key'), v.literal('oauth2'), v.literal('other'))),
      priceBasis: historicalComparisonFact(historicalPriceBasis),
      freshnessOrUpdateCadence: historicalComparisonFact(v.string()),
    }),
  ),
})

const historicalAggregateRegistrySearchDocument = v.object({
  businessCategory: v.string(),
  businessId: v.id('businesses'),
  businessName: v.string(),
  businessSlug: v.string(),
  documentId: v.string(),
  generatedHash: v.string(),
  observedAt: v.number(),
  offerings: v.array(v.object({
    category: v.string(),
    comparison: historicalOfferingComparison,
    name: v.string(),
    offeringRef: v.string(),
    revision: v.number(),
    summary: v.string(),
  })),
  placeKeys: v.array(v.string()),
  postcode: v.optional(v.string()),
  publicStatus: v.literal('published'),
  schemaVersion: v.literal('registry-search-document:v2'),
  searchText: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.number(),
  stateTerritory: v.string(),
  suburb: v.string(),
  updatedAt: v.number(),
})

const currentRegistrySearchDocument = v.object({
  documentId: v.string(),
  schemaVersion: v.literal(RegistrySearchDocumentSourceVersion),
  businessSlug: v.string(),
  offeringRef: v.string(),
  businessName: v.string(),
  name: v.string(),
  category: v.string(),
  categoryKey: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  postcode: v.optional(v.string()),
  publicStatus: v.literal('published'),
  trustTier: literalUnion(TrustTierValues),
  firstRequestMode: literalUnion(FirstRequestModeValues),
  placeKeys: v.array(v.string()),
  keywords: v.array(v.string()),
  searchText: v.string(),
  serviceAreaSummary: v.string(),
  sourceHash: v.optional(v.string()),
  generatedHash: v.string(),
  updatedAt: v.number(),
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

const currentIndexStatus = v.object({
  targetType: literalUnion(IndexTargetTypeValues),
  targetRef: v.string(),
  businessId: v.optional(v.id('businesses')),
  offeringRef: v.optional(v.string()),
  status: literalUnion(IndexStatusValues),
  lastAttemptAt: v.number(),
  sourceHash: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  staleReason: v.optional(v.string()),
})

const legacyIndexStatus = v.object({
  targetType: v.union(v.literal('business'), v.literal('service'), v.literal('capability')),
  targetRef: v.string(),
  businessId: v.optional(v.id('businesses')),
  serviceId: v.optional(v.id('businessServices')),
  status: literalUnion(IndexStatusValues),
  lastAttemptAt: v.number(),
  sourceHash: v.string(),
  sourceVersion: v.literal(RegistryProjectionSourceVersion),
  staleReason: v.optional(v.string()),
})

export const registryTables = {
  registryProjectionItems: defineTable(
    v.union(currentRegistryProjectionItem, legacyRegistryProjectionItem),
  )
    .index('by_logicalKey', ['logicalKey'])
    .index('by_business', ['businessId'])
    .index('by_offering', ['offeringRef']),

  registryProjectionAttempts: defineTable(
    v.union(currentRegistryProjectionAttempt, preVersionCurrentRegistryProjectionAttempt, legacyRegistryProjectionAttempt),
  )
    .index('by_business_status', ['businessId', 'status'])
    .index('by_business_startedAt', ['businessId', 'startedAt'])
    .index('by_logicalKey', ['logicalKey']),


  registrySearchDocuments: defineTable(
    v.union(currentRegistrySearchDocument, legacyRegistrySearchDocument, historicalAggregateRegistrySearchDocument),
  )
    .index('by_documentId', ['documentId'])
    .index('by_business', ['businessSlug'])
    .index('by_offering', ['businessSlug', 'offeringRef'])
    .index('by_publicStatus_updatedAt', ['publicStatus', 'updatedAt'])
    .searchIndex('search_searchText_by_publicStatus', {
      searchField: 'searchText',
      filterFields: ['publicStatus'],
    }),


  indexStatus: defineTable(
    v.union(currentIndexStatus, legacyIndexStatus),
  )
    .index('by_target', ['targetType', 'targetRef'])
    .index('by_target_status', ['targetType', 'targetRef', 'status'])
    .index('by_status_lastAttempt', ['status', 'lastAttemptAt']),
} as const

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

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
} from './schema-values'
import { PublicStatusValues, TrustTierValues } from '@/modules/business/public'
import { businessContext } from '@/modules/business/public'
import { FirstRequestModeValues } from '@/modules/catalog/schema-values'


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


const currentRegistrySearchDocument = v.object({
  documentId: v.string(),
  schemaVersion: v.literal(RegistrySearchDocumentSourceVersion),
  businessSlug: v.string(),
  offeringRef: v.string(),
  businessName: v.string(),
  name: v.string(),
  category: v.string(),
  categoryKey: v.string(),
  businessContext,
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
  registrySearchDocuments: defineTable(
    v.union(currentRegistrySearchDocument, legacyRegistrySearchDocument),
  )
    .index('by_documentId', ['documentId'])
    .index('by_business', ['businessSlug'])
    .index('by_offering', ['businessSlug', 'offeringRef'])
    .index('by_publicStatus_updatedAt', ['publicStatus', 'updatedAt'])
    .searchIndex('search_searchText_by_publicStatus', {
      searchField: 'searchText',
      filterFields: ['publicStatus'],
    }),
} as const

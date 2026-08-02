import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '@/modules/catalog/public'
import {
  DiscoveryAttemptStatusValues,
  DiscoveryManifestRouteKindValues,
  DiscoveryPathKindValues,
  DiscoveryRepairActionValues,
  DiscoveryRepairResultValues,
} from '@/modules/discovery/public'

const discoveryManifestRoute = v.object({
  kind: literalUnion(DiscoveryManifestRouteKindValues),
  url: v.string(),
  routeTested: v.literal(true),
})

const discoveryManifestPrice = v.object({
  kind: literalUnion(OfferingPriceKindValues),
  currency: v.string(),
  amountMinor: v.optional(v.number()),
  maximumAmountMinor: v.optional(v.number()),
  unit: v.optional(literalUnion(OfferingPriceUnitValues)),
  taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
})

const discoveryManifestHumanRequestAccessPath = v.object({
  accessPathRef: v.string(),
  kind: v.literal('human_request'),
  channel: literalUnion(HumanRequestChannelValues),
  disclosure: v.string(),
  url: v.optional(v.string()),
})

const discoveryManifestExternalOperationAccessPath = v.object({
  accessPathRef: v.string(),
  kind: v.literal('external_operation'),
  name: v.string(),
  summary: v.string(),
  url: v.string(),
  method: v.optional(v.string()),
  documentationUrl: v.optional(v.string()),
  interfaceDescription: v.optional(v.object({
    format: v.string(),
    url: v.optional(v.string()),
  })),
  authenticationSummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  provenance: literalUnion(ExternalOperationProvenanceValues),
})

const discoveryManifestAccessPath = v.union(
  discoveryManifestHumanRequestAccessPath,
  discoveryManifestExternalOperationAccessPath,
)

const discoveryManifestOfferingSupport = v.object({
  integrated: v.boolean(),
  aeSupportedAction: v.boolean(),
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
})

const discoveryManifestOffering = v.object({
  offeringRef: v.string(),
  revision: v.number(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceAreaSummary: v.optional(v.string()),
  availabilitySummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  price: v.optional(discoveryManifestPrice),
  accessPaths: v.array(discoveryManifestAccessPath),
  support: discoveryManifestOfferingSupport,
})

const discoveryManifestReadback = v.object({
  businessId: v.id('businesses'),
  slug: v.string(),
  manifestUrl: v.string(),
  sourceVersion: v.string(),
  sourceHash: v.string(),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  routeUrls: v.array(v.string()),
  readAt: v.number(),
})
export const discoveryTables = {
  discoveryManifests: defineTable({
    schemaVersion: v.string(),
    businessCatalogSchemaVersion: v.optional(v.string()),
    businessId: v.id('businesses'),
    slug: v.string(),
    businessName: v.string(),
    category: v.string(),
    suburb: v.string(),
    stateTerritory: v.string(),
    postcode: v.optional(v.string()),
    publicUrl: v.string(),
    manifestUrl: v.string(),
    ucpVersion: v.string(),
    pathKind: literalUnion(DiscoveryPathKindValues),
    disposition: v.optional(v.union(v.literal('current'), v.literal('partial'), v.literal('stale'))),
    sourceHash: v.string(),
    sourceVersion: v.string(),
    generatedHash: v.string(),
    bodyHash: v.string(),
    urlHash: v.string(),
    generatedAt: v.number(),
    observedAt: v.optional(v.number()),
    degradedReason: v.optional(v.string()),
    suppressedAt: v.optional(v.number()),
    routes: v.array(discoveryManifestRoute),
    offerings: v.optional(v.array(discoveryManifestOffering)),
  })
    .index('by_business_version', ['businessId', 'ucpVersion'])
    .index('by_business_generatedAt', ['businessId', 'generatedAt']),

  discoveryManifestAttempts: defineTable({
    attemptId: v.string(),
    businessId: v.id('businesses'),
    ucpVersion: v.string(),
    pathKind: literalUnion(DiscoveryPathKindValues),
    sourceHash: v.string(),
    sourceVersion: v.string(),
    status: literalUnion(DiscoveryAttemptStatusValues),
    retryCount: v.number(),
    failureCode: v.optional(v.string()),
    failureMessageRedacted: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    generatedHash: v.optional(v.string()),
    bodyHash: v.optional(v.string()),
    urlHash: v.optional(v.string()),
    latestManifestUrl: v.optional(v.string()),
    latestRouteUrls: v.optional(v.array(v.string())),
    latestReadback: v.optional(discoveryManifestReadback),
    staleThresholdAt: v.optional(v.number()),
    repairAction: literalUnion(DiscoveryRepairActionValues),
    repairResult: literalUnion(DiscoveryRepairResultValues),
  })
    .index('by_attemptId', ['attemptId'])
    .index('by_business_startedAt', ['businessId', 'startedAt'])
    .index('by_business_status', ['businessId', 'status']),
} as const

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ExternalOperationProvenanceValues,
  FirstRequestModeValues,
  HumanRequestChannelValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  PublicFirstRequestChannelValues,
} from '@/modules/catalog/schema-values'
import { businessContext } from '@/modules/business/public'
import {
  DiscoveryAttemptStatusValues,
  DiscoveryManifestRouteKindValues,
  DiscoveryPathKindValues,
  DiscoveryRepairActionValues,
  DiscoveryRepairResultValues,
  DiscoveryStatusValues,
} from './schema-values'

const discoveryManifestRoute = v.object({
  kind: literalUnion(DiscoveryManifestRouteKindValues),
  url: v.string(),
  routeTested: v.literal(true),
})

const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

const discoveryManifestPrice = v.union(
  v.object({
    kind: v.literal('quote_only'),
    currency: v.string(),
    unit: v.optional(literalUnion(OfferingPriceUnitValues)),
    taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
  }),
  v.object({
    kind: v.union(v.literal('fixed'), v.literal('from')),
    amount: exactAmountValue,
    unit: v.optional(literalUnion(OfferingPriceUnitValues)),
    taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
  }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountValue,
    maximum: exactAmountValue,
    unit: v.optional(literalUnion(OfferingPriceUnitValues)),
    taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
  }),
)

const discoveryManifestHumanRequestAccessPath = v.object({
  accessPathRef: v.string(),
  offeringRevision: v.number(),
  kind: v.literal('human_request'),
  channel: literalUnion(HumanRequestChannelValues),
  disclosure: v.string(),
  url: v.optional(v.string()),
})

const discoveryManifestExternalOperationAccessPath = v.object({
  accessPathRef: v.string(),
  offeringRevision: v.number(),
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

// These values belong only to the retired service-capability manifest shape.
const legacyCapabilityKindValues = [
  'phone_inquiry',
  'quote_request',
  'emergency_callout_interest',
  'ae_hosted_discovery',
] as const

const legacyServiceCapabilityStatusValues = ['available', 'degraded', 'unavailable', 'stale'] as const


const legacyDiscoveryManifestFirstRequest = v.object({
  mode: literalUnion(FirstRequestModeValues),
  publicDisclosure: v.string(),
  publicChannel: literalUnion(PublicFirstRequestChannelValues),
  noContactReason: v.optional(v.string()),
})

const legacyDiscoveryManifestCapability = v.object({
  kind: literalUnion(legacyCapabilityKindValues),
  status: literalUnion(legacyServiceCapabilityStatusValues),
  firstRequest: legacyDiscoveryManifestFirstRequest,
  callable: v.literal(false),
  paymentRequired: v.literal(false),
  reason: v.optional(v.string()),
})

const legacyDiscoveryManifestService = v.object({
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  status: v.literal('published'),
  capabilities: v.array(legacyDiscoveryManifestCapability),
})

const currentDiscoveryManifest = v.object({
  schemaVersion: v.literal('ae-ucp-fallback:v1'),
  businessCatalogSchemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.id('businesses'),
  slug: v.string(),
  businessName: v.string(),
  category: v.string(),
  businessContext,
  publicUrl: v.string(),
  manifestUrl: v.string(),
  ucpVersion: v.string(),
  pathKind: v.literal('ae_hosted_fallback'),
  disposition: v.optional(v.union(v.literal('current'), v.literal('partial'), v.literal('stale'))),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
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
const legacyDiscoveryManifest = v.object({
  schemaVersion: v.string(),
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
  status: literalUnion(DiscoveryStatusValues),
  sourceHash: v.string(),
  sourceVersion: v.string(),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  generatedAt: v.number(),
  updatedAt: v.number(),
  degradedReason: v.optional(v.string()),
  suppressedAt: v.optional(v.number()),
  routes: v.array(discoveryManifestRoute),
  services: v.array(legacyDiscoveryManifestService),
  unsupportedCapabilities: v.object({
    callable: v.literal(false),
    paymentRequired: v.literal(false),
  }),
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
  discoveryManifests: defineTable(
    v.union(currentDiscoveryManifest, legacyDiscoveryManifest),
  )
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

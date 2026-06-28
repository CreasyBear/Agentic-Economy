import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  CapabilityKindValues,
  FirstRequestModeValues,
  PublicFirstRequestChannelValues,
  ServiceCapabilityStatusValues,
} from '@/modules/catalog/public'
import {
  DiscoveryAttemptStatusValues,
  DiscoveryManifestRouteKindValues,
  DiscoveryPathKindValues,
  DiscoveryRepairActionValues,
  DiscoveryRepairResultValues,
  DiscoveryStatusValues,
} from '@/modules/discovery/public'


const discoveryManifestRoute = v.object({
  kind: literalUnion(DiscoveryManifestRouteKindValues),
  url: v.string(),
  routeTested: v.literal(true),
})

const discoveryManifestFirstRequest = v.object({
  mode: literalUnion(FirstRequestModeValues),
  publicDisclosure: v.string(),
  publicChannel: literalUnion(PublicFirstRequestChannelValues),
  noContactReason: v.optional(v.string()),
})

const discoveryManifestCapability = v.object({
  kind: literalUnion(CapabilityKindValues),
  status: literalUnion(ServiceCapabilityStatusValues),
  firstRequest: discoveryManifestFirstRequest,
  callable: v.literal(false),
  paymentRequired: v.literal(false),
  reason: v.optional(v.string()),
})

const discoveryManifestService = v.object({
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  status: v.literal('published'),
  capabilities: v.array(discoveryManifestCapability),
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
    services: v.array(discoveryManifestService),
    unsupportedCapabilities: v.object({
      callable: v.literal(false),
      paymentRequired: v.literal(false),
    }),
  }).index('by_business_version', ['businessId', 'ucpVersion']),

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
  }).index('by_business_status', ['businessId', 'status']),
} as const

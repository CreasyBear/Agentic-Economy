import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import { DiscoveryAttemptStatusValues, DiscoveryPathKindValues, DiscoveryStatusValues } from '@/modules/discovery/public'

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
  }).index('by_business_version', ['businessId', 'ucpVersion']),

  discoveryManifestAttempts: defineTable({
    attemptId: v.string(),
    businessId: v.id('businesses'),
    ucpVersion: v.string(),
    pathKind: literalUnion(DiscoveryPathKindValues),
    status: literalUnion(DiscoveryAttemptStatusValues),
    failureCode: v.optional(v.string()),
    failureMessageRedacted: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index('by_business_status', ['businessId', 'status']),
} as const

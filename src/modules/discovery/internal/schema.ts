import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import { DiscoveryAttemptStatusValues, DiscoveryPathKindValues, DiscoveryStatusValues } from '@/modules/discovery/public'

export const discoveryTables = {
  discoveryManifests: defineTable({
    businessId: v.id('businesses'),
    ucpVersion: v.string(),
    pathKind: literalUnion(DiscoveryPathKindValues),
    status: literalUnion(DiscoveryStatusValues),
    sourceHash: v.string(),
    generatedHash: v.string(),
    generatedAt: v.number(),
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

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistryProjectionKindValues,
  RegistryProjectionStatusValues,
} from '@/modules/registry/public'
import { PublicStatusValues } from '@/modules/business/public'

export const registryTables = {
  registryProjectionItems: defineTable({
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    projectionKind: literalUnion(RegistryProjectionKindValues),
    publicStatus: literalUnion(PublicStatusValues),
    sourceHash: v.string(),
    generatedHash: v.string(),
    updatedAt: v.number(),
  })
    .index('by_business', ['businessId'])
    .index('by_service', ['serviceId']),

  registryProjectionAttempts: defineTable({
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    logicalKey: v.string(),
    sourceHash: v.string(),
    projectionKind: literalUnion(RegistryProjectionKindValues),
    status: literalUnion(RegistryProjectionStatusValues),
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorRedacted: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_logicalKey', ['logicalKey']),

  indexStatus: defineTable({
    targetType: literalUnion(IndexTargetTypeValues),
    targetRef: v.string(),
    businessId: v.optional(v.id('businesses')),
    serviceId: v.optional(v.id('businessServices')),
    status: literalUnion(IndexStatusValues),
    lastAttemptAt: v.number(),
    sourceHash: v.string(),
    staleReason: v.optional(v.string()),
  })
    .index('by_target_status', ['targetType', 'targetRef', 'status'])
    .index('by_status_lastAttempt', ['status', 'lastAttemptAt']),
} as const

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistryProjectionSourceVersion,
  RegistryProjectionKindValues,
  RegistryRepairActionValues,
  RegistryRepairResultValues,
  RegistryProjectionStatusValues,
} from '@/modules/registry/public'
import { PublicStatusValues } from '@/modules/business/public'

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
    .index('by_logicalKey', ['logicalKey']),

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
    .index('by_target_status', ['targetType', 'targetRef', 'status'])
    .index('by_status_lastAttempt', ['status', 'lastAttemptAt']),
} as const

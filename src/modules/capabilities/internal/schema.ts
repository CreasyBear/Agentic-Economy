import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  AeEndpointCheckStandardVersion,
  BusinessCapabilityKindValues,
  CapabilityTrustStateValues,
} from '@/modules/capabilities/public'
import { AeEndpointCheckAllowedMethods } from './check-standard'

const capabilityKind = literalUnion(BusinessCapabilityKindValues)
const capabilityTrustState = literalUnion(CapabilityTrustStateValues)
const endpointCheckMethod = literalUnion(AeEndpointCheckAllowedMethods)
const capabilityCheckAttemptStatus = v.union(
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('stale')
)
const capabilityCheckRepairAction = v.union(
  v.literal('none'),
  v.literal('retry_later'),
  v.literal('no_repair')
)

const capabilityCheckReadback = v.object({
  attemptId: v.string(),
  standardVersion: v.literal(AeEndpointCheckStandardVersion),
  checkedAt: v.number(),
  trustState: capabilityTrustState,
  checkedEvidenceCount: v.number(),
  reachabilityCode: v.string(),
  schemaCode: v.string(),
  freshnessCode: v.string(),
  contradictionCode: v.string(),
  publicReadbackAllowed: v.literal(true),
  privatePayloadAllowed: v.literal(false),
})

export const capabilityTables = {
  businessCapabilities: defineTable({
    capabilityId: v.string(),
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    descriptorKey: v.string(),
    kind: capabilityKind,
    descriptorJson: v.string(),
    sourceHash: v.string(),
    standardVersion: v.literal(AeEndpointCheckStandardVersion),
    trustState: capabilityTrustState,
    checkedEvidenceCount: v.number(),
    latestAttemptId: v.optional(v.string()),
    latestReadback: v.optional(capabilityCheckReadback),
    repairAction: capabilityCheckRepairAction,
    retryCount: v.optional(v.number()),
    retryAfter: v.optional(v.number()),
    recheckEnabled: v.optional(v.literal(true)),
    staleThresholdAt: v.optional(v.number()),
    recheckPayloadJson: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('by_capabilityId', ['capabilityId'])
    .index('by_business_kind', ['businessId', 'kind'])
    .index('by_business_service_kind', ['businessId', 'serviceId', 'kind'])
    .index('by_descriptorKey', ['descriptorKey'])
    .index('by_recheckEnabled_staleThresholdAt', ['recheckEnabled', 'staleThresholdAt']),

  capabilityCheckAttempts: defineTable({
    attemptId: v.string(),
    capabilityId: v.string(),
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    descriptorKey: v.string(),
    kind: capabilityKind,
    standardVersion: v.literal(AeEndpointCheckStandardVersion),
    method: endpointCheckMethod,
    url: v.string(),
    sourceHash: v.string(),
    previousSourceHash: v.string(),
    previousState: capabilityTrustState,
    trustState: capabilityTrustState,
    status: capabilityCheckAttemptStatus,
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    repairAction: capabilityCheckRepairAction,
    checkedEvidenceCount: v.number(),
    facetsJson: v.string(),
    readback: capabilityCheckReadback,
    failureCode: v.optional(v.string()),
    failureMessageRedacted: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.number(),
  })
    .index('by_attemptId', ['attemptId'])
    .index('by_capability_startedAt', ['capabilityId', 'startedAt'])
    .index('by_business_status', ['businessId', 'status']),
} as const

import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ActivationStageValues,
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  OperationKeyStatusValues,
  OperatorControlKeyValues,
} from '@/modules/observability/public'

export const observabilityTables = {
  operationKeys: defineTable({
    scope: v.string(),
    actorKind: literalUnion(ActorKindValues),
    actorRef: v.string(),
    operationName: v.string(),
    key: v.string(),
    requestHash: v.string(),
    sourceHash: v.optional(v.string()),
    status: literalUnion(OperationKeyStatusValues),
    resultHash: v.optional(v.string()),
    effectRefs: v.array(v.string()),
    retryAfter: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_actor_operation_key', ['actorRef', 'operationName', 'key']),

  auditEvents: defineTable({
    eventId: v.string(),
    eventType: literalUnion(AuditEventTypeValues),
    actorKind: literalUnion(ActorKindValues),
    actorRef: v.string(),
    authSessionRef: v.optional(v.string()),
    orgRef: v.optional(v.string()),
    businessId: v.optional(v.id('businesses')),
    slug: v.optional(v.string()),
    targetType: literalUnion(AuditTargetTypeValues),
    targetRef: v.string(),
    beforeState: v.optional(v.string()),
    afterState: v.optional(v.string()),
    idempotencyKey: v.string(),
    correlationId: v.string(),
    reasonCode: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
    redactedPayloadJson: v.string(),
    payloadHash: v.string(),
    failureCode: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_business_createdAt', ['businessId', 'createdAt'])
    .index('by_correlationId', ['correlationId']),

  operatorControls: defineTable({
    key: literalUnion(OperatorControlKeyValues),
    enabled: v.boolean(),
    changedByAdminRef: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    correlationId: v.string(),
    expiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  funnelEvents: defineTable({
    eventType: literalUnion(FunnelEventTypeValues),
    source: v.string(),
    stage: literalUnion(ActivationStageValues),
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    pseudonymousSessionId: v.string(),
    actorRef: v.optional(v.string()),
    businessId: v.optional(v.id('businesses')),
    claimId: v.optional(v.id('claims')),
    redactedPayloadJson: v.string(),
    consentFlag: v.boolean(),
    correlationId: v.string(),
    createdAt: v.number(),
  })
    .index('by_session_createdAt', ['pseudonymousSessionId', 'createdAt'])
    .index('by_business_createdAt', ['businessId', 'createdAt'])
    .index('by_source_stage', ['source', 'stage']),

  ownerActivationState: defineTable({
    businessId: v.id('businesses'),
    stage: literalUnion(ActivationStageValues),
    publishSeen: v.boolean(),
    statusSeen: v.boolean(),
    capabilityHealthSeen: v.boolean(),
    sharedOrInterestSubmitted: v.boolean(),
    attributionRecorded: v.boolean(),
    frictionCode: v.optional(v.string()),
    lastEventAt: v.number(),
  }).index('by_business_stage', ['businessId', 'stage']),
} as const

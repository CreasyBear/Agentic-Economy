import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ActorKindValues,
  OperationKeyStatusValues,
} from '@/modules/observability/public'
import {
  AuditSourceSystemValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
} from '@/modules/common/audit-events'

export const observabilityTables = {
  auditEvents: defineTable({
    eventId: v.string(),
    eventType: literalUnion(AuditEventTypeValues),
    actorKind: literalUnion(ActorKindValues),
    actorRef: v.string(),
    activeAccountRef: v.optional(v.string()),
    sourceSystem: v.optional(literalUnion(AuditSourceSystemValues)),
    observedAt: v.optional(v.number()),
    authorityGeneration: v.optional(v.number()),
    businessId: v.optional(v.id('businesses')),
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
    .index('by_eventId', ['eventId'])
    .index('by_activeAccountRef_and_createdAt', ['activeAccountRef', 'createdAt'])
    .index('by_activeAccountRef_and_targetType_and_targetRef_and_createdAt', [
      'activeAccountRef',
      'targetType',
      'targetRef',
      'createdAt',
    ]),

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
  })
    .index('by_actor_operation_key', ['actorRef', 'operationName', 'key'])
    .index('by_scope_key', ['scope', 'key']),
} as const

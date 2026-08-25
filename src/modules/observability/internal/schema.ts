import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ActorKindValues,
  OperationKeyStatusValues,
} from '@/modules/observability/public'
import {
  StoredAuditEventTypeValues,
  StoredAuditTargetTypeValues,
} from '@/modules/observability/stored-compatibility'

export const observabilityTables = {
  auditEvents: defineTable({
    eventId: v.string(),
    eventType: literalUnion(StoredAuditEventTypeValues),
    actorKind: literalUnion(ActorKindValues),
    actorRef: v.string(),
    businessId: v.optional(v.id('businesses')),
    targetType: literalUnion(StoredAuditTargetTypeValues),
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
  }).index('by_eventId', ['eventId']),

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

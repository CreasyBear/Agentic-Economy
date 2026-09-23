import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ActorKindValues,
  OperationKeyStatusValues,
} from './literals'
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
    outcome: v.optional(v.string()),
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
    ])
    .index('by_createdAt', ['createdAt'])
    .index('by_eventType_and_createdAt', ['eventType', 'createdAt'])
    .index('by_actorRef_and_createdAt', ['actorRef', 'createdAt'])
    .index('by_targetType_and_targetRef_and_createdAt', [
      'targetType',
      'targetRef',
      'createdAt',
    ])
    .index('by_correlationId_and_createdAt', ['correlationId', 'createdAt']),

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
    resultJson: v.optional(v.string()),
    effectRefs: v.array(v.string()),
    retryAfter: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_actor_operation_key', ['actorRef', 'operationName', 'key'])
    .index('by_scope_key', ['scope', 'key']),

  marketplaceMetricDays: defineTable({
    day: v.string(),
    computedAt: v.number(),
    version: v.literal(1),
    // Legacy snapshots lack this field; every new snapshot writes it.
    complete: v.optional(v.boolean()),
    settledCallValue: v.union(
      v.null(),
      v.object({
        units: v.string(),
        exponent: v.number(),
        currency: v.string(),
      }),
    ),
    // Legacy rows say not_configured; new snapshots never emit it.
    money: v.union(v.literal('settled_only'), v.literal('no_settled_usage'), v.literal('not_configured')),
    settledCalls: v.number(),
    attemptedCalls: v.number(),
    completedCalls: v.number(),
    uncertainCalls: v.number(),
    uncertainCallsOpenAtClose: v.number(),
    quotesCreated: v.number(),
    quotesConvertedAtClose: v.number(),
    transactingWorkspaces: v.number(),
    transactingAgents: v.number(),
    transactingProviders: v.number(),
    transactingTools: v.number(),
    returningWorkspaces: v.number(),
    newTransactingWorkspaces: v.number(),
    newTransactingProviders: v.number(),
    terminalCalls: v.number(),
    terminalCallsWithResolution: v.number(),
  }).index('by_day', ['day']),

  marketplaceEntityDays: defineTable({
    day: v.string(),
    entityKind: v.union(
      v.literal('workspace'),
      v.literal('agent'),
      v.literal('provider'),
      v.literal('tool'),
    ),
    entityRef: v.string(),
  })
    .index('by_day_and_entityKind', ['day', 'entityKind'])
    .index('by_entityKind_and_entityRef_and_day', [
      'entityKind',
      'entityRef',
      'day',
    ]),
} as const

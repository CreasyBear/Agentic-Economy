import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  ActorKindValues,
  OperationKeyStatusValues,
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
  })
    .index('by_actor_operation_key', ['actorRef', 'operationName', 'key'])
    .index('by_scope_key', ['scope', 'key']),
} as const

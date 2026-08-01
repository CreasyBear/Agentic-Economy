import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { literalUnion } from '@/modules/common/convex-literals'
const DecisionMapEventKindValues = ['draft_created', 'choice_recorded', 'constraint_changed'] as const

/**
 * Decision-map snapshots are intentionally kept as one bounded canonical JSON
 * value. The domain model owns its shape and validation; Convex owns the
 * durable version, digest, and event journal around that value.
 */
export const decisionMapTables = {
  decisionMaps: defineTable({
    projectId: v.string(),
    threadId: v.string(),
    ownerSessionId: v.optional(v.string()),
    generation: v.number(),
    revision: v.number(),
    snapshotJson: v.string(),
    snapshotDigest: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_threadId', ['threadId'])
    .index('by_projectId', ['projectId'])
    .index('by_threadId_and_generation', ['threadId', 'generation'])
    .index('by_projectId_and_generation', ['projectId', 'generation']),

  decisionMapEvents: defineTable({
    projectId: v.string(),
    threadId: v.string(),
    generation: v.number(),
    revision: v.number(),
    seq: v.number(),
    kind: literalUnion(DecisionMapEventKindValues),
    operationKey: v.string(),
    payloadJson: v.string(),
    payloadDigest: v.string(),
    at: v.number(),
  })
    .index('by_operationKey', ['operationKey'])
    .index('by_threadId_and_seq', ['threadId', 'seq'])
    .index('by_projectId_and_seq', ['projectId', 'seq'])
    .index('by_threadId_and_generation_and_seq', ['threadId', 'generation', 'seq']),
} as const

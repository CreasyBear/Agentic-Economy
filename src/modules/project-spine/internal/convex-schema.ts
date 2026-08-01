import { defineTable } from 'convex/server'
import { v } from 'convex/values'

const definitionVersion = v.union(v.literal('projectSpine_v1'), v.literal('projectSpine_v2'))

export const projectSpineTables = {
  projectSpine: defineTable({
    projectId: v.string(),
    generation: v.number(),
    charterRef: v.optional(v.string()),
    status: v.union(
      v.literal('awaiting_decision'),
      v.literal('decision_received'),
      v.literal('chasing'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    workflowId: v.optional(v.string()),
    definitionVersion,
    planRevision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_projectId', ['projectId'])
    .index('by_projectId_and_generation', ['projectId', 'generation']),

  projectSpineEvents: defineTable({
    projectId: v.string(),
    generation: v.number(),
    seq: v.number(),
    kind: v.union(
      v.literal('workflow_started'),
      v.literal('decision_received'),
      v.literal('workflow_entry'),
      v.literal('chase_recorded'),
      v.literal('quote_refreshed'),
      v.literal('generation_advanced'),
    ),
    operationKey: v.string(),
    payloadHash: v.string(),
    at: v.number(),
  })
    .index('by_projectId_and_seq', ['projectId', 'seq'])
    .index('by_projectId_and_generation_and_seq', ['projectId', 'generation', 'seq'])
    .index('by_operationKey', ['operationKey']),

  projectSpineQuotes: defineTable({
    projectId: v.string(),
    generation: v.number(),
    quoteId: v.string(),
    revision: v.number(),
    staleAfter: v.number(),
    refreshedAt: v.number(),
  })
    .index('by_projectId_and_quoteId', ['projectId', 'quoteId'])
    .index('by_projectId_and_generation', ['projectId', 'generation']),
}

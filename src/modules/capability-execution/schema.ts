import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { capabilityCallTables as existingCapabilityCallTables } from './internal/convex-schema'
import { callFeedbackValue } from './call-feedback'

export const capabilityCallTables = {
  ...existingCapabilityCallTables,
  callUsefulnessFeedback: defineTable({
    callRef: v.string(), accountRef: v.string(), toolRef: v.string(), feedback: callFeedbackValue,
    createdAt: v.number(), updatedAt: v.number(), expiresAt: v.number(),
  })
    .index('by_accountRef_and_callRef', ['accountRef', 'callRef'])
    .index('by_updatedAt', ['updatedAt'])
    .index('by_expiresAt', ['expiresAt']),
  toolSelectionDecisions: defineTable({
    kind: v.union(
      v.literal('procure'),
      v.literal('registry_rerank'),
      v.literal('directory_rerank'),
      v.literal('chat_recommend'),
    ),
    threadId: v.optional(v.string()),
    promptMessageId: v.optional(v.string()),
    shown: v.optional(v.boolean()),
    ranToolRef: v.optional(v.string()),
    ranAt: v.optional(v.number()),
    accountRef: v.optional(v.string()),
    correlationId: v.string(),
    offered: v.array(v.object({
      toolRef: v.string(),
      rank: v.number(),
      score: v.number(),
    })),
    pickedToolRef: v.optional(v.string()),
    tier: v.string(),
    modelConfidence: v.optional(v.number()),
    fit: v.array(v.object({
      toolRef: v.string(),
      noul: v.optional(v.number()),
      score: v.optional(v.number()),
    })),
    latencyMs: v.number(),
    costAud: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_accountRef_and_createdAt', ['accountRef', 'createdAt'])
    .index('by_kind_and_createdAt', ['kind', 'createdAt'])
    .index('by_createdAt', ['createdAt'])
    .index('by_threadId_and_promptMessageId', ['threadId', 'promptMessageId'])
    .index('by_threadId_and_createdAt', ['threadId', 'createdAt']),
} as const

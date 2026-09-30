import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { capabilityCallTables as existingCapabilityCallTables } from './internal/convex-schema'

export const capabilityCallTables = {
  ...existingCapabilityCallTables,
  toolSelectionDecisions: defineTable({
    kind: v.union(
      v.literal('procure'),
      v.literal('registry_rerank'),
      v.literal('directory_rerank'),
    ),
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
    .index('by_createdAt', ['createdAt']),
} as const

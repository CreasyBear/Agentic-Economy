import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const principalKindValue = v.union(
  v.literal('human'),
  v.literal('organization'),
  v.literal('agent'),
  v.literal('workload'),
)

export const principalLifecycleValue = v.union(
  v.literal('active'),
  v.literal('suspended'),
  v.literal('merged'),
  v.literal('retired'),
)

export const principalValue = v.object({
  principalRef: v.string(),
  kind: principalKindValue,
  displayName: v.string(),
  lifecycle: principalLifecycleValue,
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  mergedIntoPrincipalRef: v.optional(v.string()),
})

export const principalTables = {
  principals: defineTable(principalValue)
    .index('by_principalRef', ['principalRef'])
    .index('by_kind_and_lifecycle', ['kind', 'lifecycle'])
    .index('by_lifecycle_and_updatedAt', ['lifecycle', 'updatedAt']),
} as const

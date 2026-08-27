import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const chatSharingTables = {
  chatThreadShares: defineTable({
    threadId: v.string(),
    accessId: v.string(),
    generation: v.number(),
    verifier: v.string(),
    keyId: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_accessId', ['accessId'])
    .index('by_threadId', ['threadId']),
} as const

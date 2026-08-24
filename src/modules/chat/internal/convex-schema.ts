import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const chatTables = {
  chatThreads: defineTable({
    threadId: v.string(),
    ownerId: v.string(),
    title: v.string(),
    updatedAt: v.number(),
    activePromptMessageId: v.optional(v.string()),
    activeStartedAt: v.optional(v.number()),
  })
    .index('by_threadId', ['threadId'])
    .index('by_ownerId_and_updatedAt', ['ownerId', 'updatedAt'])
    .searchIndex('search_title_by_ownerId', {
      searchField: 'title',
      filterFields: ['ownerId'],
    }),

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

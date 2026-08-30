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
} as const

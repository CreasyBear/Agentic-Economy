import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const chatTables = {
  chatThreads: defineTable({
    threadId: v.string(),
    ownerId: v.string(),
    principalKind: v.optional(v.union(v.literal('agent_key'), v.literal('clerk_owner'))),
    principalRef: v.optional(v.string()),
    title: v.string(),
    updatedAt: v.number(),
    activePromptMessageId: v.optional(v.string()),
    activeStartedAt: v.optional(v.number()),
    searchCursorSigningKey: v.optional(v.string()),
  })
    .index('by_threadId', ['threadId'])
    .index('by_ownerId_and_updatedAt', ['ownerId', 'updatedAt'])
    .searchIndex('search_title_by_ownerId', {
      searchField: 'title',
      filterFields: ['ownerId'],
    }),
  chatTurns: defineTable({
    turnRef: v.string(),
    threadId: v.optional(v.string()),
    principalKind: v.union(v.literal('agent_key'), v.literal('clerk_owner')),
    principalRef: v.string(),
    accountRef: v.string(),
    credentialLocator: v.optional(v.string()),
    grantRef: v.optional(v.string()),
    origin: v.optional(v.literal('owner_chat')),
    clientTurnId: v.string(),
    materialDigest: v.string(),
    state: v.union(
      v.literal('submitted'), v.literal('working'), v.literal('input-required'),
      v.literal('auth-required'), v.literal('completed'), v.literal('failed'),
      v.literal('canceled'), v.literal('rejected'),
    ),
    sequence: v.optional(v.number()),
    promptMessageId: v.optional(v.string()),
    deadlineAt: v.optional(v.number()),
    failureReason: v.optional(v.union(
      v.literal('generation_failed'), v.literal('generation_timed_out'), v.literal('outcome_unknown'),
    )),
    failureCallRefs: v.optional(v.array(v.string())),
    searchContinuation: v.optional(v.object({ query: v.string(), cursor: v.string(), inputJson: v.string() })),
    issuedSearchContinuations: v.optional(v.array(v.object({ query: v.string(), cursor: v.string(), inputJson: v.string(), token: v.string() }))),
    cancelRequestedAt: v.optional(v.number()),
    inFlightCallRefs: v.optional(v.array(v.string())),
    callRefs: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_principalRef_and_clientTurnId', ['principalRef', 'clientTurnId'])
    .index('by_threadId_and_sequence', ['threadId', 'sequence'])
    .index('by_promptMessageId', ['promptMessageId'])
    .index('by_turnRef', ['turnRef']),
} as const

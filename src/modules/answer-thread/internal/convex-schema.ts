import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

import {
  AnswerTurnReservationStateValues,
  AnswerTurnStatusValues,
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  FollowUpIntentValues,
} from '../answer-thread.values'

export const answerThreadTables = {
  answerThreads: defineTable({
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_threadId', ['threadId'])
    .index('by_session_updatedAt', ['pseudonymousSessionId', 'updatedAt']),

  answerTurns: defineTable({
    turnId: v.string(),
    threadId: v.string(),
    seq: v.number(),
    query: v.string(),
    intent: literalUnion(FollowUpIntentValues),
    evidenceJson: v.string(),
    snapshotHash: v.string(),
    proseJson: v.string(),
    artifactKindsJson: v.string(),
    status: literalUnion(AnswerTurnStatusValues),
    errorCopyId: v.optional(v.string()),
    errorProblemJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_turnId', ['turnId'])
    .index('by_thread_seq', ['threadId', 'seq']),

  answerTurnReservations: defineTable({
    reservationKey: v.string(),
    sessionId: v.string(),
    requestedThreadScope: v.string(),
    requestDigest: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    seq: v.number(),
    query: v.string(),
    searchContextJson: v.optional(v.string()),
    generation: v.number(),
    checkpointGeneration: v.optional(v.number()),
    checkpointStep: v.optional(v.number()),
    checkpointDigest: v.optional(v.string()),
    checkpointJson: v.optional(v.string()),
    state: literalUnion(AnswerTurnReservationStateValues),
    finalStatus: v.optional(v.union(v.literal('complete'), v.literal('error'))),
    answerDigest: v.optional(v.string()),
    harnessFinalizationDigest: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_reservationKey', ['reservationKey'])
    .index('by_turnId', ['turnId'])
    .index('by_thread_seq', ['threadId', 'seq']),

  answerToolCalls: defineTable({
    toolCallId: v.string(),
    turnId: v.string(),
    seq: v.number(),
    toolId: literalUnion(AnswerToolIdValues),
    inputJson: v.string(),
    resultSummaryJson: v.string(),
    resultJson: v.optional(v.string()),
    resultHash: v.string(),
    status: literalUnion(AnswerToolCallStatusValues),
    createdAt: v.number(),
  })
    .index('by_toolCallId', ['toolCallId'])
    .index('by_turn_seq', ['turnId', 'seq']),
  answerThreadShares: defineTable({
    threadId: v.string(),
    accessId: v.string(),
    generation: v.number(),
    verifier: v.string(),
    keyId: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_threadId', ['threadId'])
    .index('by_accessId', ['accessId'])
    .index('by_thread_status', ['threadId', 'status']),

} as const

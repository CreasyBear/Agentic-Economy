import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'

import {
  AnswerTurnStatusValues,
  AnswerThreadSharePolicyValues,
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  FollowUpIntentValues,
} from '../answer-thread.schema'

export const answerThreadTables = {
  answerThreads: defineTable({
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    title: v.string(),
    sharePolicy: literalUnion(AnswerThreadSharePolicyValues),
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
    createdAt: v.number(),
  })
    .index('by_turnId', ['turnId'])
    .index('by_thread_createdAt', ['threadId', 'createdAt']),

  answerToolCalls: defineTable({
    toolCallId: v.string(),
    turnId: v.string(),
    seq: v.number(),
    toolId: literalUnion(AnswerToolIdValues),
    inputJson: v.string(),
    resultSummaryJson: v.string(),
    resultHash: v.string(),
    status: literalUnion(AnswerToolCallStatusValues),
    createdAt: v.number(),
  })
    .index('by_toolCallId', ['toolCallId'])
    .index('by_turn_seq', ['turnId', 'seq']),
} as const

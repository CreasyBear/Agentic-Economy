import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import {
  AnswerTurnStatusValues,
  AnswerThreadSharePolicyValues,
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  FollowUpIntentValues,
} from '../src/modules/answer-thread/answer-thread.schema'
import { buildPublicThreadProjection } from '../src/modules/answer-thread/projection'
import type {
  AnswerThreadRecord,
  AnswerToolCallRecord,
  AnswerTurnRecord,
} from '../src/modules/answer-thread/answer-thread.schema'

const now = () => Date.now()

export const createAnswerThread = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const timestamp = now()
    await ctx.db.insert('answerThreads', {
      threadId: args.threadId,
      pseudonymousSessionId: args.pseudonymousSessionId,
      title: args.title,
      sharePolicy: 'public',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return { threadId: args.threadId }
  },
})

export const appendAnswerTurn = mutationGeneric({
  args: {
    turnId: v.string(),
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    seq: v.number(),
    query: v.string(),
    intent: literalUnion(FollowUpIntentValues),
    evidenceJson: v.string(),
    snapshotHash: v.string(),
    proseJson: v.string(),
    artifactKindsJson: v.string(),
    status: literalUnion(AnswerTurnStatusValues),
    errorCopyId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (thread === null) {
      throw new Error('thread_not_found')
    }

    if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
      throw new Error('thread_forbidden')
    }

    const existingTurns = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .collect()

    if (existingTurns.length >= 25) {
      throw new Error('thread_turn_limit')
    }

    await ctx.db.insert('answerTurns', {
      turnId: args.turnId,
      threadId: args.threadId,
      seq: args.seq,
      query: args.query,
      intent: args.intent,
      evidenceJson: args.evidenceJson,
      snapshotHash: args.snapshotHash,
      proseJson: args.proseJson,
      artifactKindsJson: args.artifactKindsJson,
      status: args.status,
      createdAt: now(),
      ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
    })

    await ctx.db.patch(thread._id, { updatedAt: now() })
    return { turnId: args.turnId }
  },
})

export const appendAnswerTurnWithToolCalls = mutationGeneric({
  args: {
    turnId: v.string(),
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    seq: v.number(),
    query: v.string(),
    intent: literalUnion(FollowUpIntentValues),
    evidenceJson: v.string(),
    snapshotHash: v.string(),
    proseJson: v.string(),
    artifactKindsJson: v.string(),
    status: literalUnion(AnswerTurnStatusValues),
    errorCopyId: v.optional(v.string()),
    toolCalls: v.array(
      v.object({
        toolCallId: v.string(),
        seq: v.number(),
        toolId: literalUnion(AnswerToolIdValues),
        inputJson: v.string(),
        resultSummaryJson: v.string(),
        resultHash: v.string(),
        status: literalUnion(AnswerToolCallStatusValues),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (thread === null) {
      throw new Error('thread_not_found')
    }

    if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
      throw new Error('thread_forbidden')
    }

    const existingTurns = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .collect()

    if (existingTurns.length >= 25) {
      throw new Error('thread_turn_limit')
    }

    const timestamp = now()
    await ctx.db.insert('answerTurns', {
      turnId: args.turnId,
      threadId: args.threadId,
      seq: args.seq,
      query: args.query,
      intent: args.intent,
      evidenceJson: args.evidenceJson,
      snapshotHash: args.snapshotHash,
      proseJson: args.proseJson,
      artifactKindsJson: args.artifactKindsJson,
      status: args.status,
      createdAt: timestamp,
      ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
    })

    for (const call of args.toolCalls) {
      await ctx.db.insert('answerToolCalls', {
        toolCallId: call.toolCallId,
        turnId: args.turnId,
        seq: call.seq,
        toolId: call.toolId,
        inputJson: call.inputJson,
        resultSummaryJson: call.resultSummaryJson,
        resultHash: call.resultHash,
        status: call.status,
        createdAt: timestamp,
      })
    }

    await ctx.db.patch(thread._id, { updatedAt: now() })
    return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
  },
})

export const appendAnswerToolCalls = mutationGeneric({
  args: {
    turnId: v.string(),
    toolCalls: v.array(
      v.object({
        toolCallId: v.string(),
        seq: v.number(),
        toolId: literalUnion(AnswerToolIdValues),
        inputJson: v.string(),
        resultSummaryJson: v.string(),
        resultHash: v.string(),
        status: literalUnion(AnswerToolCallStatusValues),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const nowTs = now()
    for (const call of args.toolCalls) {
      await ctx.db.insert('answerToolCalls', {
        toolCallId: call.toolCallId,
        turnId: args.turnId,
        seq: call.seq,
        toolId: call.toolId,
        inputJson: call.inputJson,
        resultSummaryJson: call.resultSummaryJson,
        resultHash: call.resultHash,
        status: call.status,
        createdAt: nowTs,
      })
    }
    return { inserted: args.toolCalls.length }
  },
})

export const readTurnToolCalls = queryGeneric({
  args: { turnId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('answerToolCalls')
      .withIndex('by_turn_seq', (q) => q.eq('turnId', args.turnId))
      .collect()

    return {
      toolCalls: rows.map(toToolCallRecord).sort((a, b) => a.seq - b.seq),
    }
  },
})

export const listSessionThreads = queryGeneric({
  args: {
    pseudonymousSessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20
    const rows = await ctx.db
      .query('answerThreads')
      .withIndex('by_session_updatedAt', (q) => q.eq('pseudonymousSessionId', args.pseudonymousSessionId))
      .order('desc')
      .take(limit)

    return {
      threads: rows.map(toThreadRecord),
    }
  },
})

export const getThreadTurns = queryGeneric({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .collect()

    return {
      turns: rows.map(toTurnRecord).sort((a, b) => a.seq - b.seq),
    }
  },
})

export const getAnswerThread = queryGeneric({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const threadRow = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (threadRow === null) {
      return null
    }

    const turnRows = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .collect()

    const thread = toThreadRecord(threadRow)
    return {
      ...thread,
      turnCount: turnRows.length,
    }
  },
})

export const getPublicThreadProjection = queryGeneric({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const threadRow = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (threadRow === null) {
      return null
    }

    const turnRows = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .collect()

    return buildPublicThreadProjection(
      toThreadRecord(threadRow),
      turnRows.map(toTurnRecord),
    )
  },
})

function toThreadRecord(row: Record<string, unknown>): AnswerThreadRecord {
  return {
    threadId: String(row.threadId),
    pseudonymousSessionId: String(row.pseudonymousSessionId),
    title: String(row.title),
    sharePolicy: row.sharePolicy as AnswerThreadRecord['sharePolicy'],
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

function toTurnRecord(row: Record<string, unknown>): AnswerTurnRecord {
  return {
    turnId: String(row.turnId),
    threadId: String(row.threadId),
    seq: Number(row.seq),
    query: String(row.query),
    intent: row.intent as AnswerTurnRecord['intent'],
    evidenceJson: String(row.evidenceJson),
    snapshotHash: String(row.snapshotHash),
    proseJson: String(row.proseJson),
    artifactKindsJson: String(row.artifactKindsJson),
    status: row.status as AnswerTurnRecord['status'],
    ...(row.errorCopyId === undefined ? {} : { errorCopyId: String(row.errorCopyId) }),
    createdAt: Number(row.createdAt),
  }
}

function toToolCallRecord(row: Record<string, unknown>): AnswerToolCallRecord {
  return {
    toolCallId: String(row.toolCallId),
    turnId: String(row.turnId),
    seq: Number(row.seq),
    toolId: row.toolId as AnswerToolCallRecord['toolId'],
    inputJson: String(row.inputJson),
    resultSummaryJson: String(row.resultSummaryJson),
    resultHash: String(row.resultHash),
    status: row.status as AnswerToolCallRecord['status'],
    createdAt: Number(row.createdAt),
  }
}

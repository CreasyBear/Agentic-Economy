import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import { resolveAdminAuthority } from './authz'
import { runtimeDb } from './source_state'
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

const answerTurnRecordResult = v.object({
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

const adminHarnessRunTurnsResult = v.union(
  v.object({
    kind: v.literal('allowed'),
    actorRef: v.string(),
    turns: v.array(answerTurnRecordResult),
    limit: v.number(),
    truncated: v.boolean(),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.union(v.literal('missing_membership'), v.literal('inactive_membership'), v.literal('action_not_allowed')),
    turns: v.array(answerTurnRecordResult),
    limit: v.number(),
    truncated: v.literal(false),
  }),
)

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
        resultJson: v.string(),
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
        resultJson: call.resultJson,
        resultHash: call.resultHash,
        status: call.status,
        createdAt: timestamp,
      })
    }

    await ctx.db.patch(thread._id, { updatedAt: now() })
    return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
  },
})

export const appendAnswerTurnWithThreadAndToolCalls = mutationGeneric({
  args: {
    turnId: v.string(),
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    title: v.string(),
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
        resultJson: v.string(),
        resultHash: v.string(),
        status: literalUnion(AnswerToolCallStatusValues),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const timestamp = now()
    const existingThread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (existingThread !== null && existingThread.pseudonymousSessionId !== args.pseudonymousSessionId) {
      throw new Error('thread_forbidden')
    }

    if (existingThread !== null) {
      const existingTurns = await ctx.db
        .query('answerTurns')
        .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
        .collect()

      if (existingTurns.length >= 25) {
        throw new Error('thread_turn_limit')
      }
    } else {
      await ctx.db.insert('answerThreads', {
        threadId: args.threadId,
        pseudonymousSessionId: args.pseudonymousSessionId,
        title: args.title,
        sharePolicy: 'public',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
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
        resultJson: call.resultJson,
        resultHash: call.resultHash,
        status: call.status,
        createdAt: timestamp,
      })
    }

    if (existingThread !== null) {
      await ctx.db.patch(existingThread._id, { updatedAt: timestamp })
    }

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
        resultJson: v.string(),
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
        resultJson: call.resultJson,
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

export const listAdminHarnessRunTurns = queryGeneric({
  args: {
    status: v.optional(v.string()),
    turnId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    date: v.optional(v.string()),
    hasRunEvidence: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: adminHarnessRunTurnsResult,
  handler: async (ctx, args) => {
    const limit = normalizeAdminRunViewerLimit(args.limit)
    const authority = await resolveAdminAuthority({ db: runtimeDb(ctx.db), auth: ctx.auth }, 'read_admin_readbacks')
    if (authority.kind === 'denied') {
      return {
        kind: 'denied' as const,
        reason: authority.reason,
        turns: [],
        limit,
        truncated: false as const,
      }
    }

    const turnId = normalizeAdminFilter(args.turnId)
    const threadId = normalizeAdminFilter(args.threadId)
    let rows
    if (turnId !== undefined) {
      const row = await ctx.db
        .query('answerTurns')
        .withIndex('by_turnId', (query) => query.eq('turnId', turnId))
        .unique()
      rows = row === null ? [] : [row]
    } else if (threadId !== undefined) {
      rows = await ctx.db
        .query('answerTurns')
        .withIndex('by_thread_createdAt', (query) => query.eq('threadId', threadId))
        .order('desc')
        .take(limit)
    } else {
      rows = await ctx.db.query('answerTurns').order('desc').take(limit)
    }
    const filtered = rows
      .map(toTurnRecord)
      .filter((turn) => adminHarnessTurnMatchesFilters(turn, args))
      .sort((left, right) => right.createdAt - left.createdAt || right.seq - left.seq)

    return {
      kind: 'allowed' as const,
      actorRef: authority.membership.clerkUserId,
      turns: filtered.slice(0, limit),
      limit,
      truncated: filtered.length > limit || rows.length === limit,
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

export const getAnswerThreadWithTurns = queryGeneric({
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

    const turns = turnRows.map(toTurnRecord).sort((a, b) => a.seq - b.seq)
    return {
      ...toThreadRecord(threadRow),
      turnCount: turns.length,
      turns,
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

function adminHarnessTurnMatchesFilters(
  turn: AnswerTurnRecord,
  filters: {
    status?: string
    turnId?: string
    threadId?: string
    date?: string
    hasRunEvidence?: string
  },
): boolean {
  const turnId = normalizeAdminFilter(filters.turnId)
  if (turnId !== undefined && turn.turnId !== turnId) {
    return false
  }

  const threadId = normalizeAdminFilter(filters.threadId)
  if (threadId !== undefined && turn.threadId !== threadId) {
    return false
  }

  const date = normalizeAdminFilter(filters.date)
  if (date !== undefined && !new Date(turn.createdAt).toISOString().startsWith(date)) {
    return false
  }

  const harnessStatus = readHarnessRunStatus(turn.evidenceJson)
  const hasRunEvidence = harnessStatus !== undefined
  if (filters.hasRunEvidence === 'yes' && !hasRunEvidence) {
    return false
  }
  if (filters.hasRunEvidence === 'no' && hasRunEvidence) {
    return false
  }

  const status = normalizeAdminFilter(filters.status)
  if (status !== undefined && status !== 'any') {
    if (status === 'missing') {
      return !hasRunEvidence
    }
    return turn.status === status || harnessStatus === status
  }

  return true
}

function readHarnessRunStatus(evidenceJson: string): string | undefined {
  try {
    const evidence = JSON.parse(evidenceJson) as { harnessRun?: { summary?: { run?: { status?: unknown } } } }
    const status = evidence.harnessRun?.summary?.run?.status
    return typeof status === 'string' ? status : undefined
  } catch {
    return undefined
  }
}

function normalizeAdminRunViewerLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 250)
}

function normalizeAdminFilter(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function toToolCallRecord(row: Record<string, unknown>): AnswerToolCallRecord {
  return {
    toolCallId: String(row.toolCallId),
    turnId: String(row.turnId),
    seq: Number(row.seq),
    toolId: row.toolId as AnswerToolCallRecord['toolId'],
    inputJson: String(row.inputJson),
    resultSummaryJson: String(row.resultSummaryJson),
    resultJson: typeof row.resultJson === 'string' ? row.resultJson : legacyToolResultJson(row.resultSummaryJson),
    resultHash: String(row.resultHash),
    status: row.status as AnswerToolCallRecord['status'],
    createdAt: Number(row.createdAt),
  }
}

function legacyToolResultJson(resultSummaryJson: unknown): string {
  return JSON.stringify({
    kind: 'legacy_missing_result',
    resultSummary: typeof resultSummaryJson === 'string' ? resultSummaryJson : '',
  })
}

export const deleteAnswerThread = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
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

    const turns = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .collect()

    for (const turn of turns) {
      const toolCalls = await ctx.db
        .query('answerToolCalls')
        .withIndex('by_turn_seq', (q) => q.eq('turnId', turn.turnId))
        .collect()
      for (const toolCall of toolCalls) {
        await ctx.db.delete(toolCall._id)
      }
      await ctx.db.delete(turn._id)
    }

    await ctx.db.delete(thread._id)
    return { threadId: args.threadId }
  },
})

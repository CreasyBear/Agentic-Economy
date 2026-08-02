import { mutationGeneric, paginationOptsValidator, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'

import { literalUnion } from '../src/modules/common/convex-literals'
import { resolveAdminAuthority } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
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

const ANSWER_THREAD_MAX_TURNS = 25
const ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS + 1
const ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS
const ANSWER_THREAD_DELETE_BATCH_SIZE = 100


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
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
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
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
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
      .take(26)

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
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
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
      .take(26)

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
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
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
        .take(26)

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
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
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
  args: {
    turnId: v.string(),
    pseudonymousSessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const turn = await ctx.db
      .query('answerTurns')
      .withIndex('by_turnId', (q) => q.eq('turnId', args.turnId))
      .unique()

    if (turn === null) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', turn.threadId))
      .unique()

    if (thread === null || thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    const page = await ctx.db
      .query('answerToolCalls')
      .withIndex('by_turn_seq', (q) => q.eq('turnId', args.turnId))
      .order('asc')
      .paginate(args.paginationOpts)

    return {
      page: page.page.map(toToolCallRecord),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

export const listSessionThreads = queryGeneric({
  args: {
    pseudonymousSessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeSessionThreadLimit(args.limit)
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
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (thread === null || thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    const page = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .order('asc')
      .paginate(args.paginationOpts)

    return {
      page: page.page.map(toTurnRecord),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
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
    const authority = await resolveAdminAuthority({ db: ctx.db, auth: ctx.auth }, 'read_admin_readbacks')
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
    const filtered: AnswerTurnRecord[] = []
    for (const row of rows) {
      const turn = toTurnRecord(row)
      if (adminHarnessTurnMatchesFilters(turn, args)) {
        filtered.push(turn)
      }
    }
    filtered.sort((left, right) => right.createdAt - left.createdAt || right.seq - left.seq)

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
  args: { threadId: v.string(), pseudonymousSessionId: v.string() },
  handler: async (ctx, args) => {
    const threadRow = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (threadRow === null || threadRow.pseudonymousSessionId !== args.pseudonymousSessionId) {
      return null
    }

    // Snapshot count: answer-thread writes cap a thread at ANSWER_THREAD_MAX_TURNS.
    const turnRows = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .take(ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT)

    const thread = toThreadRecord(threadRow)
    return {
      ...thread,
      turnCount: turnRows.length,
    }
  },
})

export const getAnswerThreadWithTurns = queryGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const threadRow = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()

    if (threadRow === null || threadRow.pseudonymousSessionId !== args.pseudonymousSessionId) {
      return null
    }

    // Snapshot count: answer-thread writes cap a thread at ANSWER_THREAD_MAX_TURNS.
    const turnRows = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .take(ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT)
    const page = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .order('asc')
      .paginate(args.paginationOpts)

    return {
      thread: {
        ...toThreadRecord(threadRow),
        turnCount: turnRows.length,
      },
      turns: {
        page: page.page.map(toTurnRecord),
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      },
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

    // Public route snapshot: answer-thread writes cap a thread at ANSWER_THREAD_MAX_TURNS.
    const turnRows = await ctx.db
      .query('answerTurns')
      .withIndex('by_thread_createdAt', (q) => q.eq('threadId', args.threadId))
      .order('asc')
      .take(ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT)

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

function normalizeSessionThreadLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}

function normalizeAdminFilter(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function toToolCallRecord(row: Record<string, unknown>): AnswerToolCallRecord {
  if (typeof row.resultJson !== 'string') {
    throw new Error('answer_tool_result_missing')
  }

  return {
    toolCallId: String(row.toolCallId),
    turnId: String(row.turnId),
    seq: Number(row.seq),
    toolId: row.toolId as AnswerToolCallRecord['toolId'],
    inputJson: String(row.inputJson),
    resultSummaryJson: String(row.resultSummaryJson),
    resultJson: row.resultJson,
    resultHash: String(row.resultHash),
    status: row.status as AnswerToolCallRecord['status'],
    createdAt: Number(row.createdAt),
  }
}

async function deleteAnswerThreadBatch(ctx: MutationCtx, threadId: string): Promise<void> {
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', threadId))
    .unique()

  if (thread === null) {
    return
  }

  const turns = await ctx.db
    .query('answerTurns')
    .withIndex('by_thread_createdAt', (q) => q.eq('threadId', threadId))
    .order('asc')
    .take(ANSWER_THREAD_DELETE_BATCH_SIZE)
  let remainingWrites = ANSWER_THREAD_DELETE_BATCH_SIZE
  let completedFetchedTurns = true

  for (const turn of turns) {
    if (remainingWrites === 0) {
      completedFetchedTurns = false
      break
    }

    const toolCalls = await ctx.db
      .query('answerToolCalls')
      .withIndex('by_turn_seq', (q) => q.eq('turnId', turn.turnId))
      .order('asc')
      .take(remainingWrites)
    if (toolCalls.length >= remainingWrites) {
      for (const toolCall of toolCalls) {
        await ctx.db.delete(toolCall._id)
      }
      remainingWrites = 0
      completedFetchedTurns = false
      break
    }

    for (const toolCall of toolCalls) {
      await ctx.db.delete(toolCall._id)
      remainingWrites -= 1
    }
    await ctx.db.delete(turn._id)
    remainingWrites -= 1
  }

  if (completedFetchedTurns && turns.length < ANSWER_THREAD_DELETE_BATCH_SIZE) {
    await ctx.db.delete(thread._id)
    return
  }

  await ctx.scheduler.runAfter(0, internal.answerThreads.continueDeleteAnswerThread, { threadId })
}

export const continueDeleteAnswerThread = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    await deleteAnswerThreadBatch(ctx, args.threadId)
  },
})

export const deleteAnswerThread = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
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

    await deleteAnswerThreadBatch(ctx, args.threadId)
    return { threadId: args.threadId }
  },
})

async function requireAnswerThreadSourceWrite(
  ctx: { db: unknown },
  args: SourceWriteArgs,
): Promise<void> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'answer_thread')
  if (sourceWrite.kind === 'rejected') {
    throw new Error(`answer_thread_source_write_rejected:${sourceWrite.reason}`)
  }
}

import { type PaginationOptions } from 'convex/server'
import { v } from 'convex/values'

import type { QueryCtx } from './_generated/server'

import { literalUnion } from '../src/modules/common/convex-literals'
import { resolveAdminAuthority } from './authz'
import {
  AnswerTurnStatusValues,
  FollowUpIntentValues,
  type AnswerTurnRecord,
} from '../src/modules/answer-thread/answer-thread.schema'
import {
  adminHarnessTurnMatchesFilters,
  buildPublicThreadProjectionWithReservations,
  countAnswerThreadTurns,
  normalizeAdminFilter,
  normalizeAdminRunViewerLimit,
  normalizeSessionThreadLimit,
  answerThreadShareAccessId,
  resolveAnswerThreadShareKeyring,
  toReservationRecord,
  toThreadRecord,
  toToolCallRecord,
  toTurnRecord,
  verifyAnswerThreadShare,
  type AnswerThreadShareGrant,
  type AnswerThreadShareKeyring,
  type AnswerThreadTurnRows,
} from '../src/modules/answer-thread/convex'
import { ANSWER_THREAD_MAX_TURNS } from './answerThreadsReserve'

const ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS + 1
const ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS

export type ReadTurnToolCallsHandlerArgs = {
  turnId: string
  pseudonymousSessionId: string
  paginationOpts: PaginationOptions
}

export type ListSessionThreadsHandlerArgs = {
  pseudonymousSessionId: string
  limit?: number
}

export type GetThreadTurnsHandlerArgs = {
  threadId: string
  pseudonymousSessionId: string
  paginationOpts: PaginationOptions
}

export type ListAdminHarnessRunTurnsHandlerArgs = {
  status?: string
  turnId?: string
  threadId?: string
  date?: string
  hasRunEvidence?: string
  limit?: number
}

export type GetAnswerThreadHandlerArgs = {
  threadId: string
  pseudonymousSessionId: string
}

export type GetAnswerThreadWithTurnsHandlerArgs = {
  threadId: string
  pseudonymousSessionId: string
  paginationOpts: PaginationOptions
}

export type GetOwnedThreadProjectionHandlerArgs = {
  threadId: string
  pseudonymousSessionId: string
}

export type GetSharedThreadProjectionHandlerArgs = {
  shareToken: string
}

export const answerTurnRecordResult = v.object({
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

export const adminHarnessRunTurnsResult = v.union(
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

async function readAnswerThreadTurnRows(
  ctx: QueryCtx,
  threadId: string,
  limit: number,
): Promise<AnswerThreadTurnRows> {
  const [turnRows, reservationRows] = await Promise.all([
    ctx.db
      .query('answerTurns')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(limit),
    ctx.db
      .query('answerTurnReservations')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(limit),
  ])
  return {
    turns: turnRows.map(toTurnRecord),
    reservations: reservationRows.map(toReservationRecord),
  }
}

/**
 * Re-inject the replayed harness report into a turn's evidence before the admin
 * run-viewer projects it. The durable `evidenceJson` only carries `harnessRunRef`
 * (runId === turnId); the full report lives in `harnessSessionEntries`.
 */
async function rehydrateHarnessRunFromSession(
  ctx: QueryCtx,
  turn: AnswerTurnRecord,
): Promise<AnswerTurnRecord> {
  const entries = await ctx.db
    .query('harnessSessionEntries')
    .withIndex('by_runId_seq', (q) => q.eq('runId', turn.turnId))
    .order('asc')
    .take(20)
  const reported = entries.find((entry) => entry.kind === 'run.reported' && entry.privatePayloadJson !== undefined)
  if (reported === undefined) {
    return turn
  }
  try {
    const privatePayload = JSON.parse(reported.privatePayloadJson as string) as { harnessRun?: unknown }
    if (privatePayload.harnessRun === undefined) {
      return turn
    }
    const evidence = JSON.parse(turn.evidenceJson) as Record<string, unknown>
    evidence.harnessRun = privatePayload.harnessRun
    return { ...turn, evidenceJson: JSON.stringify(evidence) }
  } catch {
    return turn
  }
}

export async function readTurnToolCallsHandler(ctx: QueryCtx, args: ReadTurnToolCallsHandlerArgs) {
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
}

export async function listSessionThreadsHandler(ctx: QueryCtx, args: ListSessionThreadsHandlerArgs) {
  const limit = normalizeSessionThreadLimit(args.limit)
  const rows = await ctx.db
    .query('answerThreads')
    .withIndex('by_session_updatedAt', (q) => q.eq('pseudonymousSessionId', args.pseudonymousSessionId))
    .order('desc')
    .take(limit)

  return {
    threads: rows.map(toThreadRecord),
  }
}

export async function getThreadTurnsHandler(ctx: QueryCtx, args: GetThreadTurnsHandlerArgs) {
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()

  if (thread === null || thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
    return { page: [], isDone: true, continueCursor: '' }
  }

  const page = await ctx.db
    .query('answerTurns')
    .withIndex('by_thread_seq', (q) => q.eq('threadId', args.threadId))
    .order('asc')
    .paginate(args.paginationOpts)

  return {
    page: page.page.map(toTurnRecord),
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  }
}

export async function listAdminHarnessRunTurnsHandler(
  ctx: QueryCtx,
  args: ListAdminHarnessRunTurnsHandlerArgs,
) {
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
      .withIndex('by_thread_seq', (query) => query.eq('threadId', threadId))
      .order('desc')
      .take(limit)
  } else {
    rows = await ctx.db.query('answerTurns').order('desc').take(limit)
  }
  const filtered: AnswerTurnRecord[] = []
  for (const row of rows) {
    const turn = await rehydrateHarnessRunFromSession(ctx, toTurnRecord(row))
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
}

export async function getAnswerThreadHandler(ctx: QueryCtx, args: GetAnswerThreadHandlerArgs) {
  const threadRow = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()

  if (threadRow === null || threadRow.pseudonymousSessionId !== args.pseudonymousSessionId) {
    return null
  }

  const turnRows = await readAnswerThreadTurnRows(ctx, args.threadId, ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT)

  const thread = toThreadRecord(threadRow)
  return {
    ...thread,
    turnCount: countAnswerThreadTurns(turnRows, ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT),
  }
}

export async function getAnswerThreadWithTurnsHandler(
  ctx: QueryCtx,
  args: GetAnswerThreadWithTurnsHandlerArgs,
) {
  const threadRow = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()

  if (threadRow === null || threadRow.pseudonymousSessionId !== args.pseudonymousSessionId) {
    return null
  }

  const [turnRows, page] = await Promise.all([
    readAnswerThreadTurnRows(ctx, args.threadId, ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT),
    ctx.db
      .query('answerTurns')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', args.threadId))
      .order('asc')
      .paginate(args.paginationOpts),
  ])

  return {
    thread: {
      ...toThreadRecord(threadRow),
      turnCount: countAnswerThreadTurns(turnRows, ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT),
    },
    turns: {
      page: page.page.map(toTurnRecord),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    },
  }
}

export async function getOwnedThreadProjectionHandler(
  ctx: QueryCtx,
  args: GetOwnedThreadProjectionHandlerArgs,
) {
  const threadRow = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()

  if (threadRow === null || threadRow.pseudonymousSessionId !== args.pseudonymousSessionId) {
    return null
  }

  const turnRows = await readAnswerThreadTurnRows(
    ctx,
    args.threadId,
    ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT,
  )

  return JSON.stringify(buildPublicThreadProjectionWithReservations(
    toThreadRecord(threadRow),
    turnRows,
    ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT,
  ))
}

export async function getSharedThreadProjectionHandler(
  ctx: QueryCtx,
  args: GetSharedThreadProjectionHandlerArgs,
) {
  if (!/^[a-f0-9]{64}$/.test(args.shareToken)) {
    return null
  }

  const accessId = answerThreadShareAccessId(args.shareToken)
  const shareRow = await ctx.db
    .query('answerThreadShares')
    .withIndex('by_accessId', (q) => q.eq('accessId', accessId))
    .unique()
  if (shareRow === null) {
    return null
  }

  let keyring: AnswerThreadShareKeyring
  try {
    keyring = resolveAnswerThreadShareKeyring(process.env)
  } catch {
    return null
  }

  const grant: AnswerThreadShareGrant = {
    threadId: shareRow.threadId,
    accessId: shareRow.accessId,
    generation: shareRow.generation,
    verifier: shareRow.verifier,
    keyId: shareRow.keyId,
    status: shareRow.status,
    createdAt: shareRow.createdAt,
    ...(shareRow.revokedAt === undefined ? {} : { revokedAt: shareRow.revokedAt }),
  }
  if (!verifyAnswerThreadShare({
    grant,
    shareToken: args.shareToken,
    requestedThreadId: shareRow.threadId,
    keyring,
  })) {
    return null
  }

  const threadRow = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', shareRow.threadId))
    .unique()
  if (threadRow === null) {
    return null
  }

  const turnRows = await readAnswerThreadTurnRows(
    ctx,
    shareRow.threadId,
    ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT,
  )

  return JSON.stringify(buildPublicThreadProjectionWithReservations(
    toThreadRecord(threadRow),
    turnRows,
    ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT,
  ))
}

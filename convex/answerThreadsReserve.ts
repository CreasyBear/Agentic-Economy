import { v } from 'convex/values'

import { env, type MutationCtx } from './_generated/server'

import { literalUnion } from '../src/modules/common/convex-literals'
import {
  isSourceWriteAdmission,
  isSourceWriteRequest,
  requireSourceWrite,
  type SourceWriteArgs,
} from './sourceWriteAdmission'
import {
  sourceWriteCommandDigest,
  verifySourceWriteAdmission,
} from '../src/modules/security/source-write-admission'
import {
  ANSWER_TURN_EXECUTION_LEASE_MS,
  AnswerTurnReservationStateValues,
} from '../src/modules/answer-thread/answer-thread.schema'
import {
  parseAnswerTurnCheckpoint,
  serializeAnswerTurnCheckpoint,
} from '../src/modules/answer-thread/convex'

export const ANSWER_THREAD_MAX_TURNS = 25

export type ReserveAnswerTurnHandlerArgs = SourceWriteArgs & {
  sessionId: string
  requestedThreadScope: string
  query: string
  searchContextJson?: string
  requestDigest: string
  reservationKey: string
  title: string
}

export type RenewAnswerTurnLeaseHandlerArgs = SourceWriteArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
}

export const answerTurnReservationResult = v.union(
  v.object({
    kind: v.literal('reserved'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    isNewThread: v.boolean(),
  }),
  v.object({
    kind: v.literal('in_progress'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    state: literalUnion(AnswerTurnReservationStateValues),
    finalStatus: v.optional(v.union(v.literal('complete'), v.literal('error'))),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('request_digest_mismatch'),
      v.literal('identity_mismatch'),
      v.literal('checkpoint_conflict'),
    ),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('thread_not_found'), v.literal('thread_forbidden'), v.literal('thread_turn_limit')),
  }),
)

export const renewAnswerTurnLeaseResult = v.union(
  v.object({
    kind: v.literal('renewed'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('generation_mismatch'),
      v.literal('stopped'),
      v.literal('settled'),
    ),
  }),
)

export function reservationGeneration(row: { generation?: number }): number {
  return typeof row.generation === 'number' && Number.isInteger(row.generation) && row.generation >= 0
    ? row.generation
    : 0
}

export async function requireAnswerThreadSourceRead(args: SourceWriteArgs): Promise<void> {
  const admission = isSourceWriteAdmission(args.sourceWrite) ? args.sourceWrite : undefined
  const request = isSourceWriteRequest(args.sourceWriteRequest)
    ? args.sourceWriteRequest
    : undefined
  if (
    admission === undefined
    || request === undefined
    || args.operationKey === undefined
    || args.correlationId === undefined
  ) {
    throw new Error('answer_thread_source_write_rejected:missing_source_write_admission')
  }
  const sourceWrite = await verifySourceWriteAdmission({
    admission,
    env: env as Record<string, string | undefined>,
    expected: {
      scope: 'answer_thread',
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      commandDigest: sourceWriteCommandDigest(args),
      request,
    },
  })
  if (sourceWrite.kind === 'rejected') {
    throw new Error(`answer_thread_source_write_rejected:${sourceWrite.reason}`)
  }
}

export async function requireAnswerThreadSourceWrite(
  ctx: MutationCtx,
  args: SourceWriteArgs,
): Promise<void> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'answer_thread')
  if (sourceWrite.kind === 'rejected') {
    throw new Error(`answer_thread_source_write_rejected:${sourceWrite.reason}`)
  }
}

export async function reserveAnswerTurnHandler(ctx: MutationCtx, args: ReserveAnswerTurnHandlerArgs) {
  await requireAnswerThreadSourceWrite(ctx, args)
  const existing = await ctx.db
    .query('answerTurnReservations')
    .withIndex('by_reservationKey', (query) => query.eq('reservationKey', args.reservationKey))
    .unique()
  if (existing !== null) {
    if (existing.sessionId !== args.sessionId || existing.requestedThreadScope !== args.requestedThreadScope) {
      return { kind: 'conflict' as const, reason: 'identity_mismatch' as const }
    }
    if (existing.requestDigest !== args.requestDigest) {
      return { kind: 'conflict' as const, reason: 'request_digest_mismatch' as const }
    }
    const existingThread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', existing.threadId))
      .unique()
    if (existingThread === null) return { kind: 'refused' as const, reason: 'thread_not_found' as const }
    if (existingThread.pseudonymousSessionId !== existing.sessionId) {
      return { kind: 'refused' as const, reason: 'thread_forbidden' as const }
    }
    const timestamp = Date.now()
    const generation = reservationGeneration(existing)
    if (existing.state === 'reserved') {
      if (timestamp - existing.updatedAt < ANSWER_TURN_EXECUTION_LEASE_MS) {
        return {
          kind: 'in_progress' as const,
          reservationKey: existing.reservationKey,
          threadId: existing.threadId,
          turnId: existing.turnId,
          turnSeq: existing.seq,
          generation,
        }
      }
      const nextGeneration = generation + 1
      const checkpointFieldsPresent = existing.checkpointJson !== undefined
        || existing.checkpointDigest !== undefined
        || existing.checkpointGeneration !== undefined
        || existing.checkpointStep !== undefined
      let checkpointPatch: {
        checkpointGeneration: number
        checkpointStep: number
        checkpointDigest: string
        checkpointJson: string
      } | undefined
      if (checkpointFieldsPresent) {
        if (
          existing.checkpointJson === undefined
          || existing.checkpointDigest === undefined
          || existing.checkpointGeneration === undefined
          || existing.checkpointStep === undefined
        ) {
          return { kind: 'conflict' as const, reason: 'checkpoint_conflict' as const }
        }
        const checkpoint = parseAnswerTurnCheckpoint(existing.checkpointJson, existing.checkpointDigest)
        if (
          checkpoint === null
          || existing.checkpointGeneration !== generation
          || existing.checkpointStep !== checkpoint.stepOrdinal
          || checkpoint.reservationKey !== existing.reservationKey
          || checkpoint.requestDigest !== existing.requestDigest
          || checkpoint.generation !== generation
          || checkpoint.threadId !== existing.threadId
          || checkpoint.turnId !== existing.turnId
          || checkpoint.turnSeq !== existing.seq
        ) {
          return { kind: 'conflict' as const, reason: 'checkpoint_conflict' as const }
        }
        const serialized = serializeAnswerTurnCheckpoint({
          ...checkpoint,
          generation: nextGeneration,
        })
        if (serialized === null) {
          return { kind: 'conflict' as const, reason: 'checkpoint_conflict' as const }
        }
        checkpointPatch = {
          checkpointGeneration: nextGeneration,
          checkpointStep: checkpoint.stepOrdinal,
          checkpointDigest: serialized.checkpointDigest,
          checkpointJson: serialized.checkpointJson,
        }
      }
      await ctx.db.patch(existing._id, {
        generation: nextGeneration,
        updatedAt: timestamp,
        ...(checkpointPatch ?? {}),
      })
      return {
        kind: 'reserved' as const,
        reservationKey: existing.reservationKey,
        threadId: existing.threadId,
        turnId: existing.turnId,
        turnSeq: existing.seq,
        generation: nextGeneration,
        isNewThread: false,
      }
    }
    return {
      kind: 'replayed' as const,
      reservationKey: existing.reservationKey,
      threadId: existing.threadId,
      turnId: existing.turnId,
      turnSeq: existing.seq,
      generation,
      state: existing.state,
      ...(existing.finalStatus === undefined ? {} : { finalStatus: existing.finalStatus }),
    }
  }

  const existingThread = args.requestedThreadScope === 'new'
    ? null
    : await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.requestedThreadScope))
      .unique()
  if (args.requestedThreadScope !== 'new' && existingThread === null) {
    return { kind: 'refused' as const, reason: 'thread_not_found' as const }
  }
  if (existingThread !== null && existingThread.pseudonymousSessionId !== args.sessionId) {
    return { kind: 'refused' as const, reason: 'thread_forbidden' as const }
  }

  const timestamp = Date.now()
  const threadId = existingThread?.threadId ?? crypto.randomUUID()
  if (existingThread === null) {
    await ctx.db.insert('answerThreads', {
      threadId,
      pseudonymousSessionId: args.sessionId,
      title: args.title,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
  const [turnRows, reservationRows] = await Promise.all([
    ctx.db
      .query('answerTurns')
      .withIndex('by_thread_seq', (query) => query.eq('threadId', threadId))
      .order('desc')
      .take(ANSWER_THREAD_MAX_TURNS + 1),
    ctx.db
      .query('answerTurnReservations')
      .withIndex('by_thread_seq', (query) => query.eq('threadId', threadId))
      .order('desc')
      .take(ANSWER_THREAD_MAX_TURNS + 1),
  ])
  const turnIds = new Set<string>()
  for (const row of turnRows) turnIds.add(row.turnId)
  for (const row of reservationRows) turnIds.add(row.turnId)
  if (turnIds.size >= ANSWER_THREAD_MAX_TURNS) {
    return { kind: 'refused' as const, reason: 'thread_turn_limit' as const }
  }
  const turnSeq = Math.max(0, ...turnRows.map((row) => row.seq), ...reservationRows.map((row) => row.seq)) + 1
  const reservation = {
    reservationKey: args.reservationKey,
    sessionId: args.sessionId,
    requestedThreadScope: args.requestedThreadScope,
    requestDigest: args.requestDigest,
    threadId,
    turnId: crypto.randomUUID(),
    seq: turnSeq,
    query: args.query,
    ...(args.searchContextJson === undefined ? {} : { searchContextJson: args.searchContextJson }),
    generation: 0,
    state: 'reserved' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await ctx.db.insert('answerTurnReservations', reservation)
  if (existingThread !== null) await ctx.db.patch(existingThread._id, { updatedAt: timestamp })
  return {
    kind: 'reserved' as const,
    reservationKey: reservation.reservationKey,
    threadId: reservation.threadId,
    turnId: reservation.turnId,
    turnSeq: reservation.seq,
    generation: reservation.generation,
    isNewThread: args.requestedThreadScope === 'new',
  }
}

export async function renewAnswerTurnLeaseHandler(ctx: MutationCtx, args: RenewAnswerTurnLeaseHandlerArgs) {
  await requireAnswerThreadSourceWrite(ctx, args)
  const reservation = await ctx.db
    .query('answerTurnReservations')
    .withIndex('by_reservationKey', (query) => query.eq('reservationKey', args.reservationKey))
    .unique()
  if (reservation === null) return { kind: 'conflict' as const, reason: 'reservation_not_found' as const }
  if (
    reservation.sessionId !== args.sessionId
    || reservation.threadId !== args.threadId
    || reservation.turnId !== args.turnId
    || reservation.seq !== args.turnSeq
  ) {
    return { kind: 'conflict' as const, reason: 'reservation_identity_mismatch' as const }
  }
  if (reservation.requestDigest !== args.requestDigest) {
    return { kind: 'conflict' as const, reason: 'request_digest_mismatch' as const }
  }
  if (reservation.state === 'stopped') {
    return { kind: 'conflict' as const, reason: 'stopped' as const }
  }
  if (reservation.state === 'finalized') {
    return { kind: 'conflict' as const, reason: 'settled' as const }
  }
  const generation = reservationGeneration(reservation)
  if (generation !== args.generation) {
    return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
  }
  await ctx.db.patch(reservation._id, { updatedAt: Date.now() })
  return {
    kind: 'renewed' as const,
    reservationKey: reservation.reservationKey,
    threadId: reservation.threadId,
    turnId: reservation.turnId,
    turnSeq: reservation.seq,
    generation,
  }
}

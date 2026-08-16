import { mutationGeneric, paginationOptsValidator, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { env, internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'

import { literalUnion } from '../src/modules/common/convex-literals'
import { resolveAdminAuthority } from './authz'
import {
  isSourceWriteAdmission,
  isSourceWriteRequest,
  requireSourceWrite,
  sourceWriteArgs,
  type SourceWriteArgs,
} from './sourceWriteAdmission'
import {
  sourceWriteCommandDigest,
  verifySourceWriteAdmission,
} from '../src/modules/security/source-write-admission'
import {
  ANSWER_TURN_EXECUTION_LEASE_MS,
  AnswerTurnReservationStateValues,
  AnswerTurnStatusValues,
  FollowUpIntentValues,
} from '../src/modules/answer-thread/answer-thread.schema'
import {
  adminHarnessTurnMatchesFilters,
  buildPublicThreadProjectionWithReservations,
  countAnswerThreadTurns,
  MAX_ANSWER_TURN_CHECKPOINT_BYTES,
  mintAnswerThreadShareToken,
  normalizeAdminFilter,
  normalizeAdminRunViewerLimit,
  normalizeSessionThreadLimit,
  parseAnswerTurnCheckpoint,
  planAnswerThreadTurnDeletion,
  resolveAnswerThreadShareKeyring,
  answerThreadShareAccessId,
  answerThreadShareVerifier,
  serializeAnswerTurnCheckpoint,
  toReservationRecord,
  toThreadRecord,
  toToolCallRecord,
  toTurnRecord,
  verifyAnswerThreadShare,
  type AnswerThreadShareGrant,
  type AnswerThreadShareKeyring,
  type AnswerThreadTurnRows,
} from '../src/modules/answer-thread/convex'
import type { AnswerTurnRecord } from '../src/modules/answer-thread/answer-thread.schema'

const ANSWER_TURN_CHECKPOINT_MAX_STEP = 16
const ANSWER_THREAD_MAX_TURNS = 25
const ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS + 1
const ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS
const ANSWER_THREAD_DELETE_BATCH_SIZE = 100


function reservationGeneration(row: { generation?: number }): number {
  return typeof row.generation === 'number' && Number.isInteger(row.generation) && row.generation >= 0
    ? row.generation
    : 0
}

const now = () => Date.now()

function settledAnswerTurnStatus(finalStatus: string | undefined): 'complete' | 'error' {
  return finalStatus === 'complete' || finalStatus === 'error' ? finalStatus : 'error'
}

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
  errorProblemJson: v.optional(v.string()),
  createdAt: v.number(),
})
const issueAnswerThreadShareResult = v.object({
  threadId: v.string(),
  shareToken: v.string(),
})

const revokeAnswerThreadShareResult = v.object({
  threadId: v.string(),
  revoked: v.boolean(),
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

const answerTurnReservationResult = v.union(
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
const renewAnswerTurnLeaseResult = v.union(
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


const persistAnswerTurnCheckpointResult = v.union(
  v.object({
    kind: v.union(v.literal('persisted'), v.literal('replayed')),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    checkpointDigest: v.string(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('generation_mismatch'),
      v.literal('checkpoint_invalid'),
      v.literal('checkpoint_conflict'),
      v.literal('stopped'),
      v.literal('settled'),
    ),
  }),
)
const readAnswerTurnCheckpointResult = v.union(
  v.object({
    kind: v.literal('checkpoint'),
    checkpointJson: v.string(),
    checkpointDigest: v.string(),
    generation: v.number(),
    checkpointStep: v.number(),
  }),
  v.object({ kind: v.literal('missing') }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('generation_mismatch'),
      v.literal('checkpoint_invalid'),
      v.literal('stopped'),
      v.literal('settled'),
    ),
  }),
)
const stopAnswerTurnResult = v.union(
  v.object({ kind: v.literal('stopped'), threadId: v.string(), turnId: v.string() }),
  v.object({
    kind: v.literal('already_settled'),
    threadId: v.string(),
    turnId: v.string(),
    status: v.union(v.literal('complete'), v.literal('error'), v.literal('stopped')),
  }),
  v.object({ kind: v.literal('not_found') }),
)

export const reserveAnswerTurn = mutationGeneric({
  args: {
    sessionId: v.string(),
    requestedThreadScope: v.string(),
    query: v.string(),
    searchContextJson: v.optional(v.string()),
    requestDigest: v.string(),
    reservationKey: v.string(),
    title: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: answerTurnReservationResult,
  handler: async (ctx, args) => {
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
      const timestamp = now()
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

    const timestamp = now()
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
  },
})
export const renewAnswerTurnLease = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: renewAnswerTurnLeaseResult,
  handler: async (ctx, args) => {
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
    await ctx.db.patch(reservation._id, { updatedAt: now() })
    return {
      kind: 'renewed' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.seq,
      generation,
    }
  },
})


export const persistAnswerTurnCheckpoint = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    checkpointStep: v.number(),
    checkpointJson: v.string(),
    checkpointDigest: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: persistAnswerTurnCheckpointResult,
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
    if (
      new TextEncoder().encode(args.checkpointJson).byteLength > MAX_ANSWER_TURN_CHECKPOINT_BYTES
      || args.checkpointStep < 1
      || args.checkpointStep > ANSWER_TURN_CHECKPOINT_MAX_STEP
    ) {
      return { kind: 'conflict' as const, reason: 'checkpoint_invalid' as const }
    }
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
    const checkpoint = parseAnswerTurnCheckpoint(args.checkpointJson, args.checkpointDigest)
    if (
      checkpoint === null
      || checkpoint.reservationKey !== args.reservationKey
      || checkpoint.requestDigest !== args.requestDigest
      || checkpoint.generation !== generation
      || checkpoint.threadId !== args.threadId
      || checkpoint.turnId !== args.turnId
      || checkpoint.turnSeq !== args.turnSeq
      || checkpoint.stepOrdinal !== args.checkpointStep
    ) {
      return { kind: 'conflict' as const, reason: 'checkpoint_invalid' as const }
    }

    const existingCheckpoint =
      reservation.checkpointJson === undefined
        || reservation.checkpointDigest === undefined
        || reservation.checkpointGeneration === undefined
        || reservation.checkpointStep === undefined
        ? undefined
        : parseAnswerTurnCheckpoint(reservation.checkpointJson, reservation.checkpointDigest)
    if (
      reservation.checkpointJson !== undefined
      || reservation.checkpointDigest !== undefined
      || reservation.checkpointGeneration !== undefined
      || reservation.checkpointStep !== undefined
    ) {
      if (
        existingCheckpoint === null
        || existingCheckpoint === undefined
        || reservation.checkpointGeneration !== generation
        || reservation.checkpointDigest === undefined
        || reservation.checkpointStep === undefined
      ) {
        return { kind: 'conflict' as const, reason: 'checkpoint_invalid' as const }
      }
      if (
        reservation.checkpointDigest === args.checkpointDigest
        && reservation.checkpointStep === args.checkpointStep
      ) {
        await ctx.db.patch(reservation._id, { updatedAt: now() })
        return {
          kind: 'replayed' as const,
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
          generation,
          checkpointDigest: args.checkpointDigest,
        }
      }
      if (
        args.checkpointStep !== reservation.checkpointStep + 1
        || checkpoint.parentCheckpointDigest !== reservation.checkpointDigest
      ) {
        return { kind: 'conflict' as const, reason: 'checkpoint_conflict' as const }
      }
    } else if (args.checkpointStep !== 1 || checkpoint.parentCheckpointDigest !== undefined) {
      return { kind: 'conflict' as const, reason: 'checkpoint_conflict' as const }
    }

    await ctx.db.patch(reservation._id, {
      checkpointGeneration: generation,
      checkpointStep: args.checkpointStep,
      checkpointDigest: args.checkpointDigest,
      checkpointJson: args.checkpointJson,
      updatedAt: now(),
    })
    return {
      kind: 'persisted' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.seq,
      generation,
      checkpointDigest: args.checkpointDigest,
    }
  },
})

export const readAnswerTurnCheckpoint = queryGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: readAnswerTurnCheckpointResult,
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceRead(args)
    const reservation = await ctx.db
      .query('answerTurnReservations')
      .withIndex('by_reservationKey', (query) => query.eq('reservationKey', args.reservationKey))
      .unique()
    if (reservation === null) return { kind: 'missing' as const }
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
    const generation = reservationGeneration(reservation)
    if (reservation.state === 'stopped') return { kind: 'conflict' as const, reason: 'stopped' as const }
    if (reservation.state === 'finalized') return { kind: 'conflict' as const, reason: 'settled' as const }
    if (generation !== args.generation) {
      return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
    }
    if (
      reservation.checkpointJson === undefined
      || reservation.checkpointDigest === undefined
      || reservation.checkpointGeneration === undefined
      || reservation.checkpointStep === undefined
    ) {
      return { kind: 'missing' as const }
    }
    const checkpoint = parseAnswerTurnCheckpoint(
      reservation.checkpointJson,
      reservation.checkpointDigest,
    )
    if (
      checkpoint === null
      || checkpoint.reservationKey !== args.reservationKey
      || checkpoint.requestDigest !== args.requestDigest
      || checkpoint.generation !== generation
      || checkpoint.threadId !== args.threadId
      || checkpoint.turnId !== args.turnId
      || checkpoint.turnSeq !== args.turnSeq
      || checkpoint.stepOrdinal !== reservation.checkpointStep
    ) {
      return { kind: 'conflict' as const, reason: 'checkpoint_invalid' as const }
    }
    return {
      kind: 'checkpoint' as const,
      checkpointJson: reservation.checkpointJson,
      checkpointDigest: reservation.checkpointDigest,
      generation,
      checkpointStep: reservation.checkpointStep,
    }
  },
})



export const stopAnswerTurn = mutationGeneric({
  args: {
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: stopAnswerTurnResult,
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
    const reservation = await ctx.db
      .query('answerTurnReservations')
      .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
      .unique()
    if (
      reservation === null ||
      reservation.threadId !== args.threadId ||
      reservation.sessionId !== args.sessionId
    ) {
      return { kind: 'not_found' as const }
    }
    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (thread === null || thread.pseudonymousSessionId !== args.sessionId) {
      return { kind: 'not_found' as const }
    }

    if (reservation.state === 'finalized') {
      return {
        kind: 'already_settled' as const,
        threadId: args.threadId,
        turnId: args.turnId,
        status: settledAnswerTurnStatus(reservation.finalStatus),
      }
    }
    if (reservation.state === 'stopped') {
      return { kind: 'already_settled' as const, threadId: args.threadId, turnId: args.turnId, status: 'stopped' as const }
    }
    const timestamp = now()
    await ctx.db.patch(reservation._id, {
      state: 'stopped',
      generation: reservationGeneration(reservation) + 1,
      updatedAt: timestamp,
    })
    const turn = await ctx.db
      .query('answerTurns')
      .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
      .unique()
    if (turn !== null) await ctx.db.patch(turn._id, { status: 'stopped' })
    return { kind: 'stopped' as const, threadId: args.threadId, turnId: args.turnId }
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
      .withIndex('by_thread_seq', (q) => q.eq('threadId', args.threadId))
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

    const turnRows = await readAnswerThreadTurnRows(ctx, args.threadId, ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT)

    const thread = toThreadRecord(threadRow)
    return {
      ...thread,
      turnCount: countAnswerThreadTurns(turnRows, ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT),
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
  },
})

// Operation artifacts may contain JSON Schema keys such as `$schema` and `$ref`,
// which Convex cannot serialize as object fields. The server adapter decodes this
// bounded projection string before exposing the typed route contract.
export const getOwnedThreadProjection = queryGeneric({
  args: { threadId: v.string(), pseudonymousSessionId: v.string() },
  handler: async (ctx, args) => {
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
  },
})

export const getSharedThreadProjection = queryGeneric({
  args: { shareToken: v.string() },
  handler: async (ctx, args) => {
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
  },

})

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



export const issueAnswerThreadShare = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: issueAnswerThreadShareResult,
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

    const keyring = resolveAnswerThreadShareKeyring(process.env)
    const existing = await ctx.db
      .query('answerThreadShares')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()
    const generation = existing === null
      ? 1
      : existing.status === 'revoked'
        ? existing.generation + 1
        : existing.generation
    const shareToken = mintAnswerThreadShareToken(
      { threadId: args.threadId, generation, keyId: keyring.keyId },
      keyring,
    )
    const share = {
      threadId: args.threadId,
      accessId: answerThreadShareAccessId(shareToken),
      generation,
      verifier: answerThreadShareVerifier(shareToken, keyring.secret),
      keyId: keyring.keyId,
      status: 'active' as const,
      createdAt: existing?.createdAt ?? now(),
    }
    if (existing === null) {
      await ctx.db.insert('answerThreadShares', share)
    } else {
      await ctx.db.replace(existing._id, share)
    }
    return { threadId: args.threadId, shareToken }
  },
})

export const revokeAnswerThreadShare = mutationGeneric({
  args: {
    threadId: v.string(),
    pseudonymousSessionId: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: revokeAnswerThreadShareResult,
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

    const existing = await ctx.db
      .query('answerThreadShares')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()
    if (existing === null || existing.status === 'revoked') {
      return { threadId: args.threadId, revoked: false }
    }
    await ctx.db.patch(existing._id, { status: 'revoked', revokedAt: now() })
    return { threadId: args.threadId, revoked: true }
  },
})

async function deleteAnswerThreadBatch(ctx: MutationCtx, threadId: string): Promise<void> {
  const [turns, reservations] = await Promise.all([
    ctx.db
      .query('answerTurns')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(ANSWER_THREAD_DELETE_BATCH_SIZE),
    ctx.db
      .query('answerTurnReservations')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(ANSWER_THREAD_DELETE_BATCH_SIZE),
  ])
  let remainingWrites = ANSWER_THREAD_DELETE_BATCH_SIZE
  let hasMoreChildren =
    turns.length === ANSWER_THREAD_DELETE_BATCH_SIZE ||
    reservations.length === ANSWER_THREAD_DELETE_BATCH_SIZE

  for (const turn of turns) {
    if (remainingWrites === 0) {
      hasMoreChildren = true
      break
    }

    const toolCalls = await ctx.db
      .query('answerToolCalls')
      .withIndex('by_turn_seq', (q) => q.eq('turnId', turn.turnId))
      .order('asc')
      .take(remainingWrites)
    const deletion = planAnswerThreadTurnDeletion({
      remainingWrites,
      toolCallCount: toolCalls.length,
      hasMoreChildren,
    })
    for (const toolCall of toolCalls) {
      await ctx.db.delete(toolCall._id)
    }
    remainingWrites = deletion.remainingWrites
    hasMoreChildren = deletion.hasMoreChildren
    if (!deletion.deleteTurn) {
      break
    }
    await ctx.db.delete(turn._id)
  }

  if (remainingWrites > 0) {
    for (const reservation of reservations) {
      if (remainingWrites === 0) {
        hasMoreChildren = true
        break
      }
      await ctx.db.delete(reservation._id)
      remainingWrites -= 1
    }
  }

  if (!hasMoreChildren) {
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
    const share = await ctx.db
      .query('answerThreadShares')
      .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
      .unique()
    if (share !== null) {
      await ctx.db.delete(share._id)
    }

    await ctx.db.delete(thread._id)
    await deleteAnswerThreadBatch(ctx, args.threadId)
    return { threadId: args.threadId }
  },
})

async function requireAnswerThreadSourceRead(args: SourceWriteArgs): Promise<void> {
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

async function requireAnswerThreadSourceWrite(
  ctx: { db: unknown },
  args: SourceWriteArgs,
): Promise<void> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'answer_thread')
  if (sourceWrite.kind === 'rejected') {
    throw new Error(`answer_thread_source_write_rejected:${sourceWrite.reason}`)
  }
}

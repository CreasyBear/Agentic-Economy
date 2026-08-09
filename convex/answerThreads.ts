import { mutationGeneric, paginationOptsValidator, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'

import { literalUnion } from '../src/modules/common/convex-literals'
import { resolveAdminAuthority } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import {
  AnswerTurnReservationStateValues,
  AnswerTurnStatusValues,
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  FollowUpIntentValues,
  parseAnswerTurnCheckpoint,
} from '../src/modules/answer-thread/answer-thread.schema'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  adminHarnessTurnMatchesFilters,
  buildPublicThreadProjectionWithReservations,
  countAnswerThreadTurns,
  mintAnswerThreadShareToken,
  normalizeAdminFilter,
  normalizeAdminRunViewerLimit,
  normalizeSessionThreadLimit,
  planAnswerThreadTurnDeletion,
  resolveAnswerThreadShareKeyring,
  answerThreadShareAccessId,
  answerThreadShareVerifier,
  toReservationRecord,
  toThreadRecord,
  toToolCallRecord,
  toTurnRecord,
  toolCallsMatch,
  verifyAnswerThreadShare,
  type AnswerThreadShareGrant,
  type AnswerThreadShareKeyring,
  type AnswerThreadTurnRows,
} from '../src/modules/answer-thread/convex'
import type { AnswerTurnRecord } from '../src/modules/answer-thread/answer-thread.schema'

const ANSWER_THREAD_MAX_TURNS = 25
const ANSWER_THREAD_TURN_COUNT_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS + 1
const ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT = ANSWER_THREAD_MAX_TURNS
const ANSWER_THREAD_DELETE_BATCH_SIZE = 100
const ANSWER_TURN_RESUME_LEASE_MS = 60_000
const ANSWER_TURN_CHECKPOINT_MAX_JSON_BYTES = 512 * 1024

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

const answerToolCallInput = v.object({
  toolCallId: v.string(),
  seq: v.number(),
  toolId: literalUnion(AnswerToolIdValues),
  inputJson: v.string(),
  resultSummaryJson: v.string(),
  resultJson: v.string(),
  resultHash: v.string(),
  status: literalUnion(AnswerToolCallStatusValues),
})
const answerTurnReservationResult = v.union(
  v.object({
    kind: v.literal('reserved'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    isNewThread: v.boolean(),
  }),
  v.object({
    kind: v.literal('replayed'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    state: literalUnion(AnswerTurnReservationStateValues),
    finalStatus: v.optional(v.union(v.literal('complete'), v.literal('error'))),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('request_digest_mismatch'), v.literal('identity_mismatch')),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('thread_not_found'), v.literal('thread_forbidden'), v.literal('thread_turn_limit')),
  }),
)

const answerTurnResumeLeaseResult = v.union(
  v.object({
    kind: v.literal('acquired'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    query: v.string(),
    searchContextJson: v.optional(v.string()),
    generation: v.number(),
    leaseOwner: v.string(),
    leaseExpiresAt: v.number(),
    checkpointJson: v.optional(v.string()),
    checkpointDigest: v.optional(v.string()),
    checkpointStep: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal('pending'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    leaseExpiresAt: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal('settled'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    status: v.union(v.literal('complete'), v.literal('error'), v.literal('stopped')),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('stopped'),
      v.literal('finalized'),
      v.literal('non_resumable'),
      v.literal('generation_mismatch'),
      v.literal('lease_active'),
    ),
  }),
)

const answerTurnCheckpointResult = v.union(
  v.object({
    kind: v.union(v.literal('checkpointed'), v.literal('replayed')),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    generation: v.number(),
    checkpointDigest: v.string(),
    checkpointStep: v.number(),
  }),
  v.object({
    kind: v.literal('stopped'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('stopped'),
      v.literal('finalized'),
      v.literal('non_resumable'),
      v.literal('generation_mismatch'),
      v.literal('lease_owner_mismatch'),
      v.literal('lease_expired'),
      v.literal('checkpoint_invalid'),
      v.literal('checkpoint_digest_mismatch'),
      v.literal('checkpoint_conflict'),
      v.literal('checkpoint_step_stale'),
    ),
  }),
)

const persistReservedAnswerTurnResult = v.union(
  v.object({
    kind: v.union(v.literal('persisted'), v.literal('replayed')),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('answer_digest_conflict'),
      v.literal('turn_conflict'),
      v.literal('tool_call_conflict'),
      v.literal('stopped'),
      v.literal('generation_mismatch'),
      v.literal('lease_owner_mismatch'),
      v.literal('lease_expired'),
    ),
  }),
)

const failPersistedAnswerTurnResult = v.union(
  v.object({
    kind: v.literal('failed'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    status: v.union(v.literal('complete'), v.literal('error')),
  }),
  v.object({
    kind: v.literal('stopped'),
    reservationKey: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(
      v.literal('reservation_not_found'),
      v.literal('reservation_identity_mismatch'),
      v.literal('request_digest_mismatch'),
      v.literal('answer_digest_conflict'),
      v.literal('turn_not_found'),
      v.literal('not_persisted'),
      v.literal('generation_mismatch'),
      v.literal('lease_owner_mismatch'),
      v.literal('lease_expired'),
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
      if (existingThread === null) {
        return { kind: 'refused' as const, reason: 'thread_not_found' as const }
      }
      if (existingThread.pseudonymousSessionId !== existing.sessionId) {
        return { kind: 'refused' as const, reason: 'thread_forbidden' as const }
      }
      return {
        kind: 'replayed' as const,
        reservationKey: existing.reservationKey,
        threadId: existing.threadId,
        turnId: existing.turnId,
        turnSeq: existing.seq,
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
      state: 'reserved' as const,
      runGeneration: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await ctx.db.insert('answerTurnReservations', reservation)
    if (existingThread !== null) {
      await ctx.db.patch(existingThread._id, { updatedAt: timestamp })
    }
    return {
      kind: 'reserved' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.seq,
      isNewThread: args.requestedThreadScope === 'new',
    }
  },
})

type AnswerTurnResumeLeaseArgs = {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  leaseOwner: string
  expectedGeneration?: number
}

async function acquireAnswerTurnResumeLeaseInternal(
  ctx: MutationCtx,
  args: AnswerTurnResumeLeaseArgs,
  mode: 'initial' | 'resume',
) {
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
  if (mode === 'resume' && args.expectedGeneration === undefined) {
    return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
  }
  if (mode === 'resume' && reservation.runGeneration !== args.expectedGeneration) {
    return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
  }
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
    .unique()
  if (thread === null || thread.pseudonymousSessionId !== args.sessionId) {
    return { kind: 'conflict' as const, reason: 'reservation_identity_mismatch' as const }
  }
  if (reservation.state === 'stopped') {
    return {
      kind: 'settled' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      status: 'stopped' as const,
    }
  }
  if (reservation.state === 'finalized') {
    return {
      kind: 'settled' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      status: settledAnswerTurnStatus(reservation.finalStatus),
    }
  }
  if (reservation.state === 'answer_persisted') {
    if (mode !== 'resume') {
      return {
        kind: 'pending' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
      }
    }
    const currentGeneration = reservation.runGeneration
    const currentLeaseOwner = reservation.leaseOwner
    const currentLeaseExpiresAt = reservation.leaseExpiresAt
    const finalStatus = reservation.finalStatus
    if (
      currentGeneration === undefined
      || currentLeaseOwner === undefined
      || currentLeaseExpiresAt === undefined
      || finalStatus === undefined
    ) {
      return { kind: 'conflict' as const, reason: 'non_resumable' as const }
    }
    const timestamp = now()
    const leaseActive = currentLeaseExpiresAt > timestamp
    if (leaseActive && currentLeaseOwner !== args.leaseOwner) {
      return {
        kind: 'pending' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        leaseExpiresAt: currentLeaseExpiresAt,
      }
    }
    const generation = leaseActive ? currentGeneration : currentGeneration + 1
    const turn = await ctx.db
      .query('answerTurns')
      .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
      .unique()
    if (turn === null) return { kind: 'conflict' as const, reason: 'non_resumable' as const }
    if (turn.status === 'stopped') {
      await ctx.db.patch(reservation._id, {
        state: 'stopped',
        checkpointJson: undefined,
        checkpointDigest: undefined,
        checkpointStep: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: timestamp,
      })
      return {
        kind: 'settled' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        status: 'stopped' as const,
      }
    }
    if (turn.status !== finalStatus) {
      await ctx.db.patch(turn._id, { status: finalStatus })
    }
    await ctx.db.patch(reservation._id, {
      state: 'finalized',
      finalStatus,
      runGeneration: generation,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      checkpointJson: undefined,
      checkpointDigest: undefined,
      checkpointStep: undefined,
      updatedAt: timestamp,
    })
    return {
      kind: 'settled' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      status: finalStatus,
    }
  }
  if (mode === 'resume') {
    const resumableReserved = reservation.state === 'reserved'
      && reservation.checkpointJson === undefined
      && reservation.checkpointDigest === undefined
      && reservation.checkpointStep === undefined
    const resumableCheckpoint = reservation.state === 'checkpointed'
      && reservation.checkpointJson !== undefined
      && reservation.checkpointDigest !== undefined
      && reservation.checkpointStep !== undefined
      && isValidCheckpointJson(reservation.checkpointJson, reservation.checkpointDigest)
    if (!resumableReserved && !resumableCheckpoint) {
      return { kind: 'conflict' as const, reason: 'non_resumable' as const }
    }
  }

  const timestamp = now()
  const leaseActive = reservation.leaseOwner !== undefined
    && reservation.leaseExpiresAt !== undefined
    && reservation.leaseExpiresAt > timestamp
  if (leaseActive && reservation.leaseOwner !== args.leaseOwner) {
    return {
      kind: 'pending' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      ...(reservation.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: reservation.leaseExpiresAt }),
    }
  }
  const currentGeneration = reservation.runGeneration
  if (mode === 'resume' && currentGeneration === undefined) {
    return { kind: 'conflict' as const, reason: 'non_resumable' as const }
  }
  const generation = currentGeneration === undefined
    ? 0
    : leaseActive || reservation.leaseOwner === undefined
      ? currentGeneration
      : currentGeneration + 1
  const leaseExpiresAt = timestamp + ANSWER_TURN_RESUME_LEASE_MS
  await ctx.db.patch(reservation._id, {
    runGeneration: generation,
    leaseOwner: args.leaseOwner,
    leaseExpiresAt,
    updatedAt: timestamp,
  })
  return {
    kind: 'acquired' as const,
    reservationKey: reservation.reservationKey,
    threadId: reservation.threadId,
    turnId: reservation.turnId,
    turnSeq: reservation.seq,
    query: reservation.query,
    ...(reservation.searchContextJson === undefined ? {} : { searchContextJson: reservation.searchContextJson }),
    generation,
    leaseOwner: args.leaseOwner,
    leaseExpiresAt,
    ...(reservation.checkpointJson === undefined ? {} : { checkpointJson: reservation.checkpointJson }),
    ...(reservation.checkpointDigest === undefined ? {} : { checkpointDigest: reservation.checkpointDigest }),
    ...(reservation.checkpointStep === undefined ? {} : { checkpointStep: reservation.checkpointStep }),
  }
}

export const acquireAnswerTurnResumeLease = mutationGeneric({
  args: {
    ...({
      reservationKey: v.string(),
      requestDigest: v.string(),
      sessionId: v.string(),
      threadId: v.string(),
      turnId: v.string(),
      turnSeq: v.number(),
      leaseOwner: v.string(),
      mode: v.union(v.literal('initial'), v.literal('resume')),
      expectedGeneration: v.optional(v.number()),
      operationKey: v.optional(v.string()),
      correlationId: v.optional(v.string()),
    }),
    ...sourceWriteArgs,
  },
  returns: answerTurnResumeLeaseResult,
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
    return acquireAnswerTurnResumeLeaseInternal(ctx, args, args.mode)
  },
})

export const renewAnswerTurnResumeLease = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    leaseOwner: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: answerTurnResumeLeaseResult,
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
      return {
        kind: 'settled' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        status: 'stopped' as const,
      }
    }
    if (reservation.state === 'finalized') {
      return {
        kind: 'settled' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        status: settledAnswerTurnStatus(reservation.finalStatus),
      }
    }
    if (reservation.runGeneration !== args.generation) {
      return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
    }
    if (reservation.leaseOwner !== args.leaseOwner) {
      return { kind: 'conflict' as const, reason: 'lease_active' as const }
    }
    if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= now()) {
      return { kind: 'conflict' as const, reason: 'lease_active' as const }
    }
    const leaseExpiresAt = now() + ANSWER_TURN_RESUME_LEASE_MS
    await ctx.db.patch(reservation._id, { leaseExpiresAt, updatedAt: now() })
    return {
      kind: 'acquired' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.seq,
      query: reservation.query,
      ...(reservation.searchContextJson === undefined ? {} : { searchContextJson: reservation.searchContextJson }),
      generation: args.generation,
      leaseOwner: args.leaseOwner,
      leaseExpiresAt,
      ...(reservation.checkpointJson === undefined ? {} : { checkpointJson: reservation.checkpointJson }),
      ...(reservation.checkpointDigest === undefined ? {} : { checkpointDigest: reservation.checkpointDigest }),
      ...(reservation.checkpointStep === undefined ? {} : { checkpointStep: reservation.checkpointStep }),
    }
  },
})

export const writeAnswerTurnCheckpoint = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    leaseOwner: v.string(),
    checkpointJson: v.string(),
    checkpointDigest: v.string(),
    checkpointStep: v.number(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: answerTurnCheckpointResult,
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
      return {
        kind: 'stopped' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
      }
    }
    if (reservation.state === 'finalized' || reservation.state === 'answer_persisted') {
      return { kind: 'conflict' as const, reason: 'finalized' as const }
    }
    if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
      return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
    }
    if (reservation.leaseOwner !== args.leaseOwner) {
      return { kind: 'conflict' as const, reason: 'lease_owner_mismatch' as const }
    }
    if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= now()) {
      return { kind: 'conflict' as const, reason: 'lease_expired' as const }
    }
    if (!isValidCheckpointJson(args.checkpointJson, args.checkpointDigest)) {
      return { kind: 'conflict' as const, reason: 'checkpoint_invalid' as const }
    }
    if (reservation.checkpointDigest === args.checkpointDigest && reservation.checkpointStep === args.checkpointStep) {
      return {
        kind: 'replayed' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        generation: args.generation,
        checkpointDigest: args.checkpointDigest,
        checkpointStep: args.checkpointStep,
      }
    }
    if (
      reservation.checkpointStep !== undefined
      && args.checkpointStep < reservation.checkpointStep
    ) {
      return { kind: 'conflict' as const, reason: 'checkpoint_step_stale' as const }
    }
    if (
      reservation.checkpointStep === args.checkpointStep
      && reservation.checkpointDigest !== undefined
      && reservation.checkpointDigest !== args.checkpointDigest
    ) {
      return { kind: 'conflict' as const, reason: 'checkpoint_conflict' as const }
    }
    const timestamp = now()
    await ctx.db.patch(reservation._id, {
      state: 'checkpointed',
      checkpointJson: args.checkpointJson,
      checkpointDigest: args.checkpointDigest,
      checkpointStep: args.checkpointStep,
      updatedAt: timestamp,
    })
    return {
      kind: 'checkpointed' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      generation: args.generation,
      checkpointDigest: args.checkpointDigest,
      checkpointStep: args.checkpointStep,
    }
  },
})

function isValidCheckpointJson(checkpointJson: string, checkpointDigest: string): boolean {
  if (checkpointJson.length > ANSWER_TURN_CHECKPOINT_MAX_JSON_BYTES) return false
  try {
    const parsed = JSON.parse(checkpointJson)
    return parseAnswerTurnCheckpoint(parsed) !== null && canonicalDigest(parsed) === checkpointDigest
  } catch {
    return false
  }
}

export const persistReservedAnswerTurn = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    leaseOwner: v.string(),
    answerDigest: v.string(),
    intent: literalUnion(FollowUpIntentValues),
    evidenceJson: v.string(),
    snapshotHash: v.string(),
    proseJson: v.string(),
    artifactKindsJson: v.string(),
    finalStatus: v.optional(v.union(v.literal('complete'), v.literal('error'))),
    errorCopyId: v.optional(v.string()),
    errorProblemJson: v.optional(v.string()),
    toolCalls: v.array(answerToolCallInput),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  returns: persistReservedAnswerTurnResult,
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
    const reservation = await ctx.db
      .query('answerTurnReservations')
      .withIndex('by_reservationKey', (query) => query.eq('reservationKey', args.reservationKey))
      .unique()
    if (reservation === null) return { kind: 'conflict' as const, reason: 'reservation_not_found' as const }
    if (
      reservation.sessionId !== args.sessionId ||
      reservation.threadId !== args.threadId ||
      reservation.turnId !== args.turnId ||
      reservation.seq !== args.turnSeq
    ) {
      return { kind: 'conflict' as const, reason: 'reservation_identity_mismatch' as const }
    }
    if (reservation.requestDigest !== args.requestDigest) {
      return { kind: 'conflict' as const, reason: 'request_digest_mismatch' as const }
    }
    if (reservation.state === 'stopped') return { kind: 'conflict' as const, reason: 'stopped' as const }
    const terminalState = reservation.state === 'answer_persisted' || reservation.state === 'finalized'
    if (reservation.state !== 'finalized') {
      if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
        return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return { kind: 'conflict' as const, reason: 'lease_owner_mismatch' as const }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= now()) {
        return { kind: 'conflict' as const, reason: 'lease_expired' as const }
      }
    }
    if (terminalState && reservation.answerDigest !== args.answerDigest) {
      return { kind: 'conflict' as const, reason: 'answer_digest_conflict' as const }
    }
    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (thread === null || thread.pseudonymousSessionId !== args.sessionId) {
      return { kind: 'conflict' as const, reason: 'reservation_identity_mismatch' as const }
    }


    const existingTurn = await ctx.db
      .query('answerTurns')
      .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
      .unique()
    if (reservation.state === 'answer_persisted' || reservation.state === 'finalized') {
      if (existingTurn === null || existingTurn.snapshotHash !== args.snapshotHash) {
        return { kind: 'conflict' as const, reason: 'turn_conflict' as const }
      }
      const existingTools = await ctx.db
        .query('answerToolCalls')
        .withIndex('by_turn_seq', (query) => query.eq('turnId', args.turnId))
        .order('asc')
        .take(ANSWER_THREAD_MAX_TURNS + 1)
      const existingToolsWithRequiredFields = existingTools.map((call) => {
        if (call.toolId === undefined || call.status === undefined) {
          throw new Error('answer_tool_call_fields_missing')
        }
        return {
          toolCallId: call.toolCallId,
          seq: call.seq,
          toolId: call.toolId,
          inputJson: call.inputJson,
          resultSummaryJson: call.resultSummaryJson,
          resultJson: call.resultJson,
          resultHash: call.resultHash,
          status: call.status,
        }
      })
      const incomingToolsWithRequiredFields = args.toolCalls.map((call) => {
        if (call.toolId === undefined || call.status === undefined) {
          throw new Error('answer_tool_call_fields_missing')
        }
        return {
          toolCallId: call.toolCallId,
          seq: call.seq,
          toolId: call.toolId,
          inputJson: call.inputJson,
          resultSummaryJson: call.resultSummaryJson,
          resultJson: call.resultJson,
          resultHash: call.resultHash,
          status: call.status,
        }
      })
      if (!toolCallsMatch(existingToolsWithRequiredFields, incomingToolsWithRequiredFields)) {
        return { kind: 'conflict' as const, reason: 'tool_call_conflict' as const }
      }
      return {
        kind: 'replayed' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
      }
    }
    if (existingTurn !== null) return { kind: 'conflict' as const, reason: 'turn_conflict' as const }

    const timestamp = now()
    await ctx.db.insert('answerTurns', {
      turnId: args.turnId,
      threadId: args.threadId,
      seq: args.turnSeq,
      query: reservation.query,
      intent: args.intent,
      evidenceJson: args.evidenceJson,
      snapshotHash: args.snapshotHash,
      proseJson: args.proseJson,
      artifactKindsJson: args.artifactKindsJson,
      status: 'pending',
      ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
      ...(args.errorProblemJson === undefined ? {} : { errorProblemJson: args.errorProblemJson }),
      createdAt: timestamp,
    })
    for (const call of args.toolCalls) {
      if (call.toolId === undefined || call.status === undefined) {
        throw new Error('answer_tool_call_fields_missing')
      }
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
    await ctx.db.patch(reservation._id, {
      state: 'answer_persisted',
      finalStatus: args.finalStatus ?? (args.errorProblemJson === undefined ? 'complete' : 'error'),
      answerDigest: args.answerDigest,
      checkpointJson: undefined,
      checkpointDigest: undefined,
      checkpointStep: undefined,
      updatedAt: timestamp,
    })
    await ctx.db.patch(thread._id, { updatedAt: timestamp })
    return {
      kind: 'persisted' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.seq,
    }
  },
})

export const failPersistedAnswerTurn = mutationGeneric({
  args: {
    reservationKey: v.string(),
    requestDigest: v.string(),
    sessionId: v.string(),
    threadId: v.string(),
    turnId: v.string(),
    turnSeq: v.number(),
    generation: v.number(),
    leaseOwner: v.string(),
    answerDigest: v.string(),
    errorCopyId: v.optional(v.string()),
    errorProblemJson: v.string(),
    operationKey: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    ...sourceWriteArgs,
  },
  handler: async (ctx, args) => {
    await requireAnswerThreadSourceWrite(ctx, args)
    const reservation = await ctx.db
      .query('answerTurnReservations')
      .withIndex('by_reservationKey', (query) => query.eq('reservationKey', args.reservationKey))
      .unique()
    if (reservation === null) return { kind: 'conflict' as const, reason: 'reservation_not_found' as const }
    if (
      reservation.sessionId !== args.sessionId ||
      reservation.threadId !== args.threadId ||
      reservation.turnId !== args.turnId ||
      reservation.seq !== args.turnSeq
    ) {
      return { kind: 'conflict' as const, reason: 'reservation_identity_mismatch' as const }
    }
    if (reservation.requestDigest !== args.requestDigest) {
      return { kind: 'conflict' as const, reason: 'request_digest_mismatch' as const }
    }
    if (reservation.state === 'stopped') {
      return {
        kind: 'stopped' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
      }
    }
    if (reservation.state !== 'finalized') {
      if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
        return { kind: 'conflict' as const, reason: 'generation_mismatch' as const }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return { kind: 'conflict' as const, reason: 'lease_owner_mismatch' as const }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= now()) {
        return { kind: 'conflict' as const, reason: 'lease_expired' as const }
      }
    }
    if (reservation.state === 'finalized') {
      if (reservation.answerDigest !== args.answerDigest) {
        return { kind: 'conflict' as const, reason: 'answer_digest_conflict' as const }
      }
      return {
        kind: 'replayed' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        status: settledAnswerTurnStatus(reservation.finalStatus),
      }
    }
    if (reservation.state === 'reserved') {
      return { kind: 'conflict' as const, reason: 'not_persisted' as const }
    }
    if (reservation.answerDigest !== args.answerDigest) {
      return { kind: 'conflict' as const, reason: 'answer_digest_conflict' as const }
    }

    const thread = await ctx.db
      .query('answerThreads')
      .withIndex('by_threadId', (query) => query.eq('threadId', args.threadId))
      .unique()
    if (thread === null || thread.pseudonymousSessionId !== args.sessionId) {
      return { kind: 'conflict' as const, reason: 'reservation_identity_mismatch' as const }
    }

    const turn = await ctx.db
      .query('answerTurns')
      .withIndex('by_turnId', (query) => query.eq('turnId', args.turnId))
      .unique()
    if (turn === null || turn.threadId !== args.threadId || turn.seq !== args.turnSeq) {
      return { kind: 'conflict' as const, reason: 'turn_not_found' as const }
    }
    if (turn.status === 'stopped') {
      return {
        kind: 'stopped' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
      }
    }
    if (turn.status === 'complete' || turn.status === 'error') {
      const timestamp = now()
      await ctx.db.patch(reservation._id, {
        state: 'finalized',
        finalStatus: turn.status,
        answerDigest: args.answerDigest,
        checkpointJson: undefined,
        checkpointDigest: undefined,
        checkpointStep: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: timestamp,
      })
      return {
        kind: 'replayed' as const,
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        status: turn.status,
      }
    }

    const timestamp = now()
    await ctx.db.patch(turn._id, {
      evidenceJson: '{}',
      proseJson: '{}',
      artifactKindsJson: '[]',
      status: 'error',
      ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
      errorProblemJson: args.errorProblemJson,
    })
    await ctx.db.patch(reservation._id, {
      state: 'finalized',
      finalStatus: 'error',
      answerDigest: args.answerDigest,
      checkpointJson: undefined,
      checkpointDigest: undefined,
      checkpointStep: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: timestamp,
    })
    await ctx.db.patch(thread._id, { updatedAt: timestamp })
    return {
      kind: 'failed' as const,
      reservationKey: reservation.reservationKey,
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.seq,
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
      checkpointJson: undefined,
      checkpointDigest: undefined,
      checkpointStep: undefined,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
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

    return buildPublicThreadProjectionWithReservations(
      toThreadRecord(threadRow),
      turnRows,
      ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT,
    )
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

    return buildPublicThreadProjectionWithReservations(
      toThreadRecord(threadRow),
      turnRows,
      ANSWER_THREAD_PUBLIC_TURN_SNAPSHOT_LIMIT,
    )
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

async function requireAnswerThreadSourceWrite(
  ctx: { db: unknown },
  args: SourceWriteArgs,
): Promise<void> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'answer_thread')
  if (sourceWrite.kind === 'rejected') {
    throw new Error(`answer_thread_source_write_rejected:${sourceWrite.reason}`)
  }
}

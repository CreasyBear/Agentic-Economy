import { v } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'

import type { SourceWriteArgs } from './sourceWriteAdmission'
import {
  MAX_ANSWER_TURN_CHECKPOINT_BYTES,
  parseAnswerTurnCheckpoint,
} from '../src/modules/answer-thread/convex'
import {
  requireAnswerThreadSourceRead,
  requireAnswerThreadSourceWrite,
  reservationGeneration,
} from './answerThreadsReserve'

const ANSWER_TURN_CHECKPOINT_MAX_STEP = 16

export type PersistAnswerTurnCheckpointHandlerArgs = SourceWriteArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  checkpointStep: number
  checkpointJson: string
  checkpointDigest: string
}

export type ReadAnswerTurnCheckpointHandlerArgs = SourceWriteArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
}

export type StopAnswerTurnHandlerArgs = SourceWriteArgs & {
  sessionId: string
  threadId: string
  turnId: string
}

export const persistAnswerTurnCheckpointResult = v.union(
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

export const readAnswerTurnCheckpointResult = v.union(
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

export const stopAnswerTurnResult = v.union(
  v.object({ kind: v.literal('stopped'), threadId: v.string(), turnId: v.string() }),
  v.object({
    kind: v.literal('already_settled'),
    threadId: v.string(),
    turnId: v.string(),
    status: v.union(v.literal('complete'), v.literal('error'), v.literal('stopped')),
  }),
  v.object({ kind: v.literal('not_found') }),
)

function settledAnswerTurnStatus(finalStatus: string | undefined): 'complete' | 'error' {
  return finalStatus === 'complete' || finalStatus === 'error' ? finalStatus : 'error'
}

export async function persistAnswerTurnCheckpointHandler(
  ctx: MutationCtx,
  args: PersistAnswerTurnCheckpointHandlerArgs,
) {
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
      await ctx.db.patch(reservation._id, { updatedAt: Date.now() })
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
    updatedAt: Date.now(),
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
}

export async function readAnswerTurnCheckpointHandler(
  ctx: QueryCtx,
  args: ReadAnswerTurnCheckpointHandlerArgs,
) {
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
}

export async function stopAnswerTurnHandler(ctx: MutationCtx, args: StopAnswerTurnHandlerArgs) {
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
  const timestamp = Date.now()
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
}

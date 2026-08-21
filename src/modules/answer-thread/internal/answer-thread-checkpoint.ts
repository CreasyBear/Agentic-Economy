import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import type { AnswerTurnCheckpoint } from '../answer-thread.schema'
import {
  parseAnswerTurnCheckpoint,
  serializeAnswerTurnCheckpoint,
} from './answer-turn-checkpoint'
import {
  activeAnswerThreadPort,
  withAnswerThreadSourceWrite,
  type AnswerThreadSourceWriteMutationArgs,
  type AnswerThreadSourceWriteRequestArgs,
  type LocalE2eAnswerThreadState,
} from './answer-thread-reads'

export type PersistAnswerTurnCheckpointArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  checkpoint: AnswerTurnCheckpoint
}

type PersistAnswerTurnCheckpointMutationArgs =
  Omit<PersistAnswerTurnCheckpointArgs, 'sourceWriteRequest' | 'sourceWriteBody' | 'checkpoint'>
  & AnswerThreadSourceWriteMutationArgs
  & {
    checkpointStep: number
    checkpointJson: string
    checkpointDigest: string
  }

export type PersistAnswerTurnCheckpointResult =
  | {
      kind: 'persisted' | 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
      checkpointDigest: string
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'checkpoint_invalid'
        | 'checkpoint_conflict'
        | 'stopped'
        | 'settled'
    }

export type ReadAnswerTurnCheckpointArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
}

type ReadAnswerTurnCheckpointQueryArgs =
  Omit<ReadAnswerTurnCheckpointArgs, 'sourceWriteRequest' | 'sourceWriteBody'>
  & AnswerThreadSourceWriteMutationArgs

export type ReadAnswerTurnCheckpointResult =
  | { kind: 'checkpoint'; checkpoint: AnswerTurnCheckpoint }
  | { kind: 'missing' }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'checkpoint_invalid'
        | 'stopped'
        | 'settled'
    }

export type ReadAnswerTurnCheckpointWireResult =
  | {
      kind: 'checkpoint'
      checkpointJson: string
      checkpointDigest: string
      generation: number
      checkpointStep: number
    }
  | { kind: 'missing' }
  | {
      kind: 'conflict'
      reason: Extract<ReadAnswerTurnCheckpointResult, { kind: 'conflict' }>['reason']
    }

export const persistAnswerTurnCheckpointMutation = sourceMutation<
  PersistAnswerTurnCheckpointMutationArgs,
  PersistAnswerTurnCheckpointResult
>('answerThreads:persistAnswerTurnCheckpoint')
export const readAnswerTurnCheckpointQuery = sourceQuery<
  ReadAnswerTurnCheckpointQueryArgs,
  ReadAnswerTurnCheckpointWireResult
>('answerThreads:readAnswerTurnCheckpoint')

export async function persistAnswerTurnCheckpoint(
  args: PersistAnswerTurnCheckpointArgs,
): Promise<PersistAnswerTurnCheckpointResult> {
  const serialized = serializeAnswerTurnCheckpoint(args.checkpoint)
  if (serialized === null) {
    return { kind: 'conflict', reason: 'checkpoint_invalid' }
  }
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.persistAnswerTurnCheckpoint(args)
  }
  const operationKey = `answer_thread:checkpoint:${args.reservationKey}:${args.turnId}:${args.checkpoint.stepOrdinal}`
  const correlationId = operationKey
  const command: Omit<PersistAnswerTurnCheckpointMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    reservationKey: args.reservationKey,
    requestDigest: args.requestDigest,
    sessionId: args.sessionId,
    threadId: args.threadId,
    turnId: args.turnId,
    turnSeq: args.turnSeq,
    generation: args.generation,
    checkpointStep: args.checkpoint.stepOrdinal,
    checkpointJson: serialized.checkpointJson,
    checkpointDigest: serialized.checkpointDigest,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    persistAnswerTurnCheckpointMutation,
    await withAnswerThreadSourceWrite({
      request: args.sourceWriteRequest,
      body: args.sourceWriteBody,
      command,
      scope: 'answer_thread',
      operationKey,
      correlationId,
    }),
  )
}

export async function readAnswerTurnCheckpoint(
  args: ReadAnswerTurnCheckpointArgs,
): Promise<ReadAnswerTurnCheckpointResult> {
  const port = activeAnswerThreadPort()
  const operationKey = `answer_thread:checkpoint:read:${args.reservationKey}:${args.turnId}`
  const correlationId = operationKey
  const command: Omit<ReadAnswerTurnCheckpointQueryArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    reservationKey: args.reservationKey,
    requestDigest: args.requestDigest,
    sessionId: args.sessionId,
    threadId: args.threadId,
    turnId: args.turnId,
    turnSeq: args.turnSeq,
    generation: args.generation,
    operationKey,
    correlationId,
  }
  const result = port === undefined
    ? await callPublicSourceQuery(
        readAnswerTurnCheckpointQuery,
        await withAnswerThreadSourceWrite({
          request: args.sourceWriteRequest,
          body: args.sourceWriteBody,
          command,
          scope: 'answer_thread',
          operationKey,
          correlationId,
        }),
      )
    : await port.readAnswerTurnCheckpoint(args)
  if (result.kind !== 'checkpoint') return result
  const checkpoint = parseAnswerTurnCheckpoint(result.checkpointJson, result.checkpointDigest)
  if (
    checkpoint === null
    || checkpoint.generation !== result.generation
    || checkpoint.stepOrdinal !== result.checkpointStep
  ) {
    return { kind: 'conflict', reason: 'checkpoint_invalid' }
  }
  return { kind: 'checkpoint', checkpoint }
}

export function createLocalE2eCheckpointHandlers(state: LocalE2eAnswerThreadState) {
  return {
    persistAnswerTurnCheckpoint: async (
      args: PersistAnswerTurnCheckpointArgs,
    ): Promise<PersistAnswerTurnCheckpointResult> => {
      const serialized = serializeAnswerTurnCheckpoint(args.checkpoint)
      if (serialized === null) return { kind: 'conflict', reason: 'checkpoint_invalid' }
      const reservation = state.reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId
        || reservation.threadId !== args.threadId
        || reservation.turnId !== args.turnId
        || reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state === 'finalized') {
        return { kind: 'conflict', reason: 'settled' }
      }
      const generation = state.generations.get(args.reservationKey) ?? 0
      if (generation !== args.generation || args.checkpoint.generation !== generation) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      const existing = state.checkpoints.get(args.reservationKey)
      if (existing !== undefined) {
        const existingSerialized = serializeAnswerTurnCheckpoint(existing)
        if (existingSerialized === null) return { kind: 'conflict', reason: 'checkpoint_invalid' }
        if (existingSerialized.checkpointDigest === serialized.checkpointDigest) {
          state.reservations.set(args.reservationKey, { ...reservation, updatedAt: Date.now() })
          return {
            kind: 'replayed',
            reservationKey: args.reservationKey,
            threadId: args.threadId,
            turnId: args.turnId,
            turnSeq: args.turnSeq,
            generation,
            checkpointDigest: serialized.checkpointDigest,
          }
        }
        if (
          args.checkpoint.stepOrdinal !== existing.stepOrdinal + 1
          || args.checkpoint.parentCheckpointDigest !== existingSerialized.checkpointDigest
        ) {
          return { kind: 'conflict', reason: 'checkpoint_conflict' }
        }
      } else if (args.checkpoint.stepOrdinal !== 1 || args.checkpoint.parentCheckpointDigest !== undefined) {
        return { kind: 'conflict', reason: 'checkpoint_conflict' }
      }
      state.reservations.set(args.reservationKey, { ...reservation, updatedAt: Date.now() })
      state.checkpoints.set(args.reservationKey, args.checkpoint)
      return {
        kind: 'persisted',
        reservationKey: args.reservationKey,
        threadId: args.threadId,
        turnId: args.turnId,
        turnSeq: args.turnSeq,
        generation,
        checkpointDigest: serialized.checkpointDigest,
      }
    },
    readAnswerTurnCheckpoint: async (
      args: ReadAnswerTurnCheckpointArgs,
    ): Promise<ReadAnswerTurnCheckpointWireResult> => {
      const reservation = state.reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'missing' }
      if (
        reservation.sessionId !== args.sessionId
        || reservation.threadId !== args.threadId
        || reservation.turnId !== args.turnId
        || reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state === 'finalized') return { kind: 'conflict', reason: 'settled' }
      const generation = state.generations.get(args.reservationKey) ?? 0
      if (generation !== args.generation) return { kind: 'conflict', reason: 'generation_mismatch' }
      const checkpoint = state.checkpoints.get(args.reservationKey)
      if (checkpoint === undefined) return { kind: 'missing' }
      if (
        checkpoint.generation !== generation
        || checkpoint.reservationKey !== args.reservationKey
        || checkpoint.requestDigest !== args.requestDigest
        || checkpoint.threadId !== args.threadId
        || checkpoint.turnId !== args.turnId
        || checkpoint.turnSeq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'checkpoint_invalid' }
      }
      const serialized = serializeAnswerTurnCheckpoint(checkpoint)
      if (serialized === null) return { kind: 'conflict', reason: 'checkpoint_invalid' }
      return {
        kind: 'checkpoint',
        checkpointJson: serialized.checkpointJson,
        checkpointDigest: serialized.checkpointDigest,
        generation,
        checkpointStep: checkpoint.stepOrdinal,
      }
    },
  }
}

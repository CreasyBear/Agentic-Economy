import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
  ANSWER_TURN_EXECUTION_LEASE_MS,
  type AnswerThreadRecord,
  type AnswerTurnReservationRecord,
} from '../answer-thread.schema'
import { serializeAnswerTurnCheckpoint } from './answer-turn-checkpoint'
import { normalizeAnswerTurnQuery } from './turn-digests'
import {
  activeAnswerThreadPort,
  withAnswerThreadSourceWrite,
  type AnswerThreadSourceWriteMutationArgs,
  type AnswerThreadSourceWriteRequestArgs,
  type LocalE2eAnswerThreadState,
} from './answer-thread-reads'

export type ReserveAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  sessionId: string
  threadId?: string
  query: string
  searchContextJson?: string
  requestDigest: string
  reservationKey: string
  title: string
}

type ReserveAnswerTurnMutationArgs =
  Omit<ReserveAnswerTurnArgs, 'sourceWriteRequest' | 'sourceWriteBody' | 'threadId'>
  & AnswerThreadSourceWriteMutationArgs
  & {
    requestedThreadScope: string
  }

export type AnswerTurnReservationResult =
  | {
      kind: 'reserved'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
      isNewThread: boolean
    }
  | {
      kind: 'in_progress'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
    }
  | {
      kind: 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
      state: AnswerTurnReservationRecord['state']
      finalStatus?: AnswerTurnReservationRecord['finalStatus']
    }
  | {
      kind: 'conflict'
      reason: 'request_digest_mismatch'
        | 'identity_mismatch'
        | 'checkpoint_conflict'
    }
  | {
      kind: 'refused'
      reason: 'thread_not_found' | 'thread_forbidden' | 'thread_turn_limit'
    }

export type RenewAnswerTurnLeaseArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
}

export type RenewAnswerTurnLeaseResult =
  | {
      kind: 'renewed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'stopped'
        | 'settled'
    }

type RenewAnswerTurnLeaseMutationArgs =
  Omit<RenewAnswerTurnLeaseArgs, 'sourceWriteRequest' | 'sourceWriteBody'>
  & AnswerThreadSourceWriteMutationArgs

export const reserveAnswerTurnMutation = sourceMutation<ReserveAnswerTurnMutationArgs, AnswerTurnReservationResult>(
  'answerThreads:reserveAnswerTurn',
)
export const renewAnswerTurnLeaseMutation = sourceMutation<
  RenewAnswerTurnLeaseMutationArgs,
  RenewAnswerTurnLeaseResult
>('answerThreads:renewAnswerTurnLease')

export async function reserveAnswerTurn(args: ReserveAnswerTurnArgs): Promise<AnswerTurnReservationResult> {
  const normalizedArgs = {
    ...args,
    query: normalizeAnswerTurnQuery(args.query),
  }
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.reserveAnswerTurn(normalizedArgs)
  }
  const operationKey = `answer_thread:reserve:${normalizedArgs.reservationKey}`
  const correlationId = operationKey
  const command: Omit<ReserveAnswerTurnMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    sessionId: normalizedArgs.sessionId,
    requestedThreadScope: normalizedArgs.threadId ?? 'new',
    query: normalizedArgs.query,
    ...(normalizedArgs.searchContextJson === undefined ? {} : { searchContextJson: normalizedArgs.searchContextJson }),
    requestDigest: normalizedArgs.requestDigest,
    reservationKey: normalizedArgs.reservationKey,
    title: normalizedArgs.title,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    reserveAnswerTurnMutation,
    await withAnswerThreadSourceWrite({
      request: normalizedArgs.sourceWriteRequest,
      body: normalizedArgs.sourceWriteBody,
      command,
      scope: 'answer_thread',
      operationKey,
      correlationId,
    }),
  )
}

export async function renewAnswerTurnLease(
  args: RenewAnswerTurnLeaseArgs,
): Promise<RenewAnswerTurnLeaseResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.renewAnswerTurnLease(args)
  }
  const operationKey = `answer_thread:lease:${args.reservationKey}:${args.generation}`
  const correlationId = operationKey
  const command: Omit<RenewAnswerTurnLeaseMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
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
  return callPublicSourceMutation(
    renewAnswerTurnLeaseMutation,
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

export function createLocalE2eReserveHandlers(state: LocalE2eAnswerThreadState) {
  return {
    reserveAnswerTurn: async (args: ReserveAnswerTurnArgs): Promise<AnswerTurnReservationResult> => {
      const requestedThreadScope = args.threadId ?? 'new'
      const prior = state.reservationFor(args.reservationKey)
      if (prior !== undefined) {
        if (prior.sessionId !== args.sessionId || prior.requestedThreadScope !== requestedThreadScope) {
          return { kind: 'conflict', reason: 'identity_mismatch' }
        }
        if (prior.requestDigest !== args.requestDigest) {
          return { kind: 'conflict', reason: 'request_digest_mismatch' }
        }
        const timestamp = Date.now()
        const generation = state.generations.get(prior.reservationKey) ?? 0
        if (prior.state === 'reserved') {
          if (timestamp - prior.updatedAt < ANSWER_TURN_EXECUTION_LEASE_MS) {
            return {
              kind: 'in_progress',
              reservationKey: prior.reservationKey,
              threadId: prior.threadId,
              turnId: prior.turnId,
              turnSeq: prior.seq,
              generation,
            }
          }
          const nextGeneration = generation + 1
          const checkpoint = state.checkpoints.get(prior.reservationKey)
          if (checkpoint !== undefined) {
            const serialized = serializeAnswerTurnCheckpoint(checkpoint)
            if (
              serialized === null
              || checkpoint.reservationKey !== prior.reservationKey
              || checkpoint.requestDigest !== prior.requestDigest
              || checkpoint.generation !== generation
              || checkpoint.threadId !== prior.threadId
              || checkpoint.turnId !== prior.turnId
              || checkpoint.turnSeq !== prior.seq
            ) {
              return { kind: 'conflict', reason: 'checkpoint_conflict' }
            }
            const advancedCheckpoint = { ...checkpoint, generation: nextGeneration }
            if (serializeAnswerTurnCheckpoint(advancedCheckpoint) === null) {
              return { kind: 'conflict', reason: 'checkpoint_conflict' }
            }
            state.checkpoints.set(prior.reservationKey, advancedCheckpoint)
          }
          state.generations.set(prior.reservationKey, nextGeneration)
          state.reservations.set(prior.reservationKey, { ...prior, updatedAt: timestamp })
          return {
            kind: 'reserved',
            reservationKey: prior.reservationKey,
            threadId: prior.threadId,
            turnId: prior.turnId,
            turnSeq: prior.seq,
            generation: nextGeneration,
            isNewThread: false,
          }
        }
        return {
          kind: 'replayed',
          reservationKey: prior.reservationKey,
          threadId: prior.threadId,
          turnId: prior.turnId,
          turnSeq: prior.seq,
          generation,
          state: prior.state,
          ...(prior.finalStatus === undefined ? {} : { finalStatus: prior.finalStatus }),
        }
      }

      let thread: AnswerThreadRecord | undefined
      if (args.threadId !== undefined) {
        thread = state.threads.get(args.threadId)
        if (thread === undefined) return { kind: 'refused', reason: 'thread_not_found' }
        if (thread.pseudonymousSessionId !== args.sessionId && !isLocalE2EAuthBypassEnabled()) {
          return { kind: 'refused', reason: 'thread_forbidden' }
        }
      } else {
        const timestamp = Date.now()
        thread = {
          threadId: crypto.randomUUID(),
          pseudonymousSessionId: args.sessionId,
          title: args.title,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        state.threads.set(thread.threadId, thread)
      }

      const existingIds = new Set(state.turnsForThread(thread.threadId).map((turn) => turn.turnId))
      const threadReservations = [...state.reservations.values()].filter((reservation) => reservation.threadId === thread.threadId)
      for (const reservation of threadReservations) {
        existingIds.add(reservation.turnId)
      }
      if (existingIds.size >= 25) return { kind: 'refused', reason: 'thread_turn_limit' }

      const turnSeq = Math.max(
        0,
        ...state.turnsForThread(thread.threadId).map((turn) => turn.seq),
        ...threadReservations.map((reservation) => reservation.seq),
      ) + 1
      const timestamp = Date.now()
      const reservation: AnswerTurnReservationRecord = {
        reservationKey: args.reservationKey,
        sessionId: args.sessionId,
        requestedThreadScope,
        requestDigest: args.requestDigest,
        threadId: thread.threadId,
        turnId: crypto.randomUUID(),
        seq: turnSeq,
        query: args.query,
        ...(args.searchContextJson === undefined ? {} : { searchContextJson: args.searchContextJson }),
        state: 'reserved',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      state.generations.set(reservation.reservationKey, 0)
      state.reservations.set(reservation.reservationKey, reservation)
      state.threads.set(thread.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'reserved',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        generation: 0,
        isNewThread: requestedThreadScope === 'new',
      }
    },
    renewAnswerTurnLease: async (args: RenewAnswerTurnLeaseArgs): Promise<RenewAnswerTurnLeaseResult> => {
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
      if (reservation.state === 'finalized') return { kind: 'conflict', reason: 'settled' }
      const generation = state.generations.get(args.reservationKey) ?? 0
      if (generation !== args.generation) return { kind: 'conflict', reason: 'generation_mismatch' }
      state.reservations.set(args.reservationKey, { ...reservation, updatedAt: Date.now() })
      return {
        kind: 'renewed',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        generation,
      }
    },
  }
}

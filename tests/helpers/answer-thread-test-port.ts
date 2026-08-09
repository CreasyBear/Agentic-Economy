import { readCookie, serializeCookie } from '@/lib/http/cookies'
import type {
  AnswerThreadRecord,
  AnswerTurnRecord,
  PublicThreadProjection,
} from '@/modules/answer-thread/public'
import {
  buildPublicReservationTurn,
  buildPublicThreadProjection,
} from '@/modules/answer-thread/internal/public-projection'
import type { AnswerTurnReservationRecord } from '@/modules/answer-thread/answer-thread.schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'

export type AnswerThreadTestStore = {
  threads: Map<string, AnswerThreadRecord>
  turns: Map<string, AnswerTurnRecord>
  reservations: Map<string, AnswerTurnReservationRecord>
  shares: Map<string, { threadId: string; shareToken: string; revoked: boolean }>
  persisted: unknown[]
  reserveError?: unknown
  persistError?: unknown
  persistErrors?: unknown[]
  getAnswerThreadError?: unknown
  getThreadTurnsError?: unknown
  listSessionThreadsError?: unknown
  getOwnedThreadProjectionError?: unknown
  issueShareError?: unknown
  revokeShareError?: unknown
  deleteThreadError?: unknown
}
type PersistedAnswerTurnRow = Record<string, unknown> & {
  turnId: string
  evidenceJson: string
  status: AnswerTurnRecord['status']
}

function clearReservationPrivateState(
  reservation: AnswerTurnReservationRecord,
): AnswerTurnReservationRecord {
  const cleared = { ...reservation }
  delete cleared.leaseOwner
  delete cleared.leaseExpiresAt
  delete cleared.checkpoint
  delete cleared.checkpointDigest
  delete cleared.checkpointStep
  return cleared
}

export function createAnswerThreadTestStore(): AnswerThreadTestStore {
  return {
    threads: new Map(),
    turns: new Map(),
    reservations: new Map(),
    shares: new Map(),
    persisted: [],
  }
}

export function installAnswerThreadTestPort(store: AnswerThreadTestStore): () => void {
  const turnsForThread = (threadId: string): AnswerTurnRecord[] =>
    [...store.turns.values()]
      .filter((turn) => turn.threadId === threadId)
      .sort((left, right) => left.seq - right.seq)

  const reservationsForThread = (threadId: string): AnswerTurnReservationRecord[] =>
    [...store.reservations.values()]
      .filter((reservation) => reservation.threadId === threadId)
      .sort((left, right) => left.seq - right.seq)

  const turnCountForThread = (threadId: string): number => {
    const seenTurnIds = new Set<string>()
    const seenSeqs = new Set<number>()
    let count = 0
    for (const turn of turnsForThread(threadId)) {
      if (seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue
      seenTurnIds.add(turn.turnId)
      seenSeqs.add(turn.seq)
      count += 1
    }
    for (const reservation of reservationsForThread(threadId)) {
      if (buildPublicReservationTurn(reservation) === undefined) continue
      if (seenTurnIds.has(reservation.turnId) || seenSeqs.has(reservation.seq)) continue
      seenTurnIds.add(reservation.turnId)
      seenSeqs.add(reservation.seq)
      count += 1
    }
    return Math.min(count, 26)
  }

  const publicProjectionForThread = (thread: AnswerThreadRecord): PublicThreadProjection => {
    const persisted = buildPublicThreadProjection(thread, turnsForThread(thread.threadId))
    const turns: PublicThreadProjection['turns'][number][] = []
    const seenTurnIds = new Set<string>()
    const seenSeqs = new Set<number>()
    for (const turn of persisted.turns) {
      if (seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue
      seenTurnIds.add(turn.turnId)
      seenSeqs.add(turn.seq)
      turns.push(turn)
    }
    for (const reservation of reservationsForThread(thread.threadId)) {
      const turn = buildPublicReservationTurn(reservation)
      if (turn === undefined || seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue
      seenTurnIds.add(turn.turnId)
      seenSeqs.add(turn.seq)
      turns.push(turn)
    }
    turns.sort((left, right) => left.seq - right.seq)
    return {
      ...persisted,
      turns: turns.slice(0, 25),
    }
  }

  return setAnswerThreadPortForTests({
    reserveAnswerTurn: async (args) => {
      if (store.reserveError !== undefined) throw store.reserveError
      const requestedThreadScope = args.threadId ?? 'new'
      const prior = store.reservations.get(args.reservationKey)
      if (prior !== undefined) {
        if (prior.sessionId !== args.sessionId || prior.requestedThreadScope !== requestedThreadScope) {
          return { kind: 'conflict', reason: 'identity_mismatch' }
        }
        if (prior.requestDigest !== args.requestDigest) {
          return { kind: 'conflict', reason: 'request_digest_mismatch' }
        }
        return {
          kind: 'replayed',
          reservationKey: prior.reservationKey,
          threadId: prior.threadId,
          turnId: prior.turnId,
          turnSeq: prior.seq,
          state: prior.state,
          ...(prior.finalStatus === undefined ? {} : { finalStatus: prior.finalStatus }),
        }
      }

      let thread = args.threadId === undefined ? undefined : store.threads.get(args.threadId)
      if (args.threadId !== undefined && thread === undefined) {
        return { kind: 'refused', reason: 'thread_not_found' }
      }
      if (thread !== undefined && thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'refused', reason: 'thread_forbidden' }
      }
      if (thread === undefined) {
        const timestamp = Date.now()
        thread = {
          threadId: crypto.randomUUID(),
          pseudonymousSessionId: args.sessionId,
          title: args.title,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        store.threads.set(thread.threadId, thread)
      }

      if (turnCountForThread(thread.threadId) >= 25) {
        return { kind: 'refused', reason: 'thread_turn_limit' }
      }
      const threadReservations = [...store.reservations.values()].filter(
        (reservation) => reservation.threadId === thread?.threadId,
      )

      const turnSeq =
        Math.max(
          0,
          ...turnsForThread(thread.threadId).map((turn) => turn.seq),
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
      store.reservations.set(reservation.reservationKey, reservation)
      store.threads.set(thread.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'reserved',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        isNewThread: requestedThreadScope === 'new',
      }
    },
    acquireAnswerTurnResumeLease: async (args) => {
      const reservation = store.reservations.get(args.reservationKey)
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
      if (args.mode === 'resume' && (
        args.expectedGeneration === undefined
        || reservation.runGeneration !== args.expectedGeneration
      )) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      const thread = store.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.state === 'stopped') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: 'stopped',
        }
      }
      if (reservation.state === 'finalized') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.state === 'answer_persisted') {
        if (args.mode !== 'resume') {
          return {
            kind: 'pending',
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
          return { kind: 'conflict', reason: 'non_resumable' }
        }
        const timestamp = Date.now()
        const leaseActive = currentLeaseExpiresAt > timestamp
        if (leaseActive && currentLeaseOwner !== args.leaseOwner) {
          return {
            kind: 'pending',
            reservationKey: reservation.reservationKey,
            threadId: reservation.threadId,
            turnId: reservation.turnId,
            leaseExpiresAt: currentLeaseExpiresAt,
          }
        }
        const generation = leaseActive ? currentGeneration : currentGeneration + 1
        const turn = store.turns.get(args.turnId)
        if (turn === undefined) return { kind: 'conflict', reason: 'non_resumable' }
        if (turn.status === 'stopped') {
          store.reservations.set(args.reservationKey, {
            ...clearReservationPrivateState(reservation),
            state: 'stopped',
            updatedAt: timestamp,
          })
          return {
            kind: 'settled',
            reservationKey: reservation.reservationKey,
            threadId: reservation.threadId,
            turnId: reservation.turnId,
            status: 'stopped',
          }
        }
        if (turn.status !== finalStatus) store.turns.set(args.turnId, { ...turn, status: finalStatus })
        store.reservations.set(args.reservationKey, {
          ...clearReservationPrivateState(reservation),
          state: 'finalized',
          finalStatus,
          runGeneration: generation,
          updatedAt: timestamp,
        })
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: finalStatus,
        }
      }
      if (args.mode === 'resume') {
        const resumableReserved = reservation.state === 'reserved'
          && reservation.checkpoint === undefined
          && reservation.checkpointDigest === undefined
          && reservation.checkpointStep === undefined
        const resumableCheckpoint = reservation.state === 'checkpointed'
          && reservation.runGeneration !== undefined
          && reservation.checkpoint !== undefined
          && reservation.checkpointDigest !== undefined
          && reservation.checkpointStep !== undefined
        if (!resumableReserved && !resumableCheckpoint) {
          return { kind: 'conflict', reason: 'non_resumable' }
        }
      }
      const timestamp = Date.now()
      const leaseActive = reservation.leaseOwner !== undefined
        && reservation.leaseExpiresAt !== undefined
        && reservation.leaseExpiresAt > timestamp
      if (leaseActive && reservation.leaseOwner !== args.leaseOwner) {
        return {
          kind: 'pending',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          ...(reservation.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: reservation.leaseExpiresAt }),
        }
      }
      const currentGeneration = reservation.runGeneration
      if (args.mode === 'resume' && currentGeneration === undefined) {
        return { kind: 'conflict', reason: 'non_resumable' }
      }
      const generation = currentGeneration === undefined
        ? 0
        : leaseActive || reservation.leaseOwner === undefined
          ? currentGeneration
          : currentGeneration + 1
      const leaseExpiresAt = timestamp + 60_000
      store.reservations.set(args.reservationKey, {
        ...reservation,
        runGeneration: generation,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
        updatedAt: timestamp,
      })
      return {
        kind: 'acquired',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        query: reservation.query,
        ...(reservation.searchContextJson === undefined ? {} : { searchContextJson: reservation.searchContextJson }),
        generation,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
        ...(reservation.checkpoint === undefined ? {} : { checkpoint: reservation.checkpoint }),
        ...(reservation.checkpointDigest === undefined ? {} : { checkpointDigest: reservation.checkpointDigest }),
        ...(reservation.checkpointStep === undefined ? {} : { checkpointStep: reservation.checkpointStep }),
      }
    },
    renewAnswerTurnResumeLease: async (args) => {
      const reservation = store.reservations.get(args.reservationKey)
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
      if (reservation.state === 'stopped') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: 'stopped',
        }
      }
      if (reservation.state === 'finalized') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.runGeneration !== args.generation) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return { kind: 'conflict', reason: 'lease_active' }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
        return { kind: 'conflict', reason: 'lease_active' }
      }
      const leaseExpiresAt = Date.now() + 60_000
      store.reservations.set(args.reservationKey, { ...reservation, leaseExpiresAt, updatedAt: Date.now() })
      return {
        kind: 'acquired',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        query: reservation.query,
        ...(reservation.searchContextJson === undefined ? {} : { searchContextJson: reservation.searchContextJson }),
        generation: args.generation,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
        ...(reservation.checkpoint === undefined ? {} : { checkpoint: reservation.checkpoint }),
        ...(reservation.checkpointDigest === undefined ? {} : { checkpointDigest: reservation.checkpointDigest }),
        ...(reservation.checkpointStep === undefined ? {} : { checkpointStep: reservation.checkpointStep }),
      }
    },
    writeAnswerTurnCheckpoint: async (args) => {
      const reservation = store.reservations.get(args.reservationKey)
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
      if (reservation.state === 'stopped') {
        return {
          kind: 'stopped',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
        }
      }
      if (reservation.state === 'finalized' || reservation.state === 'answer_persisted') {
        return { kind: 'conflict', reason: 'finalized' }
      }
      if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return { kind: 'conflict', reason: 'lease_owner_mismatch' }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
        return { kind: 'conflict', reason: 'lease_expired' }
      }
      const checkpointDigest = canonicalDigest(args.checkpoint).toString()
      if (reservation.checkpointDigest === checkpointDigest && reservation.checkpointStep === args.checkpoint.stepIndex) {
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          generation: args.generation,
          checkpointDigest,
          checkpointStep: args.checkpoint.stepIndex,
        }
      }
      if (reservation.checkpointStep !== undefined && args.checkpoint.stepIndex < reservation.checkpointStep) {
        return { kind: 'conflict', reason: 'checkpoint_step_stale' }
      }
      if (
        reservation.checkpointStep === args.checkpoint.stepIndex
        && reservation.checkpointDigest !== undefined
        && reservation.checkpointDigest !== checkpointDigest
      ) {
        return { kind: 'conflict', reason: 'checkpoint_conflict' }
      }
      store.reservations.set(args.reservationKey, {
        ...reservation,
        state: 'checkpointed',
        checkpoint: args.checkpoint,
        checkpointDigest,
        checkpointStep: args.checkpoint.stepIndex,
        updatedAt: Date.now(),
      })
      return {
        kind: 'checkpointed',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        generation: args.generation,
        checkpointDigest,
        checkpointStep: args.checkpoint.stepIndex,
      }
    },
    persistReservedAnswerTurn: async (args) => {
      const reservation = store.reservations.get(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state !== 'finalized') {
        if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
          return { kind: 'conflict', reason: 'generation_mismatch' }
        }
        if (reservation.leaseOwner !== args.leaseOwner) {
          return { kind: 'conflict', reason: 'lease_owner_mismatch' }
        }
        if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
          return { kind: 'conflict', reason: 'lease_expired' }
        }
      }
      if (
        (reservation.state === 'answer_persisted' || reservation.state === 'finalized') &&
        reservation.answerDigest !== args.answerDigest
      ) {
        return { kind: 'conflict', reason: 'answer_digest_conflict' }
      }
      if (reservation.state === 'answer_persisted' || reservation.state === 'finalized') {
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
        }
      }

      const thread = store.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      const persistError = store.persistErrors?.shift() ?? store.persistError
      if (persistError !== undefined) throw persistError

      const timestamp = Date.now()
      store.turns.set(args.turnId, {
        turnId: args.turnId,
        threadId: args.threadId,
        seq: args.turnSeq,
        query: args.query,
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
      const persistedRow: PersistedAnswerTurnRow = { ...args, status: 'pending' }
      store.persisted.push(persistedRow)
      store.reservations.set(args.reservationKey, {
        ...reservation,
        state: 'answer_persisted',
        finalStatus: args.finalStatus ?? (args.errorProblemJson === undefined ? 'complete' : 'error'),
        answerDigest: args.answerDigest,
        updatedAt: timestamp,
      })
      store.threads.set(args.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'persisted',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
      }
    },
    stopAnswerTurn: async (args) => {
      const reservation = [...store.reservations.values()].find(
        (candidate) =>
          candidate.threadId === args.threadId &&
          candidate.turnId === args.turnId &&
          candidate.sessionId === args.sessionId,
      )
      if (reservation === undefined) return { kind: 'not_found' }
      if (reservation.state === 'finalized') {
        return {
          kind: 'already_settled',
          threadId: args.threadId,
          turnId: args.turnId,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.state === 'stopped') {
        return { kind: 'already_settled', threadId: args.threadId, turnId: args.turnId, status: 'stopped' }
      }
      store.reservations.set(reservation.reservationKey, { ...reservation, state: 'stopped', updatedAt: Date.now() })
      const turn = store.turns.get(args.turnId)
      if (turn !== undefined) store.turns.set(args.turnId, { ...turn, status: 'stopped' })
      return { kind: 'stopped', threadId: args.threadId, turnId: args.turnId }
    },
    failPersistedAnswerTurn: async (args) => {
      const reservation = store.reservations.get(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') {
        return {
          kind: 'stopped',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
        }
      }
      if (reservation.state !== 'finalized') {
        if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
          return { kind: 'conflict', reason: 'generation_mismatch' }
        }
        if (reservation.leaseOwner !== args.leaseOwner) {
          return { kind: 'conflict', reason: 'lease_owner_mismatch' }
        }
        if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
          return { kind: 'conflict', reason: 'lease_expired' }
        }
      }
      if (reservation.state === 'finalized') {
        if (reservation.answerDigest !== args.answerDigest) {
          return { kind: 'conflict', reason: 'answer_digest_conflict' }
        }
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.state === 'reserved') return { kind: 'conflict', reason: 'not_persisted' }
      if (reservation.answerDigest !== args.answerDigest) {
        return { kind: 'conflict', reason: 'answer_digest_conflict' }
      }
      const thread = store.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      const turn = store.turns.get(args.turnId)
      if (turn === undefined) return { kind: 'conflict', reason: 'turn_not_found' }
      if (turn.status === 'stopped') {
        return {
          kind: 'stopped',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
        }
      }
      if (turn.status === 'complete' || turn.status === 'error') {
        store.reservations.set(args.reservationKey, {
          ...reservation,
          state: 'finalized',
          finalStatus: turn.status,
          answerDigest: args.answerDigest,
          updatedAt: Date.now(),
        })
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
          status: turn.status,
        }
      }
      const timestamp = Date.now()
      const redactedTurn = {
        ...turn,
        evidenceJson: '{}',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'error' as const,
        ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
        errorProblemJson: args.errorProblemJson,
      }
      store.turns.set(args.turnId, redactedTurn)
      store.reservations.set(args.reservationKey, {
        ...reservation,
        state: 'finalized',
        finalStatus: 'error',
        answerDigest: args.answerDigest,
        updatedAt: timestamp,
      })
      store.threads.set(args.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'failed',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
      }
    },

    listSessionThreads: async (sessionId, limit = 20) => {
      if (store.listSessionThreadsError !== undefined) throw store.listSessionThreadsError
      return {
        threads: [...store.threads.values()]
          .filter((thread) => thread.pseudonymousSessionId === sessionId)
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, Math.max(1, Math.min(50, Math.floor(limit)))),
      }
    },
    getOwnedThreadProjection: async (threadId, sessionId) => {
      if (store.getOwnedThreadProjectionError !== undefined) throw store.getOwnedThreadProjectionError
      const thread = store.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId) return null
      return publicProjectionForThread(thread)
    },
    issueShare: async (args) => {
      if (store.issueShareError !== undefined) throw store.issueShareError
      const thread = store.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
        throw new Error('thread_not_found')
      }
      const existing = store.shares.get(args.threadId)
      const shareToken = existing?.revoked === false
        ? existing.shareToken
        : Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
      store.shares.set(args.threadId, { threadId: args.threadId, shareToken, revoked: false })
      return { threadId: args.threadId, shareToken }
    },
    revokeShare: async (args) => {
      if (store.revokeShareError !== undefined) throw store.revokeShareError
      const thread = store.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
        throw new Error('thread_not_found')
      }
      const existing = store.shares.get(args.threadId)
      if (existing === undefined || existing.revoked) return { threadId: args.threadId, revoked: false }
      store.shares.set(args.threadId, { ...existing, revoked: true })
      return { threadId: args.threadId, revoked: true }
    },
    getSharedThreadProjection: async (shareToken) => {
      const share = [...store.shares.values()].find(
        (candidate) => candidate.shareToken === shareToken && !candidate.revoked,
      )
      if (share === undefined) return null
      const thread = store.threads.get(share.threadId)
      return thread === undefined ? null : publicProjectionForThread(thread)
    },
    getThreadTurns: async (threadId, sessionId, paginationOpts) => {
      if (store.getThreadTurnsError !== undefined) throw store.getThreadTurnsError
      const thread = store.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId) {
        return { page: [], isDone: true, continueCursor: '' }
      }
      const rows = turnsForThread(threadId)
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor)
      const page = rows.slice(start, start + paginationOpts.numItems)
      return {
        page,
        isDone: start + page.length >= rows.length,
        continueCursor: String(start + page.length),
      }
    },
    getAnswerThreadWithTurns: async (threadId, sessionId, paginationOpts) => {
      const thread = store.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId) return null
      const rows = turnsForThread(threadId)
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor)
      const page = rows.slice(start, start + paginationOpts.numItems)
      return {
        thread: { ...thread, turnCount: turnCountForThread(threadId) },
        turns: {
          page,
          isDone: start + page.length >= rows.length,
          continueCursor: String(start + page.length),
        },
      }
    },
    deleteThread: async (args) => {
      if (store.deleteThreadError !== undefined) throw store.deleteThreadError
      const thread = store.threads.get(args.threadId)
      if (thread === undefined) return { threadId: args.threadId }
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) throw new Error('thread_not_found')
      store.threads.delete(args.threadId)
      store.shares.delete(args.threadId)
      for (const turn of turnsForThread(args.threadId)) store.turns.delete(turn.turnId)
      for (const reservation of store.reservations.values()) {
        if (reservation.threadId === args.threadId) store.reservations.delete(reservation.reservationKey)
      }
      return { threadId: args.threadId }
    },
    getAnswerThread: async (threadId, sessionId) => {
      if (store.getAnswerThreadError !== undefined) throw store.getAnswerThreadError
      const thread = store.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId) return null
      return { ...thread, turnCount: turnCountForThread(threadId) }
    },
    finalizeTurnHarnessRun: async (args) => {
      const reservation = store.reservations.get(args.reservationKey)
      if (reservation === undefined) {
        return { status: 'conflict', reason: 'reservation_not_found', message: 'Answer turn reservation does not exist.' }
      }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return {
          status: 'conflict',
          reason: 'reservation_identity_mismatch',
          message: 'Answer turn reservation identity mismatch.',
        }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return {
          status: 'conflict',
          reason: 'request_digest_mismatch',
          message: 'Answer turn request digest does not match reservation.',
        }
      }
      const thread = store.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return {
          status: 'conflict',
          reason: 'parent_conflict',
          message: 'Answer thread parent is not available for finalization.',
        }
      }
      if (args.entries.some((entry) =>
        entry.sessionId !== args.sessionId
        || entry.runId !== args.turnId
        || entry.turnId !== args.turnId
      )) {
        return {
          status: 'conflict',
          reason: 'entry_identity_mismatch',
          message: 'Finalization journal entries must match the answer turn identity.',
        }
      }
      if (reservation.state === 'stopped') {
        return { status: 'conflict', reason: 'stopped', message: 'Answer turn was stopped.' }
      }
      if (reservation.state !== 'finalized') {
        if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
          return {
            status: 'conflict',
            reason: 'reservation_identity_mismatch',
            message: 'Answer turn generation does not match finalization.',
          }
        }
        if (reservation.leaseOwner !== args.leaseOwner) {
          return {
            status: 'conflict',
            reason: 'reservation_identity_mismatch',
            message: 'Answer turn lease owner does not match finalization.',
          }
        }
        if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
          return {
            status: 'conflict',
            reason: 'reservation_identity_mismatch',
            message: 'Answer turn lease has expired.',
          }
        }
      }
      if (reservation.state === 'finalized') {
        if (reservation.harnessFinalizationDigest !== args.finalizationHash) {
          return { status: 'conflict', reason: 'evidence_conflict', message: 'Answer turn finalization conflict.' }
        }
        return {
          status: 'replayed',
          turnId: args.turnId,
          finalizationHash: args.finalizationHash,
          entriesAccepted: 0,
          entriesReplayed: args.entries.length,
        }
      }
      const turn = store.turns.get(args.turnId)
      if (turn === undefined) {
        return { status: 'conflict', reason: 'turn_not_found', message: 'Answer turn does not exist.' }
      }
      if (turn.snapshotHash !== args.snapshotHash) {
        return { status: 'conflict', reason: 'snapshot_mismatch', message: 'Answer turn snapshot mismatch.' }
      }
      const persistedRow = store.persisted.find(
        (candidate): candidate is PersistedAnswerTurnRow =>
          typeof candidate === 'object'
          && candidate !== null
          && 'turnId' in candidate
          && candidate.turnId === args.turnId,
      )
      if (persistedRow !== undefined) {
        persistedRow.evidenceJson = args.evidenceJson
        persistedRow.status = args.finalStatus
      }
      store.turns.set(args.turnId, { ...turn, evidenceJson: args.evidenceJson, status: args.finalStatus })
      store.reservations.set(args.reservationKey, {
        ...reservation,
        state: 'finalized',
        finalStatus: args.finalStatus,
        harnessFinalizationDigest: args.finalizationHash,
        updatedAt: Date.now(),
      })
      const activeLeafEntryId = args.entries.at(-1)?.entryId
      return {
        status: 'accepted',
        turnId: args.turnId,
        finalizationHash: args.finalizationHash,
        entriesAccepted: args.entries.length,
        entriesReplayed: 0,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    },
  })
}

export function readSessionCookieFromResponse(response: Response): string {
  for (const setCookie of response.headers.getSetCookie()) {
    const session = readCookie(setCookie, 'ae_session')
    if (session !== undefined) return session
  }
  return ''
}

export function sessionCookieHeader(sessionId: string): string {
  return sessionId.length === 0 ? '' : serializeCookie('ae_session', sessionId)
}

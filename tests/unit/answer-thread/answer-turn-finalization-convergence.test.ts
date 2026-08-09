import { afterEach, describe, expect, it } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import {
  failPersistedAnswerTurn,
  persistReservedAnswerTurn,
  reserveAnswerTurn,
  stopAnswerTurn,
} from '@/modules/answer-thread/answer-thread.functions'
import { answerTurnFinalizationDigest } from '@/modules/answer-thread/internal/turn-digests'
import type { AnswerTurnReservationRecord } from '@/modules/answer-thread/answer-thread.schema'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  type AnswerThreadTestStore,
} from '../../helpers/answer-thread-test-port'

const problemJson = JSON.stringify(buildAnswerTurnProblem('answer_turn_persist_failed'))

const resets: (() => void)[] = []

afterEach(() => {
  while (resets.length > 0) resets.pop()?.()
})

describe('answer turn finalization convergence', () => {
  it('turns an answer-persisted pending row into a redacted terminal error and replays it idempotently', async () => {
    const fixture = await persistedFixture()

    const first = await failPersistedAnswerTurn(failureArgs(fixture.reservation, fixture.answerDigest))
    const replay = await failPersistedAnswerTurn(failureArgs(fixture.reservation, fixture.answerDigest))

    expect(first).toMatchObject({ kind: 'failed', turnId: fixture.reservation.turnId })
    expect(replay).toMatchObject({ kind: 'replayed', status: 'error' })
    expect(fixture.store.turns.get(fixture.reservation.turnId)).toMatchObject({
      status: 'error',
      evidenceJson: '{}',
      proseJson: '{}',
      artifactKindsJson: '[]',
      errorProblemJson: problemJson,
    })
    expect(fixture.store.reservations.get(fixture.reservation.reservationKey)).toMatchObject({
      state: 'finalized',
      finalStatus: 'error',
      answerDigest: fixture.answerDigest,
    })
  })

  it('keeps a durable stopped winner when failure convergence races after Stop', async () => {
    const fixture = await persistedFixture()

    await expect(stopAnswerTurn({
      sessionId: 'session-finalization',
      threadId: fixture.reservation.threadId,
      turnId: fixture.reservation.turnId,
    })).resolves.toMatchObject({ kind: 'stopped' })

    await expect(failPersistedAnswerTurn(failureArgs(fixture.reservation, fixture.answerDigest))).resolves.toMatchObject({
      kind: 'stopped',
    })
    expect(fixture.store.turns.get(fixture.reservation.turnId)?.status).toBe('stopped')
    expect(fixture.store.reservations.get(fixture.reservation.reservationKey)?.state).toBe('stopped')
  })

  it('rejects persistence replay when material changes under the same reservation', async () => {
    const fixture = await persistedFixture()
    const changedProseJson = '{"oneLine":"changed"}'
    const changedDigest = answerTurnFinalizationDigest({
      turn: {
        turnId: fixture.reservation.turnId,
        threadId: fixture.reservation.threadId,
        seq: fixture.reservation.seq,
        query: fixture.query,
        intent: 'refine_search',
        evidenceJson: fixture.evidenceJson,
        snapshotHash: fixture.snapshotHash,
        proseJson: changedProseJson,
        artifactKindsJson: fixture.artifactKindsJson,
        status: 'complete',
      },
      toolCalls: [],
    })

    await expect(persistReservedAnswerTurn({
      reservationKey: fixture.reservation.reservationKey,
      requestDigest: fixture.requestDigest,
      sessionId: 'session-finalization',
      threadId: fixture.reservation.threadId,
      turnId: fixture.reservation.turnId,
      turnSeq: fixture.reservation.seq,
      generation: fixture.generation,
      leaseOwner: fixture.leaseOwner,
      answerDigest: changedDigest,
      query: fixture.query,
      intent: 'refine_search',
      evidenceJson: fixture.evidenceJson,
      snapshotHash: fixture.snapshotHash,
      proseJson: changedProseJson,
      artifactKindsJson: fixture.artifactKindsJson,
      toolCalls: [],
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'answer_digest_conflict' })
  })
})

type Fixture = {
  store: AnswerThreadTestStore
  reservation: AnswerTurnReservationRecord
  generation: number
  leaseOwner: string
  answerDigest: string
  requestDigest: string
  query: string
  evidenceJson: string
  snapshotHash: string
  artifactKindsJson: string
}

async function persistedFixture(): Promise<Fixture> {
  const store = createAnswerThreadTestStore()
  store.threads.set('thread-finalization', {
    threadId: 'thread-finalization',
    pseudonymousSessionId: 'session-finalization',
    title: 'finalization test',
    createdAt: 1,
    updatedAt: 1,
  })
  resets.push(installAnswerThreadTestPort(store))
  const generation = 0
  const leaseOwner = 'worker:finalization'
  const leaseExpiresAt = Date.now() + 60_000
  const query = 'finalization test'
  const requestDigest = 'request-finalization'
  const admission = await reserveAnswerTurn({
    sessionId: 'session-finalization',
    threadId: 'thread-finalization',
    query,
    requestDigest,
    reservationKey: 'reservation-finalization',
    title: query,
  })
  if (admission.kind !== 'reserved') throw new Error(`expected reserved fixture, got ${admission.kind}`)
  const reserved = store.reservations.get(admission.reservationKey)
  if (reserved === undefined) throw new Error('expected stored reservation fixture')
  store.reservations.set(admission.reservationKey, {
    ...reserved,
    runGeneration: generation,
    leaseOwner,
    leaseExpiresAt,
  })

  const evidenceJson = '{"providers":[]}'
  const snapshotHash = 'snapshot-finalization'
  const proseJson = '{"oneLine":"stable"}'
  const artifactKindsJson = '[]'
  const answerDigest = answerTurnFinalizationDigest({
    turn: {
      turnId: admission.turnId,
      threadId: admission.threadId,
      seq: admission.turnSeq,
      query,
      intent: 'refine_search',
      evidenceJson,
      snapshotHash,
      proseJson,
      artifactKindsJson,
      status: 'complete',
    },
    toolCalls: [],
  })
  await expect(persistReservedAnswerTurn({
    reservationKey: admission.reservationKey,
    requestDigest,
    sessionId: 'session-finalization',
    threadId: admission.threadId,
    turnId: admission.turnId,
    turnSeq: admission.turnSeq,
    generation,
    leaseOwner,
    answerDigest,
    query,
    intent: 'refine_search',
    evidenceJson,
    snapshotHash,
    proseJson,
    artifactKindsJson,
    toolCalls: [],
  })).resolves.toMatchObject({ kind: 'persisted' })
  return {
    store,
    generation,
    leaseOwner,
    reservation: {
      reservationKey: admission.reservationKey,
      sessionId: 'session-finalization',
      requestedThreadScope: 'thread-finalization',
      requestDigest,
      threadId: admission.threadId,
      turnId: admission.turnId,
      seq: admission.turnSeq,
      query,
      state: 'answer_persisted',
      runGeneration: generation,
      leaseOwner,
      leaseExpiresAt,
      answerDigest,
      createdAt: 1,
      updatedAt: 1,
    },
    answerDigest,
    requestDigest,
    query,
    evidenceJson,
    snapshotHash,
    artifactKindsJson,
  }
}
function failureArgs(reservation: AnswerTurnReservationRecord, answerDigest: string) {
  if (reservation.runGeneration === undefined || reservation.leaseOwner === undefined) {
    throw new Error('expected acquired reservation lease fixture')
  }
  return {
    reservationKey: reservation.reservationKey,
    requestDigest: reservation.requestDigest,
    sessionId: reservation.sessionId,
    threadId: reservation.threadId,
    turnId: reservation.turnId,
    turnSeq: reservation.seq,
    generation: reservation.runGeneration,
    leaseOwner: reservation.leaseOwner,
    answerDigest,
    errorProblemJson: problemJson,
  }
}

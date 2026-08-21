import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  persistTurn,
  reserveTurn,
  restoreSourceWriteEnvAfterEach,
  SOURCE_WRITE_SECRET,
  type AnswerThreadSourceWriteBackend,
  type ReserveAnswerTurnResult,
} from './answer-thread-source-write-harness'

describe('answer thread source-write admission — reserve', () => {
  restoreSourceWriteEnvAfterEach()

  it('red-covers the app/Convex env mismatch before proving durable resume', async () => {
    const backend = convexTest(schema, modules)
    const sessionId = 'session-local-source-write'
    const reservationKey = 'reservation-local-source-write-1'
    const requestDigest = 'digest-local-source-write-1'
    const operationKey = `answer_thread:reserve:${reservationKey}`

    delete process.env.AE_SOURCE_WRITE_SECRET
    await expect(
      reserveTurn(backend, {
        sessionId,
        reservationKey,
        requestDigest,
        operationKey,
        nonce: 'nonce-reserve-mismatch',
      }),
    ).rejects.toThrow('answer_thread_source_write_rejected:missing_source_write_secret')

    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey,
      nonce: 'nonce-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    await assertDurableResume(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey,
      first,
    })
  })

  async function assertDurableResume(
    backend: AnswerThreadSourceWriteBackend,
    input: {
      sessionId: string
      reservationKey: string
      requestDigest: string
      operationKey: string
      first: {
        kind: 'reserved'
        reservationKey: string
        threadId: string
        turnId: string
        turnSeq: number
      }
    },
  ) {
    await persistTurn(backend, {
      reservationKey: input.first.reservationKey,
      requestDigest: input.requestDigest,
      sessionId: input.sessionId,
      threadId: input.first.threadId,
      turnId: input.first.turnId,
      turnSeq: input.first.turnSeq,
      seq: 1,
      operationKey: `${input.operationKey}:persist`,
      nonce: 'nonce-persist-1',
    })

    const resumed = await backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId: input.first.threadId,
      pseudonymousSessionId: input.sessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })
    expect(resumed).toMatchObject({
      thread: {
        threadId: input.first.threadId,
        pseudonymousSessionId: input.sessionId,
        turnCount: 1,
      },
      turns: {
        page: [{ turnId: input.first.turnId, seq: 1, status: 'complete' }],
      },
    })

    const secondReservationKey = `${input.reservationKey}-2`
    const secondRequestDigest = `${input.requestDigest}-2`
    const second = await reserveTurn(backend, {
      threadId: input.first.threadId,
      sessionId: input.sessionId,
      reservationKey: secondReservationKey,
      requestDigest: secondRequestDigest,
      operationKey: `${input.operationKey}:reserve-2`,
      nonce: 'nonce-reserve-2',
    })
    expect(second.kind).toBe('reserved')
    if (second.kind !== 'reserved') throw new Error('expected second reserved answer turn')

    await persistTurn(backend, {
      reservationKey: second.reservationKey,
      requestDigest: secondRequestDigest,
      sessionId: input.sessionId,
      threadId: second.threadId,
      turnId: second.turnId,
      turnSeq: second.turnSeq,
      seq: 2,
      operationKey: `${input.operationKey}:persist-2`,
      nonce: 'nonce-persist-2',
    })

    await expect(backend.query(api.answerThreads.getThreadTurns, {
      threadId: input.first.threadId,
      pseudonymousSessionId: input.sessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({
      page: [
        { turnId: input.first.turnId, seq: 1 },
        { turnId: second.turnId, seq: 2 },
      ],
    })
  }

  it('allocates unique sequences across same-thread reservations and enforces the union turn limit', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const first = await reserveTurn(backend, {
      sessionId: 'session-seq-owner',
      reservationKey: 'reservation-seq-first',
      requestDigest: 'digest-seq-first',
      operationKey: 'answer_thread:reserve:seq-first',
      nonce: 'nonce-seq-first',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected first reservation')

    const concurrent = await Promise.all([
      reserveTurn(backend, {
        threadId: first.threadId,
        sessionId: 'session-seq-owner',
        reservationKey: 'reservation-seq-second',
        requestDigest: 'digest-seq-second',
        operationKey: 'answer_thread:reserve:seq-second',
        nonce: 'nonce-seq-second',
      }),
      reserveTurn(backend, {
        threadId: first.threadId,
        sessionId: 'session-seq-owner',
        reservationKey: 'reservation-seq-third',
        requestDigest: 'digest-seq-third',
        operationKey: 'answer_thread:reserve:seq-third',
        nonce: 'nonce-seq-third',
      }),
    ])
    expect(concurrent.every((result: ReserveAnswerTurnResult) => result.kind === 'reserved')).toBe(true)
    const concurrentSeqs = concurrent.flatMap((result: ReserveAnswerTurnResult) => result.kind === 'reserved' ? [result.turnSeq] : [])
    expect(new Set(concurrentSeqs).size).toBe(2)
    expect(concurrentSeqs.toSorted()).toEqual([2, 3])

    await expect(reserveTurn(backend, {
      sessionId: 'session-seq-owner',
      reservationKey: 'reservation-seq-first',
      requestDigest: 'digest-seq-first',
      operationKey: 'answer_thread:reserve:seq-first:replay',
      nonce: 'nonce-seq-first-replay',
    })).resolves.toMatchObject({
      kind: 'in_progress',
      turnId: first.turnId,
      turnSeq: first.turnSeq,
    })
    await expect(reserveTurn(backend, {
      sessionId: 'session-seq-owner',
      reservationKey: 'reservation-seq-first',
      requestDigest: 'digest-seq-different',
      operationKey: 'answer_thread:reserve:seq-first:conflict',
      nonce: 'nonce-seq-first-conflict',
    })).resolves.toEqual({ kind: 'conflict', reason: 'request_digest_mismatch' })

    for (let seq = 4; seq <= 25; seq += 1) {
      await expect(reserveTurn(backend, {
        threadId: first.threadId,
        sessionId: 'session-seq-owner',
        reservationKey: `reservation-seq-${seq}`,
        requestDigest: `digest-seq-${seq}`,
        operationKey: `answer_thread:reserve:seq-${seq}`,
        nonce: `nonce-seq-${seq}`,
      })).resolves.toMatchObject({ kind: 'reserved', turnSeq: seq })
    }
    await expect(reserveTurn(backend, {
      threadId: first.threadId,
      sessionId: 'session-seq-owner',
      reservationKey: 'reservation-seq-over-limit',
      requestDigest: 'digest-seq-over-limit',
      operationKey: 'answer_thread:reserve:seq-over-limit',
      nonce: 'nonce-seq-over-limit',
    })).resolves.toEqual({ kind: 'refused', reason: 'thread_turn_limit' })
  })
})

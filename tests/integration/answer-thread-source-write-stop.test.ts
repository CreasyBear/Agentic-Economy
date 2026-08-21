import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  admitted,
  finalizationEntry,
  finalizeHarnessRun,
  reserveTurn,
  restoreSourceWriteEnvAfterEach,
  SOURCE_WRITE_SECRET,
} from './answer-thread-source-write-harness'

describe('answer thread source-write admission — stop', () => {
  restoreSourceWriteEnvAfterEach()

  it('conceals a foreign-owner Stop without changing the pending reservation', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const ownerSessionId = 'session-stop-owner'
    const first = await reserveTurn(backend, {
      sessionId: ownerSessionId,
      reservationKey: 'reservation-stop-foreign-owner',
      requestDigest: 'digest-stop-foreign-owner',
      operationKey: 'answer_thread:reserve:stop-foreign-owner',
      nonce: 'nonce-stop-foreign-owner-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    const stopOperationKey = `answer_thread:stop:${first.turnId}:foreign`
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, await admitted({
      sessionId: 'session-stop-foreign',
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: stopOperationKey,
      correlationId: stopOperationKey,
    }, 'nonce-stop-foreign-owner'))).resolves.toEqual({ kind: 'not_found' })

    const rows = await backend.run(async (ctx) => ({
      turn: await ctx.db
        .query('answerTurns')
        .withIndex('by_turnId', (query) => query.eq('turnId', first.turnId))
        .unique(),
      reservation: await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_reservationKey', (query) => query.eq('reservationKey', first.reservationKey))
        .unique(),
    }))
    expect(rows.turn).toBeNull()
    expect(rows.reservation).toMatchObject({
      sessionId: ownerSessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      state: 'reserved',
    })
  })

  it('transitions a reserved turn to stopped and keeps that terminal state', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const sessionId = 'session-stop-reserved-owner'
    const reservationKey = 'reservation-stop-reserved'
    const requestDigest = 'digest-stop-reserved'
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: `answer_thread:reserve:${reservationKey}`,
      nonce: 'nonce-stop-reserved-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    const stopOperationKey = `answer_thread:stop:${first.turnId}:reserved`
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, await admitted({
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: stopOperationKey,
      correlationId: stopOperationKey,
    }, 'nonce-stop-reserved-stop'))).resolves.toEqual({
      kind: 'stopped',
      threadId: first.threadId,
      turnId: first.turnId,
    })
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, await admitted({
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: `${stopOperationKey}:replay`,
      correlationId: `${stopOperationKey}:replay`,
    }, 'nonce-stop-reserved-replay'))).resolves.toEqual({
      kind: 'already_settled',
      threadId: first.threadId,
      turnId: first.turnId,
      status: 'stopped',
    })

    const rows = await backend.run(async (ctx) => ({
      turn: await ctx.db
        .query('answerTurns')
        .withIndex('by_turnId', (query) => query.eq('turnId', first.turnId))
        .unique(),
      reservation: await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_reservationKey', (query) => query.eq('reservationKey', reservationKey))
        .unique(),
    }))
    expect(rows.turn).toBeNull()
  })

  it('lets exactly one durable terminal winner commit in a real Stop-versus-finalize race', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const sessionId = 'session-stop-finalize-race'
    const reservationKey = 'reservation-stop-finalize-race'
    const requestDigest = 'digest-stop-finalize-race'
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: `answer_thread:reserve:${reservationKey}`,
      nonce: 'nonce-stop-finalize-race-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    const stopOperationKey = `answer_thread:stop:${first.turnId}:race`
    const [stopResult, finalizationResult] = await Promise.all([
      backend.mutation(api.answerThreads.stopAnswerTurn, await admitted({
        sessionId,
        threadId: first.threadId,
        turnId: first.turnId,
        operationKey: stopOperationKey,
        correlationId: stopOperationKey,
      }, 'nonce-stop-finalize-race-stop')),
      finalizeHarnessRun(backend, {
        reservationKey,
        requestDigest,
        sessionId,
        threadId: first.threadId,
        turnId: first.turnId,
        turnSeq: first.turnSeq,
        seq: first.turnSeq,
        entries: [finalizationEntry({
          entryId: 'entry-stop-finalize-race',
          sessionId,
          runId: first.turnId,
          turnId: first.turnId,
        })],
      }),
    ])

    const terminalWinners = [
      stopResult.kind === 'stopped' ? 'stop' : null,
      finalizationResult.status === 'accepted' ? 'finalize' : null,
    ].filter((winner): winner is 'stop' | 'finalize' => winner !== null)
    expect(terminalWinners).toHaveLength(1)

    const rows = await backend.run(async (ctx) => ({
      turn: await ctx.db
        .query('answerTurns')
        .withIndex('by_turnId', (query) => query.eq('turnId', first.turnId))
        .unique(),
      reservation: await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_reservationKey', (query) => query.eq('reservationKey', reservationKey))
        .unique(),
    }))
    if (terminalWinners[0] === 'stop') {
      expect(stopResult).toMatchObject({ kind: 'stopped' })
      expect(finalizationResult).toMatchObject({ status: 'conflict', reason: 'stopped' })
      expect(rows.turn).toBeNull()
      expect(rows.reservation).toMatchObject({ state: 'stopped' })
    } else {
      expect(stopResult).toMatchObject({ kind: 'already_settled', status: 'complete' })
      expect(finalizationResult).toMatchObject({ status: 'accepted' })
      expect(rows.turn).toMatchObject({ status: 'complete' })
      expect(rows.reservation).toMatchObject({ state: 'finalized', finalStatus: 'complete' })
    }
  })
})

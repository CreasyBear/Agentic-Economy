import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  finalizationEntry,
  finalizeHarnessRun,
  persistTurn,
  reserveTurn,
  restoreSourceWriteEnvAfterEach,
  SOURCE_WRITE_SECRET,
} from './answer-thread-source-write-harness'

describe('answer thread source-write admission — finalize', () => {
  restoreSourceWriteEnvAfterEach()

  it('rejects harness finalization after its parent thread is deleted', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const sessionId = 'session-finalization-delete-owner'
    const reservationKey = 'reservation-finalization-delete-owner'
    const requestDigest = 'digest-finalization-delete-owner'
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: `answer_thread:reserve:${reservationKey}`,
      nonce: 'nonce-finalization-delete-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    await persistTurn(backend, {
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      seq: first.turnSeq,
      operationKey: `answer_thread:persist:${first.turnId}`,
      nonce: 'nonce-finalization-delete-persist',
      finalize: false,
    })

    await backend.run(async (ctx) => {
      const thread = await ctx.db
        .query('answerThreads')
        .withIndex('by_threadId', (query) => query.eq('threadId', first.threadId))
        .unique()
      if (thread === null) throw new Error('answer thread fixture missing')
      await ctx.db.delete(thread._id)
    })

    await expect(finalizeHarnessRun(backend, {
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      seq: first.turnSeq,
      entries: [finalizationEntry({
        entryId: 'entry-finalization-after-delete',
        sessionId,
        runId: first.turnId,
        turnId: first.turnId,
      })],
    })).resolves.toEqual({
      status: 'conflict',
      reason: 'parent_conflict',
      message: 'Answer thread parent is not available for finalization.',
    })

    const rows = await backend.run(async (ctx) => ({
      thread: await ctx.db
        .query('answerThreads')
        .withIndex('by_threadId', (query) => query.eq('threadId', first.threadId))
        .unique(),
      turn: await ctx.db
        .query('answerTurns')
        .withIndex('by_turnId', (query) => query.eq('turnId', first.turnId))
        .unique(),
      reservation: await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_reservationKey', (query) => query.eq('reservationKey', reservationKey))
        .unique(),
      journal: await ctx.db.query('harnessSessionEntries').collect(),
      sessions: await ctx.db.query('harnessSessions').collect(),
    }))
    expect(rows.thread).toBeNull()
    expect(rows.turn).toBeNull()
    expect(rows.reservation).toMatchObject({ state: 'reserved' })
    expect(rows.reservation?.harnessFinalizationDigest).toBeUndefined()
    expect(rows.journal).toEqual([])
    expect(rows.sessions).toEqual([])
  })

  it('rejects harness entries from another session, run, or turn before any finalization write', async () => {
    const identityCases = [
      { label: 'session', sessionId: 'foreign-finalization-session' },
      { label: 'run', runId: 'foreign-finalization-run' },
      { label: 'turn', turnId: 'foreign-finalization-turn' },
    ] as const

    for (const identityCase of identityCases) {
      const backend = convexTest(schema, modules)
      process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
      const sessionId = `session-finalization-identity-${identityCase.label}`
      const reservationKey = `reservation-finalization-identity-${identityCase.label}`
      const requestDigest = `digest-finalization-identity-${identityCase.label}`
      const first = await reserveTurn(backend, {
        sessionId,
        reservationKey,
        requestDigest,
        operationKey: `answer_thread:reserve:${reservationKey}`,
        nonce: `nonce-finalization-identity-${identityCase.label}-reserve`,
      })
      expect(first.kind).toBe('reserved')
      if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

      await persistTurn(backend, {
        reservationKey,
        requestDigest,
        sessionId,
        threadId: first.threadId,
        turnId: first.turnId,
        turnSeq: first.turnSeq,
        seq: first.turnSeq,
        operationKey: `answer_thread:persist:${first.turnId}`,
        nonce: `nonce-finalization-identity-${identityCase.label}-persist`,
        finalize: false,
      })

      await expect(finalizeHarnessRun(backend, {
        reservationKey,
        requestDigest,
        sessionId,
        threadId: first.threadId,
        turnId: first.turnId,
        turnSeq: first.turnSeq,
        seq: first.turnSeq,
        entries: [finalizationEntry({
          entryId: `entry-finalization-identity-${identityCase.label}`,
          sessionId: 'sessionId' in identityCase ? identityCase.sessionId : sessionId,
          runId: 'runId' in identityCase ? identityCase.runId : first.turnId,
          turnId: 'turnId' in identityCase ? identityCase.turnId : first.turnId,
        })],
      })).resolves.toMatchObject({
        status: 'conflict',
        reason: 'entry_identity_mismatch',
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
        journal: await ctx.db.query('harnessSessionEntries').collect(),
        sessions: await ctx.db.query('harnessSessions').collect(),
      }))
      expect(rows.turn).toBeNull()
      expect(rows.reservation).toMatchObject({ state: 'reserved' })
      expect(rows.reservation?.harnessFinalizationDigest).toBeUndefined()
      expect(rows.journal).toEqual([])
      expect(rows.sessions).toEqual([])
    }
  })

  it('keeps valid harness finalization replay idempotent', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const sessionId = 'session-finalization-replay-owner'
    const reservationKey = 'reservation-finalization-replay-owner'
    const requestDigest = 'digest-finalization-replay-owner'
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: `answer_thread:reserve:${reservationKey}`,
      nonce: 'nonce-finalization-replay-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    await persistTurn(backend, {
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      seq: first.turnSeq,
      operationKey: `answer_thread:persist:${first.turnId}`,
      nonce: 'nonce-finalization-replay-persist',
      finalize: false,
    })
    const entries = [finalizationEntry({
      entryId: 'entry-finalization-replay',
      sessionId,
      runId: first.turnId,
      turnId: first.turnId,
    })]
    const finalization = {
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      seq: first.turnSeq,
      entries,
    } as const

    await expect(finalizeHarnessRun(backend, finalization)).resolves.toMatchObject({
      status: 'accepted',
      entriesAccepted: 1,
      entriesReplayed: 0,
    })
    await expect(finalizeHarnessRun(backend, finalization, 'nonce-finalization-replay')).resolves.toMatchObject({
      status: 'replayed',
      entriesAccepted: 0,
      entriesReplayed: 1,
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
      journal: await ctx.db.query('harnessSessionEntries').collect(),
      sessions: await ctx.db.query('harnessSessions').collect(),
    }))
    expect(rows.turn).toMatchObject({ status: 'complete' })
    expect(rows.reservation).toMatchObject({
      state: 'finalized',
      finalStatus: 'complete',
    })
    expect(rows.journal).toHaveLength(1)
    expect(rows.sessions).toHaveLength(1)
  })
})

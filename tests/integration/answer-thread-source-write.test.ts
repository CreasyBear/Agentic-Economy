import { convexTest, type TestConvex } from 'convex-test'
import type { FunctionReturnType } from 'convex/server'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  answerThreadShareAccessId,
  answerThreadShareVerifier,
  mintAnswerThreadShareToken,
} from '@/modules/answer-thread/internal/share-token'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
} from '@/modules/security/source-write-admission'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { answerTurnFinalizationDigest } from '@/modules/answer-thread/internal/turn-digests'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'
import { convexModules as modules } from '../helpers/convex-fixtures'

const SOURCE_WRITE_SECRET = 'answer-thread-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/answer/turn',
  bodyDigest: sourceWriteBodyDigest(undefined),
}
type OwnedThreadProjection = NonNullable<
  FunctionReturnType<typeof api.answerThreads.getOwnedThreadProjection>
>
type OwnedThreadTurn = OwnedThreadProjection['turns'][number]
type ReserveAnswerTurnResult = FunctionReturnType<typeof api.answerThreads.reserveAnswerTurn>

function currentEvidenceJson(snapshotHash: string): string {
  const draft: FrozenTurnEvidenceDraft = {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '',
    toolCalls: [],
    timings: [],
    workLog: [],
  }
  return JSON.stringify({
    ...draft,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash,
      evidence: draft,
    }),
  })
}


describe('answer thread source-write admission', () => {
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET
  const previousShareSecret = process.env.AE_ANSWER_THREAD_SHARE_SECRET
  const previousShareKeyId = process.env.AE_ANSWER_THREAD_SHARE_KEY_ID

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSecret
    if (previousShareSecret === undefined) delete process.env.AE_ANSWER_THREAD_SHARE_SECRET
    else process.env.AE_ANSWER_THREAD_SHARE_SECRET = previousShareSecret
    if (previousShareKeyId === undefined) delete process.env.AE_ANSWER_THREAD_SHARE_KEY_ID
    else process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = previousShareKeyId
  })

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
    backend: TestConvex<typeof schema>,
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

  it('replays a hard-crash reservation as bounded pending lifecycle state for owner and share reads', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-reserved-reload'
    const sessionId = 'session-reserved-reload'
    const shareSecret = 'answer-thread-share-test-secret-32-characters-min'
    const shareKeyId = 'answer-thread-share-test-v1'
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = shareSecret
    process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = shareKeyId
    const shareToken = mintAnswerThreadShareToken(
      { threadId, generation: 1, keyId: shareKeyId },
      { secret: shareSecret, keyId: shareKeyId },
    )

    await backend.run(async (ctx) => {
      await ctx.db.insert('answerThreads', {
        threadId,
        pseudonymousSessionId: sessionId,
        title: 'reserved reload',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('answerTurnReservations', {
        reservationKey: 'reservation-reserved-reload',
        sessionId,
        requestedThreadScope: threadId,
        requestDigest: 'private-request-digest',
        threadId,
        turnId: 'turn-reserved-reload',
        seq: 1,
        query: 'reload this pending question',
        state: 'reserved',
        createdAt: 2,
        updatedAt: 2,
      })
      await ctx.db.insert('answerThreadShares', {
        threadId,
        accessId: answerThreadShareAccessId(shareToken),
        generation: 1,
        verifier: answerThreadShareVerifier(shareToken, shareSecret),
        keyId: shareKeyId,
        status: 'active',
        createdAt: 2,
      })
    })

    const owner = await backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: sessionId,
    })
    const shared = await backend.query(api.answerThreads.getSharedThreadProjection, { shareToken })
    expect(owner).toMatchObject({
      threadId,
      turns: [{
        turnId: 'turn-reserved-reload',
        seq: 1,
        query: 'reload this pending question',
        status: 'pending',
        workLog: [],
        artifacts: [],
        oneLine: '',
      }],
    })
    expect(shared).toEqual(owner)
    const serialized = JSON.stringify({ owner, shared })
    expect(serialized).not.toContain('private-request-digest')
    expect(serialized).not.toContain(sessionId)
    expect(serialized).not.toContain('answerTurnReservations')

    await expect(backend.query(api.answerThreads.getAnswerThread, {
      threadId,
      pseudonymousSessionId: sessionId,
    })).resolves.toMatchObject({ threadId, turnCount: 1 })
  })

  it('projects a stopped-before-persist reservation without evidence or private fields', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-stopped-reload'
    const sessionId = 'session-stopped-reload'
    const shareSecret = 'answer-thread-share-test-secret-32-characters-min'
    const shareKeyId = 'answer-thread-share-test-v1'
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = shareSecret
    process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = shareKeyId
    const shareToken = mintAnswerThreadShareToken(
      { threadId, generation: 1, keyId: shareKeyId },
      { secret: shareSecret, keyId: shareKeyId },
    )

    await backend.run(async (ctx) => {
      await ctx.db.insert('answerThreads', {
        threadId,
        pseudonymousSessionId: sessionId,
        title: 'stopped reload',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('answerTurnReservations', {
        reservationKey: 'reservation-stopped-reload',
        sessionId,
        requestedThreadScope: threadId,
        requestDigest: 'private-stopped-digest',
        threadId,
        turnId: 'turn-stopped-reload',
        seq: 1,
        query: 'question stopped before persistence',
        state: 'stopped',
        createdAt: 2,
        updatedAt: 3,
      })
      await ctx.db.insert('answerThreadShares', {
        threadId,
        accessId: answerThreadShareAccessId(shareToken),
        generation: 1,
        verifier: answerThreadShareVerifier(shareToken, shareSecret),
        keyId: shareKeyId,
        status: 'active',
        createdAt: 2,
      })
    })

    const owner = await backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: sessionId,
    })
    const shared = await backend.query(api.answerThreads.getSharedThreadProjection, { shareToken })
    expect(owner).toMatchObject({
      threadId,
      turns: [{
        turnId: 'turn-stopped-reload',
        seq: 1,
        query: 'question stopped before persistence',
        status: 'stopped',
        workLog: [],
        artifacts: [],
        oneLine: '',
      }],
    })
    expect(shared).toEqual(owner)
    const serialized = JSON.stringify({ owner, shared })
    expect(serialized).not.toContain('private-stopped-digest')
    expect(serialized).not.toContain(sessionId)
    expect(serialized).not.toContain('evidenceJson')
    expect(serialized).not.toContain('proseJson')
    expect(serialized).not.toContain('toolCalls')
  })

  it('keeps persisted turns ahead of duplicate reservations while ordering lifecycle rows by seq', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-projection-precedence'
    const sessionId = 'session-projection-precedence'

    await backend.run(async (ctx) => {
      await ctx.db.insert('answerThreads', {
        threadId,
        pseudonymousSessionId: sessionId,
        title: 'projection precedence',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('answerTurns', {
        turnId: 'turn-persisted-precedence',
        threadId,
        seq: 1,
        query: 'persisted answer',
        intent: 'refine_search',
        evidenceJson: currentEvidenceJson('snapshot-persisted-precedence'),
        snapshotHash: 'snapshot-persisted-precedence',
        proseJson: JSON.stringify({ oneLine: 'Persisted answer', summary: '', nextStep: '' }),
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 2,
      })
      await ctx.db.insert('answerTurnReservations', {
        reservationKey: 'reservation-duplicate-precedence',
        sessionId,
        requestedThreadScope: threadId,
        requestDigest: 'private-duplicate-digest',
        threadId,
        turnId: 'turn-persisted-precedence',
        seq: 1,
        query: 'duplicate reservation query',
        state: 'stopped',
        createdAt: 3,
        updatedAt: 3,
      })
      await ctx.db.insert('answerTurnReservations', {
        reservationKey: 'reservation-pending-precedence',
        sessionId,
        requestedThreadScope: threadId,
        requestDigest: 'private-pending-digest',
        threadId,
        turnId: 'turn-pending-precedence',
        seq: 2,
        query: 'pending lifecycle query',
        state: 'reserved',
        createdAt: 4,
        updatedAt: 4,
      })
      await ctx.db.insert('answerTurnReservations', {
        reservationKey: 'reservation-stopped-precedence',
        sessionId,
        requestedThreadScope: threadId,
        requestDigest: 'private-stopped-digest',
        threadId,
        turnId: 'turn-stopped-precedence',
        seq: 3,
        query: 'stopped lifecycle query',
        state: 'stopped',
        createdAt: 5,
        updatedAt: 5,
      })
    })

    const projection = await backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: sessionId,
    })
    expect(projection?.turns.map((turn: OwnedThreadTurn) => ({
      turnId: turn.turnId,
      seq: turn.seq,
      status: turn.status,
      query: turn.query,
    }))).toEqual([
      { turnId: 'turn-persisted-precedence', seq: 1, status: 'complete', query: 'persisted answer' },
      { turnId: 'turn-pending-precedence', seq: 2, status: 'pending', query: 'pending lifecycle query' },
      { turnId: 'turn-stopped-precedence', seq: 3, status: 'stopped', query: 'stopped lifecycle query' },
    ])
    expect(JSON.stringify(projection)).not.toContain('private-')
    await expect(backend.query(api.answerThreads.getAnswerThread, {
      threadId,
      pseudonymousSessionId: sessionId,
    })).resolves.toMatchObject({ turnCount: 3 })
  })

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
      kind: 'replayed',
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
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, {
      sessionId: 'session-stop-foreign',
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: stopOperationKey,
      correlationId: stopOperationKey,
      sourceWrite: createAdmission(stopOperationKey, stopOperationKey, 'nonce-stop-foreign-owner'),
    })).resolves.toEqual({ kind: 'not_found' })

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

  it('transitions an answer-persisted turn to stopped and keeps that terminal state', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const sessionId = 'session-stop-persisted-owner'
    const reservationKey = 'reservation-stop-persisted'
    const requestDigest = 'digest-stop-persisted'
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: `answer_thread:reserve:${reservationKey}`,
      nonce: 'nonce-stop-persisted-reserve',
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
      nonce: 'nonce-stop-persisted-persist',
      finalize: false,
    })

    const stopOperationKey = `answer_thread:stop:${first.turnId}:persisted`
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, {
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: stopOperationKey,
      correlationId: stopOperationKey,
      sourceWrite: createAdmission(stopOperationKey, stopOperationKey, 'nonce-stop-persisted-stop'),
    })).resolves.toEqual({
      kind: 'stopped',
      threadId: first.threadId,
      turnId: first.turnId,
    })
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, {
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: `${stopOperationKey}:replay`,
      correlationId: `${stopOperationKey}:replay`,
      sourceWrite: createAdmission(`${stopOperationKey}:replay`, `${stopOperationKey}:replay`, 'nonce-stop-persisted-replay'),
    })).resolves.toEqual({
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
    expect(rows.turn).toMatchObject({ status: 'stopped', threadId: first.threadId, seq: first.turnSeq })
    expect(rows.reservation).toMatchObject({ state: 'stopped', threadId: first.threadId, seq: first.turnSeq })
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

    await persistTurn(backend, {
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      seq: first.turnSeq,
      operationKey: `answer_thread:persist:${first.turnId}`,
      nonce: 'nonce-stop-finalize-race-persist',
      finalize: false,
    })

    const stopOperationKey = `answer_thread:stop:${first.turnId}:race`
    const [stopResult, finalizationResult] = await Promise.all([
      backend.mutation(api.answerThreads.stopAnswerTurn, {
        sessionId,
        threadId: first.threadId,
        turnId: first.turnId,
        operationKey: stopOperationKey,
        correlationId: stopOperationKey,
        sourceWrite: createAdmission(stopOperationKey, stopOperationKey, 'nonce-stop-finalize-race-stop'),
      }),
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
      expect(rows.turn).toMatchObject({ status: 'stopped' })
      expect(rows.reservation).toMatchObject({ state: 'stopped' })
    } else {
      expect(stopResult).toMatchObject({ kind: 'already_settled', status: 'complete' })
      expect(finalizationResult).toMatchObject({ status: 'accepted' })
      expect(rows.turn).toMatchObject({ status: 'complete' })
      expect(rows.reservation).toMatchObject({ state: 'finalized', finalStatus: 'complete' })
    }
  })


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
    expect(rows.turn).toMatchObject({
      status: 'pending',
      evidenceJson: currentEvidenceJson(`snapshot-${first.turnSeq}`),
    })
    expect(rows.reservation).toMatchObject({ state: 'answer_persisted' })
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
      expect(rows.turn).toMatchObject({
        status: 'pending',
        evidenceJson: currentEvidenceJson(`snapshot-${first.turnSeq}`),
      })
      expect(rows.reservation).toMatchObject({ state: 'answer_persisted' })
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

  it('denies foreign sessions across raw thread, turn, and tool-call reads', async () => {
    const backend = convexTest(schema, modules)
    let threadId = ''
    let turnId = ''
    const ownerSessionId = 'session-raw-read-owner'
    const foreignSessionId = 'session-raw-read-foreign'
    const reservationKey = 'reservation-raw-read-ownership'
    const requestDigest = 'digest-raw-read-ownership'
    const operationKey = `answer_thread:reserve:${reservationKey}`

    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const first = await reserveTurn(backend, {
      sessionId: ownerSessionId,
      reservationKey,
      requestDigest,
      operationKey,
      nonce: 'nonce-raw-read-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')
    threadId = first.threadId
    turnId = first.turnId

    await persistTurn(backend, {
      reservationKey,
      requestDigest,
      sessionId: ownerSessionId,
      threadId,
      turnId,
      turnSeq: first.turnSeq,
      seq: 1,
      operationKey: `answer_thread:persist:${turnId}`,
      nonce: 'nonce-raw-read-persist',
      toolCalls: [{
        toolCallId: 'tool-call-raw-read-ownership',
        seq: 1,
        toolId: 'registry.search',
        inputJson: '{"query":"raw read ownership"}',
        resultSummaryJson: '{"count":1}',
        resultJson: '{"items":["raw-read-ownership"]}',
        resultHash: 'hash-tool-call-raw-read-ownership',
        status: 'complete',
      }],
    })
    await expect(backend.query(api.answerThreads.getAnswerThread, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
    })).resolves.toMatchObject({ threadId, turnCount: 1 })
    await expect(backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({ thread: { threadId }, turns: { page: [{ turnId }] } })
    await expect(backend.query(api.answerThreads.getThreadTurns, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({ page: [{ turnId }] })
    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId,
      pseudonymousSessionId: ownerSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({ page: [{ toolCallId: 'tool-call-raw-read-ownership' }] })

    await expect(backend.query(api.answerThreads.getAnswerThread, {
      threadId,
      pseudonymousSessionId: foreignSessionId,
    })).resolves.toBeNull()
    await expect(backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId,
      pseudonymousSessionId: foreignSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toBeNull()
    await expect(backend.query(api.answerThreads.getThreadTurns, {
      threadId,
      pseudonymousSessionId: foreignSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toEqual({ page: [], isDone: true, continueCursor: '' })
    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId,
      pseudonymousSessionId: foreignSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toEqual({ page: [], isDone: true, continueCursor: '' })

  })
  it('refuses legacy tool-call rows without result JSON instead of pairing an unverifiable hash', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-legacy-tool-result'
    const turnId = 'turn-legacy-tool-result'
    const sessionId = 'session-legacy-tool-result'
    const legacySummary = '{"slugs":["legacy-plumber"],"count":1}'
    const currentResult = '{"kind":"ok","items":[{"slug":"current-plumber"}]}'

    await backend.run(async (ctx) => {
      await ctx.db.insert('answerThreads', {
        threadId,
        pseudonymousSessionId: sessionId,
        title: 'legacy tool result',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('answerTurns', {
        turnId,
        threadId,
        seq: 1,
        query: 'legacy tool result',
        intent: 'refine_search',
        evidenceJson: '{}',
        snapshotHash: 'snapshot-legacy-tool-result',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 1,
      })
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-legacy-result',
        turnId,
        seq: 1,
        toolId: 'registry.search',
        inputJson: '{"query":"legacy plumber"}',
        resultSummaryJson: legacySummary,
        resultHash: 'hash-legacy-result',
        status: 'complete',
        createdAt: 1,
      })
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-current-result',
        turnId,
        seq: 2,
        toolId: 'registry.search',
        inputJson: '{"query":"current plumber"}',
        resultSummaryJson: '{"slugs":["current-plumber"],"count":1}',
        resultJson: currentResult,
        resultHash: 'hash-current-result',
        status: 'complete',
        createdAt: 1,
      })
    })

    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId,
      pseudonymousSessionId: sessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).rejects.toThrow('answer_tool_result_missing')
  })

  it('rejects malformed result payloads instead of admitting broad legacy shapes', async () => {
    const backend = convexTest(schema, modules)

    await expect(backend.run(async (ctx) => {
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-malformed-result',
        turnId: 'turn-malformed-result',
        seq: 1,
        toolId: 'registry.search',
        inputJson: '{}',
        resultSummaryJson: '{}',
        resultJson: 42 as never,
        resultHash: 'hash-malformed-result',
        status: 'complete',
        createdAt: 1,
      })
    })).rejects.toThrow('Expected `string`')
  })
})

async function reserveTurn(
  backend: TestConvex<typeof schema>,
  input: {
    threadId?: string
    sessionId: string
    reservationKey: string
    requestDigest: string
    operationKey: string
    nonce: string
  },
): Promise<ReserveAnswerTurnResult> {
  return backend.mutation(api.answerThreads.reserveAnswerTurn, {
    sessionId: input.sessionId,
    requestedThreadScope: input.threadId ?? 'new',
    query: `local source-write query ${input.reservationKey}`,
    requestDigest: input.requestDigest,
    reservationKey: input.reservationKey,
    title: 'local source-write repro',
    operationKey: input.operationKey,
    correlationId: input.operationKey,
    sourceWrite: createAdmission(input.operationKey, input.operationKey, input.nonce),
  })
}

async function persistTurn(
  backend: TestConvex<typeof schema>,
  input: {
    reservationKey: string
    requestDigest: string
    sessionId: string
    threadId: string
    turnId: string
    turnSeq: number
    seq: number
    operationKey: string
    nonce: string
    toolCalls?: readonly {
      toolCallId: string
      seq: number
      toolId: 'registry.search'
      inputJson: string
      resultSummaryJson: string
      resultJson: string
      resultHash: string
      status: 'complete'
      createdAt?: number
    }[]
    finalize?: boolean
  },
) {
  const snapshotHash = `snapshot-${input.seq}`
  const evidenceJson = currentEvidenceJson(snapshotHash)
  const query = `local source-write query ${input.reservationKey}`
  const proseJson = '{}'
  const artifactKindsJson = '[]'
  const createdAt = 1
  const toolCalls = input.toolCalls?.map((call) => ({ ...call, createdAt: call.createdAt ?? createdAt })) ?? []
  const answerDigest = answerTurnFinalizationDigest({
    turn: {
      turnId: input.turnId,
      threadId: input.threadId,
      seq: input.turnSeq,
      query,
      intent: 'refine_search',
      evidenceJson,
      snapshotHash,
      proseJson,
      artifactKindsJson,
      status: 'complete',
      createdAt,
    },
    toolCalls,
  })
  await expect(backend.mutation(api.answerThreads.persistReservedAnswerTurn, {
    reservationKey: input.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
    createdAt,
    answerDigest,
    intent: 'refine_search',
    evidenceJson,
    snapshotHash,
    proseJson,
    artifactKindsJson,
    toolCalls,
    operationKey: input.operationKey,
    correlationId: input.operationKey,
    sourceWrite: createAdmission(input.operationKey, input.operationKey, input.nonce),
  })).resolves.toMatchObject({
    kind: 'persisted',
    reservationKey: input.reservationKey,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
  })

  if (input.finalize === false) return

  const finalizationOperationKey = `harness_session:finalize:${input.turnId}`
  await expect(backend.mutation(api.harnessSessions.finalizeAnswerTurnHarnessRun, {
    reservationKey: input.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
    finalStatus: 'complete',
    snapshotHash,
    evidenceJson,
    finalizationHash: `finalization-${input.turnId}`,
    operationKey: finalizationOperationKey,
    correlationId: finalizationOperationKey,
    sourceWrite: createAdmission(
      finalizationOperationKey,
      finalizationOperationKey,
      `${input.nonce}-finalize`,
      'harness_session',
    ),
    entries: [],
  })).resolves.toMatchObject({
    status: 'accepted',
    turnId: input.turnId,
  })
}

function finalizationEntry(input: {
  entryId: string
  sessionId: string
  runId: string
  turnId: string
}): AppendHarnessSessionEntrySourceInput {
  return {
    ownerKey: `owner:${input.sessionId}`,
    entryId: input.entryId,
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId,
    kind: 'turn.completed',
    createdAt: 1,
    payloadJson: '{}',
  }
}

async function finalizeHarnessRun(
  backend: TestConvex<typeof schema>,
  input: {
    reservationKey: string
    requestDigest: string
    sessionId: string
    threadId: string
    turnId: string
    turnSeq: number
    seq: number
    entries: readonly AppendHarnessSessionEntrySourceInput[]
  },
  nonce = `${input.turnId}-finalize`,
) {
  const operationKey = `harness_session:finalize:${input.turnId}`
  return backend.mutation(api.harnessSessions.finalizeAnswerTurnHarnessRun, {
    reservationKey: input.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
    finalStatus: 'complete',
    snapshotHash: `snapshot-${input.seq}`,
    evidenceJson: currentEvidenceJson(`snapshot-${input.seq}`),
    finalizationHash: `finalization-${input.turnId}`,
    operationKey,
    correlationId: operationKey,
    sourceWrite: createAdmission(
      operationKey,
      operationKey,
      nonce,
      'harness_session',
    ),
    entries: [...input.entries],
  })
}

function createAdmission(
  operationKey: string,
  correlationId: string,
  nonce: string,
  scope: 'answer_thread' | 'harness_session' = 'answer_thread',
) {
  return createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: SOURCE_REQUEST,
    scope,
    operationKey,
    correlationId,
    nonce,
  })
}

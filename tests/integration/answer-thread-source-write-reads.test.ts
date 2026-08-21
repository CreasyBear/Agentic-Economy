import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  answerThreadShareAccessId,
  answerThreadShareVerifier,
  mintAnswerThreadShareToken,
} from '@/modules/answer-thread/internal/share-token'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  currentEvidenceJson,
  decodeThreadProjection,
  persistTurn,
  reserveTurn,
  restoreSourceWriteEnvAfterEach,
  SOURCE_WRITE_SECRET,
  type OwnedThreadTurn,
} from './answer-thread-source-write-harness'

describe('answer thread source-write admission — reads', () => {
  restoreSourceWriteEnvAfterEach()

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
        generation: 0,
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

    const owner = decodeThreadProjection(await backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: sessionId,
    }))
    const shared = decodeThreadProjection(
      await backend.query(api.answerThreads.getSharedThreadProjection, { shareToken }),
    )
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
        generation: 0,
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

    const owner = decodeThreadProjection(await backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: sessionId,
    }))
    const shared = decodeThreadProjection(
      await backend.query(api.answerThreads.getSharedThreadProjection, { shareToken }),
    )
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
        generation: 0,
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
        generation: 0,
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
        generation: 0,
        createdAt: 5,
        updatedAt: 5,
      })
    })

    const projection = decodeThreadProjection(await backend.query(api.answerThreads.getOwnedThreadProjection, {
      threadId,
      pseudonymousSessionId: sessionId,
    }))
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

import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
} from '@/modules/security/source-write-admission'

const SOURCE_WRITE_SECRET = 'answer-thread-delete-race-source-write-secret'
const SHARE_SECRET = 'answer-thread-delete-race-share-secret-32-characters'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/answer/turn',
  bodyDigest: sourceWriteBodyDigest(undefined),
}

describe('answer thread deletion authority transition', () => {
  const previousSourceSecret = process.env.AE_SOURCE_WRITE_SECRET
  const previousShareSecret = process.env.AE_ANSWER_THREAD_SHARE_SECRET

  afterEach(() => {
    vi.useRealTimers()
    if (previousSourceSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSourceSecret
    if (previousShareSecret === undefined) delete process.env.AE_ANSWER_THREAD_SHARE_SECRET
    else process.env.AE_ANSWER_THREAD_SHARE_SECRET = previousShareSecret
  })

  it('removes authority before continuation so issue, replay, and Stop cannot mutate a deleted thread', async () => {
    vi.useFakeTimers()
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    process.env.AE_ANSWER_THREAD_SHARE_SECRET = SHARE_SECRET

    const backend = convexTest(schema, modules)
    const sessionId = 'session-delete-race-owner'
    const reservationKey = 'reservation-delete-race-owner'
    const requestDigest = 'digest-delete-race-owner'
    const threadScope = 'new'
    const reserveOperationKey = `answer_thread:reserve:${reservationKey}`
    const first = await backend.mutation(api.answerThreads.reserveAnswerTurn, {
      sessionId,
      requestedThreadScope: threadScope,
      query: 'delete race query',
      requestDigest,
      reservationKey,
      title: 'delete race query',
      operationKey: reserveOperationKey,
      correlationId: reserveOperationKey,
      sourceWrite: admission(reserveOperationKey, 'nonce-delete-race-reserve'),
    })
    expect(first).toMatchObject({ kind: 'reserved', reservationKey })
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    const shareOperationKey = `answer_thread:share:issue:${first.threadId}`
    const issued = await backend.mutation(api.answerThreads.issueAnswerThreadShare, {
      threadId: first.threadId,
      pseudonymousSessionId: sessionId,
      operationKey: shareOperationKey,
      correlationId: shareOperationKey,
      sourceWrite: admission(shareOperationKey, 'nonce-delete-race-share'),
    })

    await backend.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert('answerTurnReservations', {
          reservationKey: `reservation-delete-race-child-${index}`,
          sessionId,
          requestedThreadScope: first.threadId,
          requestDigest: `digest-delete-race-child-${index}`,
          threadId: first.threadId,
          turnId: `turn-delete-race-child-${index}`,
          seq: -(index + 1),
          query: `delete race child ${index}`,
          state: 'reserved',
          createdAt: index + 1,
          updatedAt: index + 1,
        })
      }
    })

    const deleteOperationKey = `answer_thread:delete:${first.threadId}`
    await expect(backend.mutation(api.answerThreads.deleteAnswerThread, {
      threadId: first.threadId,
      pseudonymousSessionId: sessionId,
      operationKey: deleteOperationKey,
      correlationId: deleteOperationKey,
      sourceWrite: admission(deleteOperationKey, 'nonce-delete-race-delete'),
    })).resolves.toEqual({ threadId: first.threadId })

    const afterDelete = await backend.run(async (ctx) => ({
      thread: await ctx.db
        .query('answerThreads')
        .withIndex('by_threadId', (query) => query.eq('threadId', first.threadId))
        .unique(),
      shares: await ctx.db
        .query('answerThreadShares')
        .withIndex('by_threadId', (query) => query.eq('threadId', first.threadId))
        .collect(),
      reservations: await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_thread_seq', (query) => query.eq('threadId', first.threadId))
        .collect(),
    }))
    expect(afterDelete.thread).toBeNull()
    expect(afterDelete.shares).toEqual([])
    expect(afterDelete.reservations).toHaveLength(1)

    const issueAfterDeleteKey = `answer_thread:share:issue-after-delete:${first.threadId}`
    await expect(backend.mutation(api.answerThreads.issueAnswerThreadShare, {
      threadId: first.threadId,
      pseudonymousSessionId: sessionId,
      operationKey: issueAfterDeleteKey,
      correlationId: issueAfterDeleteKey,
      sourceWrite: admission(issueAfterDeleteKey, 'nonce-delete-race-issue-after-delete'),
    })).rejects.toThrow('thread_not_found')

    const replayAfterDeleteKey = `${reservationKey}:replay-after-delete`
    await expect(backend.mutation(api.answerThreads.reserveAnswerTurn, {
      sessionId,
      requestedThreadScope: threadScope,
      query: 'delete race query',
      requestDigest,
      reservationKey,
      title: 'delete race query',
      operationKey: replayAfterDeleteKey,
      correlationId: replayAfterDeleteKey,
      sourceWrite: admission(replayAfterDeleteKey, 'nonce-delete-race-replay'),
    })).resolves.toEqual({ kind: 'refused', reason: 'thread_not_found' })

    const stopOperationKey = `answer_thread:stop:${first.turnId}`
    await expect(backend.mutation(api.answerThreads.stopAnswerTurn, {
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      operationKey: stopOperationKey,
      correlationId: stopOperationKey,
      sourceWrite: admission(stopOperationKey, 'nonce-delete-race-stop'),
    })).resolves.toEqual({ kind: 'not_found' })

    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })).resolves.toBeNull()

    await backend.finishAllScheduledFunctions(() => vi.runAllTimers())

    const afterCleanup = await backend.run(async (ctx) => ({
      shares: await ctx.db
        .query('answerThreadShares')
        .withIndex('by_threadId', (query) => query.eq('threadId', first.threadId))
        .collect(),
      turns: await ctx.db
        .query('answerTurns')
        .withIndex('by_thread_seq', (query) => query.eq('threadId', first.threadId))
        .collect(),
      reservations: await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_thread_seq', (query) => query.eq('threadId', first.threadId))
        .collect(),
    }))
    expect(afterCleanup).toEqual({ shares: [], turns: [], reservations: [] })
    await expect(backend.query(api.answerThreads.getSharedThreadProjection, {
      shareToken: issued.shareToken,
    })).resolves.toBeNull()
  })
})

function admission(operationKey: string, nonce: string) {
  return createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: SOURCE_REQUEST,
    scope: 'answer_thread',
    operationKey,
    correlationId: operationKey,
    nonce,
  })
}

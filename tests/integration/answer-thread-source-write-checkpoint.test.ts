import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import type { AnswerTurnCheckpoint } from '@/modules/answer-thread/answer-thread.schema'
import { serializeAnswerTurnCheckpoint } from '@/modules/answer-thread/internal/answer-turn-checkpoint'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  admitted,
  reserveTurn,
  restoreSourceWriteEnvAfterEach,
  SOURCE_WRITE_SECRET,
} from './answer-thread-source-write-harness'

describe('answer thread source-write admission — checkpoint', () => {
  restoreSourceWriteEnvAfterEach()

  it('renews a fenced lease and rewrites its checkpoint generation on takeover', async () => {
    const backend = convexTest(schema, modules)
    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const sessionId = 'session-lease-generation'
    const reservationKey = 'reservation-lease-generation'
    const requestDigest = 'digest-lease-generation'
    const first = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: 'answer_thread:reserve:lease-generation',
      nonce: 'nonce-lease-generation-reserve',
    })
    expect(first.kind).toBe('reserved')
    if (first.kind !== 'reserved') throw new Error('expected reserved answer turn')

    const checkpoint: AnswerTurnCheckpoint = {
      schemaVersion: 1,
      reservationKey,
      requestDigest,
      generation: first.generation,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      stepOrdinal: 1,
      route: 'tool_search',
      intent: 'refine_search',
      query: `local source-write query ${reservationKey}`,
      priorTurnCount: 0,
      priorProviders: [],
      priorAllowedSlugs: [],
      toolCalls: [],
      toolCallDigests: [],
      modelRequests: [],
      replayMessagesJson: '[]',
    }
    const serialized = serializeAnswerTurnCheckpoint(checkpoint)
    if (serialized === null) throw new Error('expected valid checkpoint fixture')
    await expect(backend.mutation(api.answerThreads.persistAnswerTurnCheckpoint, await admitted({
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      generation: first.generation,
      checkpointStep: checkpoint.stepOrdinal,
      checkpointJson: serialized.checkpointJson,
      checkpointDigest: serialized.checkpointDigest,
      operationKey: 'answer_thread:checkpoint:lease-generation',
      correlationId: 'answer_thread:checkpoint:lease-generation',
    }, 'nonce-lease-generation-checkpoint'))).resolves.toMatchObject({
      kind: 'persisted',
      generation: 0,
    })

    const checkpointReadOperationKey = 'answer_thread:checkpoint:read:lease-generation'
    await expect(backend.query(api.answerThreads.readAnswerTurnCheckpoint, await admitted({
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      generation: first.generation,
      operationKey: checkpointReadOperationKey,
      correlationId: checkpointReadOperationKey,
    }, 'nonce-lease-generation-checkpoint-read'))).resolves.toMatchObject({
      kind: 'checkpoint',
      checkpointDigest: serialized.checkpointDigest,
      checkpointStep: checkpoint.stepOrdinal,
    })

    const renewed = await backend.mutation(api.answerThreads.renewAnswerTurnLease, await admitted({
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      generation: first.generation,
      operationKey: 'answer_thread:lease:lease-generation:0',
      correlationId: 'answer_thread:lease:lease-generation:0',
    }, 'nonce-lease-generation-renew'))
    expect(renewed).toMatchObject({ kind: 'renewed', generation: 0 })

    await backend.run(async (ctx) => {
      const reservation = await ctx.db
        .query('answerTurnReservations')
        .withIndex('by_reservationKey', (query) => query.eq('reservationKey', reservationKey))
        .unique()
      if (reservation === null) throw new Error('expected reservation')
      await ctx.db.patch(reservation._id, { updatedAt: 0 })
    })
    const takeover = await reserveTurn(backend, {
      sessionId,
      reservationKey,
      requestDigest,
      operationKey: 'answer_thread:reserve:lease-generation:takeover',
      nonce: 'nonce-lease-generation-takeover',
    })
    expect(takeover).toMatchObject({
      kind: 'reserved',
      generation: 1,
      threadId: first.threadId,
      turnId: first.turnId,
    })

    const row = await backend.run(async (ctx) => ctx.db
      .query('answerTurnReservations')
      .withIndex('by_reservationKey', (query) => query.eq('reservationKey', reservationKey))
      .unique())
    expect(row).toMatchObject({
      generation: 1,
      checkpointGeneration: 1,
      checkpointStep: 1,
    })
    expect(JSON.parse(row?.checkpointJson ?? '{}')).toMatchObject({ generation: 1 })

    await expect(backend.mutation(api.answerThreads.renewAnswerTurnLease, await admitted({
      reservationKey,
      requestDigest,
      sessionId,
      threadId: first.threadId,
      turnId: first.turnId,
      turnSeq: first.turnSeq,
      generation: 0,
      operationKey: 'answer_thread:lease:lease-generation:stale',
      correlationId: 'answer_thread:lease:lease-generation:stale',
    }, 'nonce-lease-generation-stale'))).resolves.toEqual({
      kind: 'conflict',
      reason: 'generation_mismatch',
    })
  })
})

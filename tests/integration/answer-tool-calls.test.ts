import { afterEach, describe, expect, it } from 'vitest'

import {
  buildPublicThreadProjection,
  type AnswerThreadRecord,
} from '@/modules/answer-thread/public'
import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import {
  finalizeReservedAnswerTurnFromRequest,
  reserveAnswerTurn,
} from '@/modules/answer-thread/answer-thread.functions'
import { createAnswerThreadTestStore, installAnswerThreadTestPort } from '../helpers/answer-thread-test-port'
import {
  buildAnswerRunReport,
  type AnswerToolCallRecord,
  type FrozenTurnEvidenceDraft,
} from '@/modules/answer-thread/harness'
import { buildHarnessRunReport } from '@/modules/harness/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { answerTurnFinalizationDigest } from '@/modules/answer-thread/internal/turn-digests'

describe('answerToolCalls persistence', () => {
  let resetThreadPort: () => void

  afterEach(() => {
    resetThreadPort()
  })

  it('buffers tool-call records in memory and persists them with the turn', async () => {
    const store = createAnswerThreadTestStore()
    const threadId = 'thread-tool-1'
    const turnId = 'turn-tool-1'
    store.threads.set(threadId, {
      threadId,
      pseudonymousSessionId: 'session-1',
      title: 'after hours plumber Preston',
      createdAt: 1_000,
      updatedAt: 1_000,
    })
    resetThreadPort = installAnswerThreadTestPort(store)
    const buffered: AnswerToolCallRecord[] = [
      buildToolCall('tc-1', turnId, 1, 'registry.search', ['parramatta-emergency-plumbing'], 1),
      buildToolCall('tc-2', turnId, 2, 'registry.detail', ['parramatta-emergency-plumbing'], 1),
    ]
    const reservation = await reserveAnswerTurn({
      threadId,
      sessionId: 'session-1',
      query: 'after hours plumber Preston',
      requestDigest: 'digest-tool-1',
      reservationKey: 'reservation-tool-1',
      title: 'after hours plumber Preston',
    })
    if (reservation.kind !== 'reserved') {
      throw new Error(`expected reserved turn, got ${reservation.kind}`)
    }
    const toolCallInputs = buffered.map((record) => ({
      toolCallId: record.toolCallId,
      seq: record.seq,
      toolId: record.toolId,
      inputJson: record.inputJson,
      resultSummaryJson: record.resultSummaryJson,
      resultJson: record.resultJson,
      resultHash: record.resultHash,
      status: record.status,
      createdAt: record.createdAt,
    }))
    const evidenceJson = JSON.stringify(currentEvidence({ toolCalls: buffered }))
    const proseJson = JSON.stringify({ oneLine: 'Honest copy', summary: 'Summary', nextStep: 'Next' })
    const answerDigest = answerTurnFinalizationDigest({
      expectedGeneration: reservation.generation,
      turn: {
        turnId: reservation.turnId,
        threadId: reservation.threadId,
        seq: reservation.turnSeq,
        query: 'after hours plumber Preston',
        intent: 'refine_search',
        evidenceJson,
        snapshotHash: 'hash-1',
        proseJson,
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 1_500,
      },
      toolCalls: toolCallInputs,
    })

    const finalized = await finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), {
      reservationKey: reservation.reservationKey,
      requestDigest: 'digest-tool-1',
      sessionId: 'session-1',
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      turnSeq: reservation.turnSeq,
      expectedGeneration: reservation.generation,
      createdAt: 1_500,
      answerDigest,
      query: 'after hours plumber Preston',
      intent: 'refine_search',
      finalStatus: 'complete',
      evidenceJson,
      snapshotHash: 'hash-1',
      proseJson,
      artifactKindsJson: '[]',
      finalizationHash: answerDigest,
      toolCalls: toolCallInputs,
      entries: [],
    })
    expect(finalized.status).toBe('accepted')
    expect(store.persisted).toHaveLength(1)
    expect(store.persisted[0]).toMatchObject({
      turnId: reservation.turnId,
      toolCalls: toolCallInputs,
    })
  })

  it('keeps tool-call evidence out of the public thread projection', async () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-share-1',
      pseudonymousSessionId: 'session-1',
      title: 'after hours plumber Preston',
            createdAt: 1_000,
      updatedAt: 2_000,
    }
    const turn: AnswerTurnRecord = {
      turnId: 'turn-share-1',
      threadId: 'thread-share-1',
      seq: 1,
      query: 'after hours plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify(currentEvidence({
        toolCalls: [buildToolCall('tc-1', 'turn-share-1', 1, 'registry.search', [], 0)],
        harnessRun: buildHarnessRunReport({
          availableTools: ['registry.search'],
          tools: [{ toolId: 'registry.search', status: 'ok', durationMs: 0 }],
        }),
      })),
      snapshotHash: 'hash-1',
      proseJson: JSON.stringify({ oneLine: 'Honest copy', summary: 'Summary', nextStep: 'Next' }),
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 1_500,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const serialized = JSON.stringify(projection)

    // Artifacts + query text only — no raw prompts, gate logs, or tool traces.
    expect(serialized).not.toMatch(/toolCalls|resultSummaryJson|inputJson|resultHash|harnessRun|toolsInvoked|registry\.search|registry\.detail/)
    expect(projection.turns[0]?.query).toBe('after hours plumber Preston')
    expect(projection.turns[0]?.oneLine).toBe('Honest copy')
    expect(projection.turns[0]?.answerCheckSummary).toEqual({
      catalogSearches: 1,
      listingsRead: 0,
      listedBusinesses: 0,
      checksPassed: 2,
      checksFailed: 0,
      elapsedMs: 0,
    })
  })
})
function currentEvidence(input: {
  toolCalls?: readonly AnswerToolCallRecord[]
  harnessRun?: NonNullable<FrozenTurnEvidenceDraft['harnessRun']>
} = {}) {
  const draft: FrozenTurnEvidenceDraft = {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '/api/businesses/search?q=plumber',
    toolCalls: input.toolCalls ?? [],
    timings: [],
    workLog: [],
    ...(input.harnessRun === undefined ? {} : { harnessRun: input.harnessRun }),
  }
  return {
    ...draft,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'hash-1',
      evidence: draft,
    }),
  }
}

function buildToolCall(
  toolCallId: string,
  turnId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  slugs: readonly string[],
  count: number,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId,
    seq,
    toolId,
    inputJson: JSON.stringify({ query: 'parramatta' }),
    resultSummaryJson: JSON.stringify({ slugs, count }),
    resultJson: JSON.stringify({ kind: 'ok', items: slugs.map((slug) => ({ slug })) }),
    resultHash: canonicalDigest('tool'),
    status: 'complete',
    createdAt: 1_000,
  }
}

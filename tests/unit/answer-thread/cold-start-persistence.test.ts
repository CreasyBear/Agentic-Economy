import { afterEach, describe, expect, it } from 'vitest'

import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  persistAnswerTurnWithResult,
} from '@/modules/answer-thread/internal/answer-turn-finalization'
import {
  buildColdStartRetrievalSnapshot,
  resolveColdStartSourceDecision,
} from '@/modules/answer-thread/internal/turns/retrieval-first'
import type { WebsiteDecisionConstraintId } from '@/modules/answer/public'

const confirmedConstraintIds = [
  'website:v1:simple',
  'website:v1:small_startup',
  'website:v1:perth_local_preference',
  'website:v1:affordability_preference',
  'website:v1:indicative_price_requested',
] as const satisfies readonly WebsiteDecisionConstraintId[]

describe('cold-start answer persistence', () => {
  afterEach(() => {
    setAnswerThreadPortForTests(undefined)
  })

  it('persists a grounded empty result after the clarification turn', async () => {
    const writes: unknown[] = []
    setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => {
        writes.push(args)
        return { turnId: args.turnId }
      },
      appendTurnWithToolCalls: async (args) => {
        writes.push(args)
        return { turnId: args.turnId, insertedToolCalls: args.toolCalls.length }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ turns: [] }),
    })
    const sourceDecision = await resolveColdStartSourceDecision({
      sources: [],
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds,
      resolvedAt: 1,
    })
    const captured = buildColdStartRetrievalSnapshot({
      query: 'Information and enquiries',
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds,
      sourceDecision,
    })

    const result = await persistAnswerTurnWithResult({
      sessionId: 'session-cold-start',
      threadId: 'thread-cold-start',
      isNewThread: false,
      title: 'Website help',
      turnId: 'turn-cold-start-result',
      turnSeq: 2,
      query: 'Information and enquiries',
      intent: 'refine_search',
      captured,
      errorCopyId: undefined,
      toolCalls: [{
        toolCallId: 'tool-call-search',
        turnId: 'turn-cold-start-result',
        seq: 0,
        toolId: 'registry.search',
        inputJson: '{"query":"website Perth","limit":3}',
        resultSummaryJson: '{"slugs":[],"count":0}',
        resultJson: '{"items":[],"pagination":{"total":0}}',
        resultHash: 'hash:empty-search',
        status: 'complete',
        createdAt: 1,
      }],
      gate: { ok: true, source: 'answer_gate' },
      searchContext: {
        mode: 'near_me',
        location: {
          label: 'Perth, WA',
          suburb: 'Perth',
          stateTerritory: 'WA',
          countryCode: 'AU',
          source: 'default',
        },
        allowOutsideArea: false,
        timing: 'flexible',
      },
      timings: [],
      workLog: [],
      allowedSlugs: new Set(),
      sourceWriteRequest: new Request('https://ae.test/api/answer/turn', { method: 'POST' }),
    })

    expect(result.ok).toBe(true)
    expect(writes).toHaveLength(1)
    expect(JSON.parse(result.evidenceJson)).toMatchObject({
      decisionSupport: {
        stage: 'result',
        outcome: 'no_registered_supply',
      },
    })
  })
})

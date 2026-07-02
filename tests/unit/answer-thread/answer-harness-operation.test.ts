import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerSnapshot } from '@/modules/answer/public'
import {
  setAnswerThreadPortForTests,
  type AnswerToolCallRecord,
  type AnswerTurnRecord,
  type FrozenTurnEvidence,
} from '@/modules/answer-thread/public'
import { persistAnswerTurn } from '@/modules/answer-thread/internal/answer-turn-finalization'

const resets: (() => void)[] = []

afterEach(() => {
  while (resets.length > 0) {
    resets.pop()?.()
  }
})

describe('answer harness operation persistence bridge', () => {
  it('persists a live-generated harness report for answer finalization phases', async () => {
    const turns = new Map<string, AnswerTurnRecord>()
    resets.push(setAnswerThreadPortForTests({
      createThread: async (args) => {
        return { threadId: args.threadId }
      },
      appendTurn: async (args) => {
        turns.set(args.turnId, {
          ...args,
          createdAt: 1_000,
        })
        return { turnId: args.turnId }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ turns: [...turns.values()] }),
    }))

    const persisted = await persistAnswerTurn({
      sessionId: 'session-live',
      threadId: 'thread-live',
      isNewThread: true,
      title: 'plumber Preston',
      turnId: 'turn-live',
      turnSeq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
      captured: answerSnapshot(),
      errorCopyId: undefined,
      toolCalls: [
        toolCall('tc-search', 1, 'registry.search', 'complete', 'hash:search'),
      ],
      gate: { ok: false, source: 'answer_gate', code: 'grounding_failed' },
      searchContext: undefined,
      timings: [],
      workLog: [],
      allowedSlugs: new Set(['preston-plumbing']),
    })

    expect(persisted).toBe(true)
    const stored = turns.get('turn-live')
    expect(stored).toBeDefined()

    const evidence = JSON.parse(stored?.evidenceJson ?? '{}') as FrozenTurnEvidence
    expect(evidence.answerRun?.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      complete: 1,
    })
    expect(evidence.harnessRun?.summary.run).toMatchObject({
      runId: 'turn-live',
      sessionId: 'session-live',
      status: 'blocked',
    })
    expect(evidence.harnessRun?.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      ok: 1,
    })
    expect(evidence.harnessRun?.summary.events.byPhase).toMatchObject({
      assemble: { total: 1, ok: 1 },
      persist: { total: 1, ok: 1 },
      report: { total: 1, ok: 1 },
    })
    expect(evidence.harnessRun?.summary.gates?.byName.answer_gate).toMatchObject({
      total: 1,
      blocked: 1,
    })
    expect(evidence.harnessRun?.summary.errors.codes).toContain('grounding_failed')
    expect(evidence.harnessRun?.coverage.toolsInvoked).toEqual(['registry.search'])
    expect(evidence.harnessRun?.coverage.phases).toEqual(
      expect.arrayContaining(['assemble', 'gate', 'persist', 'report']),
    )
  })
})

function answerSnapshot(): AnswerSnapshot {
  return {
    query: 'plumber Preston',
    oneLine: 'One listed business matches.',
    providers: [
      {
        citationIndex: 1,
        slug: 'preston-plumbing',
        name: 'Preston Plumbing',
        category: 'Plumber',
        suburb: 'Preston',
        stateTerritory: 'VIC',
        serviceArea: 'Preston',
        hoursLabel: 'Hours supplied',
        availabilityLabel: 'Published',
        trustLabel: 'Checked',
        responseTimeLabel: '',
        trustCue: 'Checked',
        nextStepLabel: 'Send inquiry',
        detailUrl: '/preston-plumbing',
        services: [],
      },
    ],
    summary: 'Preston Plumbing publishes service coverage.',
    nextStep: 'Open the provider page and send an inquiry when that option is published.',
    agentJsonUrl: '/api/businesses/search?q=plumber',
  }
}

function toolCall(
  toolCallId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  status: AnswerToolCallRecord['status'],
  resultHash: string,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId: 'turn-live',
    seq,
    toolId,
    inputJson: '{}',
    resultSummaryJson: '{"slugs":["preston-plumbing"],"count":1}',
    resultHash,
    status,
    createdAt: 1_000,
  }
}

import { describe, expect, it } from 'vitest'

import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import { buildHarnessRunReport } from '@/modules/harness/public'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { buildPublicThreadProjection } from '@/modules/answer-thread/public'
import type { AnswerThreadRecord, AnswerTurnRecord } from '@/modules/answer-thread/public'

function withAnswerRun(evidence: FrozenTurnEvidenceDraft) {
  return {
    ...evidence,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'hash-secret',
      evidence,
    }),
  }
}

describe('public thread projection', () => {
  it('omits private persistence fields from the share-safe DTO', () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-1',
      pseudonymousSessionId: 'session-secret',
      title: 'plumber Preston',
      sharePolicy: 'public',
      createdAt: 1_000,
      updatedAt: 2_000,
    }

    const turn: AnswerTurnRecord = {
      turnId: 'turn-1',
      threadId: 'thread-1',
      seq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify(withAnswerRun({
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
        allowedSlugs: ['preston-plumbing'],
        agentJsonUrl: '/api/businesses/search?q=plumber',
        toolCalls: [],
        timings: [],
        workLog: [
          {
            id: 'interpret.request',
            phase: 'interpret',
            status: 'complete',
            title: 'Reading your request',
          },
        ],
        harnessRun: buildHarnessRunReport({
          availableTools: ['registry.search'],
          tools: [{ toolId: 'registry.search', status: 'ok', durationMs: 0 }],
        }),
      })),
      snapshotHash: 'hash-secret',
      proseJson: JSON.stringify({
        oneLine: 'One listed business matches.',
        summary: 'The business handles timing, price, and availability.',
        nextStep: 'Open a provider page.',
      }),
      artifactKindsJson: '["one-line","provider-cards"]',
      status: 'complete',
      errorCopyId: 'err-secret',
      createdAt: 3_000,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const serialized = JSON.stringify(projection)

    expect(projection.turns).toHaveLength(1)
    expect(projection.turns[0]?.artifacts.length).toBeGreaterThan(0)
    expect(projection.turns[0]?.workLog.map((step) => step.id)).toEqual(['step-1'])
    expect(projection.turns[0]?.answerCheckSummary).toMatchObject({
      catalogSearches: 0,
      listingsRead: 1,
      listedBusinesses: 1,
      checksPassed: 2,
      checksFailed: 0,
    })
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('hash-secret')
    expect(serialized).not.toContain('err-secret')
    expect(serialized).not.toContain('evidenceJson')
    expect(serialized).not.toContain('pseudonymousSessionId')
    expect(serialized).not.toContain('allowedSlugs')
    expect(serialized).not.toContain('harnessRun')
    expect(serialized).not.toContain('toolsInvoked')
  })

})

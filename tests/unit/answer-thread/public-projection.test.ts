import { describe, expect, it } from 'vitest'

import { buildPublicThreadProjection } from '@/modules/answer-thread/public'
import type { AnswerThreadRecord, AnswerTurnRecord } from '@/modules/answer-thread/public'

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
      evidenceJson: JSON.stringify({
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
        workLog: [
          {
            id: 'interpret.request',
            phase: 'interpret',
            status: 'complete',
            title: 'Reading your request',
          },
        ],
        harnessRun: {
          summary: {
            run: { status: 'ok' },
            tools: { byName: { 'registry.search': { total: 1 } } },
          },
          coverage: { toolsInvoked: ['registry.search'] },
        },
      }),
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

  it('derives a replay work log for older saved turns', () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-legacy',
      pseudonymousSessionId: 'session-secret',
      title: 'plumber Preston',
      sharePolicy: 'public',
      createdAt: 1_000,
      updatedAt: 2_000,
    }

    const turn: AnswerTurnRecord = {
      turnId: 'turn-legacy',
      threadId: 'thread-legacy',
      seq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify({
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '/api/businesses/search?q=plumber',
        toolCalls: [
          {
            toolCallId: 'call-1',
            turnId: 'turn-legacy',
            seq: 0,
            toolId: 'registry.search',
            inputJson: JSON.stringify({ query: 'plumber Preston' }),
            resultSummaryJson: '{}',
            resultHash: 'hash',
            status: 'complete',
            createdAt: 1,
          },
        ],
        timings: [
          {
            name: 'tool.run',
            durationMs: 14,
            atMs: 1,
            metadata: { toolId: 'registry.search', toolSeq: 0 },
          },
        ],
        harnessRun: {
          summary: { run: { status: 'ok' } },
          coverage: { toolsInvoked: ['registry.search'] },
        },
      }),
      snapshotHash: 'hash-secret',
      proseJson: JSON.stringify({
        oneLine: 'No listed businesses match.',
        summary: 'No listed businesses publish matching coverage yet.',
        nextStep: 'Try a nearby suburb.',
      }),
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 3_000,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    expect(projection.turns[0]?.workLog.map((step) => step.id)).toEqual([
      'step-1',
      'step-2',
      'step-3',
      'step-4',
      'step-5',
    ])
    expect(projection.turns[0]?.answerCheckSummary).toEqual({
      catalogSearches: 1,
      listingsRead: 0,
      listedBusinesses: 0,
      checksPassed: 2,
      checksFailed: 0,
      elapsedMs: 14,
    })
    expect(JSON.stringify(projection)).not.toMatch(/toolCalls|resultSummaryJson|inputJson|resultHash|harnessRun|toolsInvoked|registry\.search|registry\.detail/)
  })
})

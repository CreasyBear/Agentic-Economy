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
    expect(projection.turns[0]?.workLog.map((step) => step.id)).toEqual(['interpret.request'])
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('hash-secret')
    expect(serialized).not.toContain('err-secret')
    expect(serialized).not.toContain('evidenceJson')
    expect(serialized).not.toContain('pseudonymousSessionId')
    expect(serialized).not.toContain('allowedSlugs')
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
      }),
      snapshotHash: 'hash-secret',
      proseJson: JSON.stringify({
        oneLine: 'No listed businesses match.',
        summary: 'No listed providers publish matching coverage yet.',
        nextStep: 'Try a nearby suburb.',
      }),
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 3_000,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    expect(projection.turns[0]?.workLog.map((step) => step.id)).toEqual([
      'interpret.request',
      'search.registry.initial',
      'read.providers',
      'compare.fit',
      'assemble.answer',
    ])
  })
})

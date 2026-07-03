import { describe, expect, it } from 'vitest'

import { buildSessionJourney } from '@/components/ae/chat/session-journey'
import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

describe('session journey', () => {
  it('stays hidden until a session has a turn', () => {
    expect(buildSessionJourney({ projection: null, liveTurn: null })).toBeNull()
  })

  it('marks a first live query as the active listing search', () => {
    const journey = buildSessionJourney({ projection: null, liveTurn: { intent: 'refine_search' } })

    expect(journey?.guidance).toBe('AE is checking published service details before any contact step.')
    expect(journey?.steps.map((step) => [step.id, step.status])).toEqual([
      ['search', 'active'],
      ['compare', 'pending'],
      ['follow_up', 'pending'],
      ['inquiry', 'pending'],
    ])
  })

  it('makes the next follow-up explicit after provider evidence exists', () => {
    const journey = buildSessionJourney({ projection: projection([turn()]), liveTurn: null })

    expect(journey?.providerCount).toBe(2)
    expect(journey?.hasInquiryReadyProvider).toBe(true)
    expect(journey?.guidance).toBe(
      'Compare fit, then choose a business to contact. The business still confirms timing and price.',
    )
    expect(journey?.steps.map((step) => [step.id, step.status])).toEqual([
      ['search', 'complete'],
      ['compare', 'complete'],
      ['follow_up', 'active'],
      ['inquiry', 'pending'],
    ])
  })

  it('shows an inquiry handoff as the active safe next step while it streams', () => {
    const journey = buildSessionJourney({
      projection: projection([turn()]),
      liveTurn: { intent: 'inquiry_handoff' },
    })

    expect(journey?.guidance).toBe(
      'AE is preparing the qualified inquiry next step. The business still confirms details.',
    )
    expect(journey?.steps.map((step) => [step.id, step.status])).toEqual([
      ['search', 'complete'],
      ['compare', 'complete'],
      ['follow_up', 'complete'],
      ['inquiry', 'active'],
    ])
  })

  it('keeps completed inquiry handoffs visible on replay', () => {
    const journey = buildSessionJourney({
      projection: projection([turn(), turn({ seq: 2, intent: 'inquiry_handoff' })]),
      liveTurn: null,
    })

    expect(journey?.steps.find((step) => step.id === 'inquiry')?.status).toBe('complete')
  })

  it('counts selected-provider handoff artifacts as provider and inquiry context', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn({
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Ready to send a qualified inquiry to Northside Plumbing.',
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.providerCount).toBe(1)
    expect(journey?.hasInquiryReadyProvider).toBe(true)
    expect(journey?.steps.find((step) => step.id === 'compare')?.detail).toBe('1 listed business')
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.detail).toBe('Qualified inquiry only')
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.status).toBe('complete')
  })
})

function projection(turns: readonly PublicThreadTurn[]): PublicThreadProjection {
  return {
    threadId: 'thread-1',
    title: 'Plumbers in Perth',
    turns,
  }
}

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: `turn-${overrides.seq ?? 1}`,
    seq: 1,
    query: 'plumbers in Perth',
    intent: 'refine_search' as FollowUpIntent,
    status: 'complete',
    workLog: [],
    artifacts: [
      {
        kind: 'provider-cards',
        providers: [
          provider(),
          provider({ citationIndex: 2, slug: 'northside-plumbing', name: 'Northside Plumbing' }),
        ],
      },
    ],
    oneLine: 'Two listed businesses match.',
    ...overrides,
  }
}

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumber',
    name: 'Demo Plumber',
    category: 'Plumber',
    suburb: 'Perth',
    stateTerritory: 'WA',
    serviceArea: 'Perth',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: '',
    trustCue: 'Checked',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumber',
    inquiryUrl: '/demo-plumber/inquiry',
    services: [],
    ...overrides,
  }
}

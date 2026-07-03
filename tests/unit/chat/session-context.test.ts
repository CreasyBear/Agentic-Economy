import { describe, expect, it } from 'vitest'

import { buildSessionContext } from '@/components/ae/chat/session-context'
import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

describe('session context', () => {
  it('stays hidden until a completed turn exists', () => {
    expect(buildSessionContext({ projection: null, liveTurn: null })).toBeNull()
  })

  it('summarizes listed businesses and inquiry readiness from saved turns', () => {
    const context = buildSessionContext({ projection: projection([turn()]), liveTurn: null })

    expect(context?.badgeLabel).toBe('Saved context')
    expect(context?.summary).toBe('AE is holding the listed businesses from this thread for comparison and follow-up.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'businesses', value: 'Demo Plumber, Northside Plumbing' }),
      expect.objectContaining({ id: 'inquiry', value: '1 listed business publishes an inquiry path' }),
      expect.objectContaining({ id: 'boundary', value: 'Business confirms timing, quote, and availability.' }),
    ]))
  })

  it('shows how a live follow-up is using prior context', () => {
    const context = buildSessionContext({
      projection: projection([turn()]),
      liveTurn: { query: 'compare the first two', intent: 'compare_known' },
    })

    expect(context?.badgeLabel).toBe('Comparing')
    expect(context?.summary).toBe('This follow-up is comparing known options using the businesses already found in this thread.')
    expect(context?.facts[0]).toMatchObject({ id: 'focus', label: 'Current follow-up', value: 'compare the first two' })
  })

  it('keeps the selected business explicit after an inquiry handoff turn', () => {
    const selected = provider({ name: 'Northside Plumbing', slug: 'northside-plumbing', inquiryUrl: '/northside-plumbing/inquiry' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Northside Plumbing is selected for inquiry review.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe('Northside Plumbing is the current business selected for inquiry review.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
      expect.objectContaining({ id: 'inquiry', value: '2 listed businesses publish an inquiry path' }),
    ]))
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
          provider({ citationIndex: 2, slug: 'northside-plumbing', name: 'Northside Plumbing', inquiryUrl: '' }),
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

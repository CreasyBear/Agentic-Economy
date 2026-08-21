import { describe, expect, it } from 'vitest'

import { buildSessionContext } from '@/components/ae/chat/session-context'
import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

describe('session context', () => {
  it('stays hidden until a completed turn exists', () => {
    expect(buildSessionContext({ projection: null, liveTurn: null })).toBeNull()
  })

  it('summarizes listed businesses from saved turns', () => {
    const context = buildSessionContext({ projection: projection([turn()]), liveTurn: null })

    expect(context?.badgeLabel).toBe('Saved context')
    expect(context?.summary).toBe('Keeping the matches from this thread ready for comparison and follow-up.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: '2 matches in this answer: Demo Plumber, Northside Plumbing' }),
      expect.objectContaining({ id: 'businesses', value: 'Demo Plumber, Northside Plumbing' }),
      expect.objectContaining({ id: 'boundary', value: 'Business confirms timing, quote, and availability.' }),
    ]))
  })

  it('shows how a live follow-up is using prior context', () => {
    const context = buildSessionContext({
      projection: projection([turn()]),
      liveTurn: { query: 'compare the first two', intent: 'compare_known' },
    })

    expect(context?.badgeLabel).toBe('Comparing')
    expect(context?.summary).toBe('This follow-up is comparing the options using the matches already found in this thread.')
    expect(context?.facts[0]).toMatchObject({ id: 'focus', label: 'Current follow-up', value: 'compare the first two' })
    expect(context?.facts[1]).toMatchObject({ id: 'current', label: 'Last answer' })
  })

  it('does not describe a fresh live search as filtering prior businesses', () => {
    const context = buildSessionContext({
      projection: projection([turn()]),
      liveTurn: { query: 'Find electricians in Fremantle', intent: 'refine_search' },
    })

    expect(context?.badgeLabel).toBe('Finding more')
    expect(context?.summary).toBe(
      'Checking what\'s available again while keeping this thread visible.',
    )
    expect(context?.facts[0]).toMatchObject({
      id: 'focus',
      label: 'Current follow-up',
      value: 'Find electricians in Fremantle',
    })
    expect(context?.facts[1]).toMatchObject({ id: 'current', label: 'Last answer' })
  })

  it('labels unsupported live requests as a redirect instead of a context-bound comparison', () => {
    const context = buildSessionContext({
      projection: projection([turn()]),
      liveTurn: { query: 'Book the first one for me', intent: 'unsupported' },
    })

    expect(context?.badgeLabel).toBe('Needs another approach')
    expect(context?.summary).toBe(
      'This follow-up needs another approach, so the options stay visible here.',
    )
  })

  it('separates the latest narrowed answer from the wider thread context', () => {
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'filter_known',
          query: 'Show only the closest businesses',
          artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
          oneLine: 'One listed business is closest.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe(
      'This answer is narrowed to Demo Plumber while earlier matches stay in the thread.',
    )
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', label: 'Current answer', value: 'Demo Plumber in this answer' }),
      expect.objectContaining({ id: 'businesses', value: 'Demo Plumber, Northside Plumbing' }),
    ]))
  })

  it('keeps the selected business explicit after a review turn', () => {
    const selected = provider({ name: 'Northside Plumbing', slug: 'northside-plumbing' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Northside Plumbing is selected for review.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe('Northside Plumbing is selected for review.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'Northside Plumbing selected for review' }),
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
    ]))
  })

  it('keeps the selected business active through a later boundary-only answer', () => {
    const selected = provider({ name: 'Northside Plumbing', slug: 'northside-plumbing' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Northside Plumbing is selected for review.',
        }),
        turn({
          seq: 3,
          intent: 'explain_boundary',
          query: 'Can AE book this for me?',
          artifacts: [
            { kind: 'one-line', text: 'AE cannot book, charge, or dispatch.' },
            {
              kind: 'prose',
              block: 'summary',
              text: 'AE can keep the comparison context, but the business confirms details.',
            },
          ],
          oneLine: 'AE cannot book, charge, or dispatch.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe('Northside Plumbing is selected for review.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'No clear match in this answer' }),
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
    ]))
  })

  it('labels a selected review-only business as listing review', () => {
    const selected = provider({ name: 'Review Only Plumbing', slug: 'review-only-plumbing' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          query: 'Message Review Only Plumbing',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Review Only Plumbing needs listing review first.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe('Review Only Plumbing is selected for review.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'Review Only Plumbing selected for review' }),
      expect.objectContaining({ id: 'selected', value: 'Review Only Plumbing' }),
    ]))
  })

  it('does not let an older selected business hide a later narrowed answer', () => {
    const selected = provider({ name: 'Northside Plumbing', slug: 'northside-plumbing' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          query: 'Review the first listed business',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Northside Plumbing is selected for review.',
        }),
        turn({
          seq: 3,
          intent: 'filter_known',
          query: 'Show only the closest businesses',
          artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
          oneLine: 'One listed business is closest.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe(
      'This answer is narrowed to Demo Plumber while earlier matches stay in the thread.',
    )
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'Demo Plumber in this answer' }),
    ]))
    expect(context?.facts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
    ]))
  })
  it('removes bidi formatting controls from session facts', () => {
    const context = buildSessionContext({
      projection: projection([turn({
        artifacts: [{
          kind: 'provider-cards',
          providers: [provider({ name: 'Demo\u202e Plumber' })],
        }],
      })]),
      liveTurn: { query: 'compare\u202e this option', intent: 'compare_known' },
    })

    expect(context?.facts[0]?.value).toBe('compare this option')
    expect(JSON.stringify(context)).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/u)
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
    nextStepLabel: 'Review details',
    detailUrl: '/demo-plumber',
    services: [],
    ...overrides,
  }
}

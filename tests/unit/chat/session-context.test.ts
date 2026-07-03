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
      expect.objectContaining({ id: 'current', value: '2 listed businesses in this answer: Demo Plumber, Northside Plumbing' }),
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
    expect(context?.facts[1]).toMatchObject({ id: 'current', label: 'Last answer' })
  })

  it('does not describe a fresh live search as filtering prior businesses', () => {
    const context = buildSessionContext({
      projection: projection([turn()]),
      liveTurn: { query: 'Find electricians in Fremantle', intent: 'refine_search' },
    })

    expect(context?.badgeLabel).toBe('Refining')
    expect(context?.summary).toBe(
      'This follow-up is searching published listings again while AE keeps this thread visible.',
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

    expect(context?.badgeLabel).toBe('Needs redirect')
    expect(context?.summary).toBe(
      'This follow-up is being routed back to published listings while AE keeps this thread visible.',
    )
  })

  it('separates the latest narrowed answer from the wider thread context', () => {
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'filter_known',
          query: 'Show only businesses that accept inquiries',
          artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
          oneLine: 'One listed business accepts inquiries.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe(
      'This answer is narrowed to Demo Plumber while AE keeps earlier listed businesses in the thread.',
    )
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', label: 'Current answer', value: 'Demo Plumber in this answer' }),
      expect.objectContaining({ id: 'businesses', value: 'Demo Plumber, Northside Plumbing' }),
    ]))
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
      expect.objectContaining({ id: 'current', value: 'Northside Plumbing selected for inquiry review' }),
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
      expect.objectContaining({ id: 'inquiry', value: '2 listed businesses publish an inquiry path' }),
    ]))
  })

  it('keeps the selected business active through a later boundary-only answer', () => {
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
        turn({
          seq: 3,
          intent: 'explain_boundary',
          query: 'Can AE book this for me?',
          artifacts: [
            { kind: 'one-line', text: 'AE cannot book, charge, or dispatch.' },
            {
              kind: 'prose',
              block: 'summary',
              text: 'AE can keep the inquiry context, but the business confirms details.',
            },
          ],
          oneLine: 'AE cannot book, charge, or dispatch.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe('Northside Plumbing is the current business selected for inquiry review.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'No listed business in this answer' }),
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
    ]))
  })

  it('labels a selected review-only business as listing review', () => {
    const selected = provider({ name: 'Review Only Plumbing', slug: 'review-only-plumbing', inquiryUrl: '' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          query: 'Message Review Only Plumbing',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Review Only Plumbing needs listing review first.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe('Review Only Plumbing is the current business selected for listing review.')
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'Review Only Plumbing selected for listing review' }),
      expect.objectContaining({ id: 'selected', value: 'Review Only Plumbing' }),
    ]))
  })

  it('does not let an older selected business hide a later narrowed answer', () => {
    const selected = provider({ name: 'Northside Plumbing', slug: 'northside-plumbing', inquiryUrl: '/northside-plumbing/inquiry' })
    const context = buildSessionContext({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          query: 'Send a qualified inquiry to the first listed business',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Northside Plumbing is selected for inquiry review.',
        }),
        turn({
          seq: 3,
          intent: 'filter_known',
          query: 'Show only businesses that accept inquiries',
          artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
          oneLine: 'One listed business accepts inquiries.',
        }),
      ]),
      liveTurn: null,
    })

    expect(context?.summary).toBe(
      'This answer is narrowed to Demo Plumber while AE keeps earlier listed businesses in the thread.',
    )
    expect(context?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current', value: 'Demo Plumber in this answer' }),
    ]))
    expect(context?.facts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'selected', value: 'Northside Plumbing' }),
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

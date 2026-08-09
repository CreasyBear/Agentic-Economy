import { describe, expect, it } from 'vitest'

import { buildSessionJourney } from '@/components/ae/chat/session-journey'
import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

describe('session journey', () => {
  it('stays hidden until a session has a turn', () => {
    expect(buildSessionJourney({ projection: null, liveTurn: null })).toBeNull()
  })

  it('stays hidden for a first live query until listings or inquiry activity exist', () => {
    // Nothing to orient during the opening search: the answer's own streaming
    // state carries progress, so an empty "inquiry path" would only be noise.
    // The journey appears once listings arrive or an inquiry is in play.
    expect(buildSessionJourney({ projection: null, liveTurn: { intent: 'refine_search' } })).toBeNull()
  })

  it('makes the next follow-up explicit after provider evidence exists', () => {
    const journey = buildSessionJourney({ projection: projection([turn()]), liveTurn: null })

    expect(journey?.providerCount).toBe(2)
    expect(journey?.hasInquiryReadyProvider).toBe(true)
    expect(journey?.statusText).toBe('2 matches ready to compare')
    expect(journey?.guidance).toBe(
      'Compare the options, then choose a business to contact. The business still confirms timing, quote, and availability.',
    )
    expect(journey?.steps.map((step) => step.label)).toEqual(['Find', 'Compare', 'Follow up', 'Ask the business'])
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
      'Preparing a request to the business. The business still confirms timing, quote, and availability.',
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
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: provider() }],
          oneLine: "Ready to open Demo Plumber's qualified inquiry form.",
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.steps.find((step) => step.id === 'inquiry')?.status).toBe('complete')
    expect(journey?.statusText).toBe('Demo Plumber selected for contact')
    expect(journey?.guidance).toBe(
      'Demo Plumber is selected for contact. The business still confirms timing, quote, and availability.',
    )
  })

  it('counts selected-provider handoff artifacts as provider and inquiry context', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn({
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: "Ready to open Northside Plumbing's qualified inquiry form.",
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.providerCount).toBe(1)
    expect(journey?.hasInquiryReadyProvider).toBe(true)
    expect(journey?.selectedProvider).toEqual({ name: 'Northside Plumbing', hasInquiryPath: true })
    expect(journey?.statusText).toBe('Northside Plumbing selected for contact')
    expect(journey?.steps.find((step) => step.id === 'compare')?.detail).toBe('1 match')
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.detail).toBe('Request form available')
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.status).toBe('complete')
  })

  it('does not call a selected review-only business inquiry-ready just because another thread listing is ready', () => {
    const selected = providerWithoutInquiry({ slug: 'review-only-plumbing', name: 'Review Only Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Review Only Plumbing does not publish an AE inquiry form yet.',
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.providerCount).toBe(3)
    expect(journey?.hasInquiryReadyProvider).toBe(true)
    expect(journey?.selectedProvider).toEqual({ name: 'Review Only Plumbing', hasInquiryPath: false })
    expect(journey?.statusText).toBe('Review Only Plumbing selected for review')
    expect(journey?.guidance).toBe(
      'Review Only Plumbing is selected for review. This business does not have a request form yet.',
    )
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.detail).toBe('No request form yet')
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.status).toBe('complete')
  })

  it('keeps a selected provider through a later boundary-only answer', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: "Ready to open Northside Plumbing's qualified inquiry form.",
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

    expect(journey?.selectedProvider).toEqual({ name: 'Northside Plumbing', hasInquiryPath: true })
    expect(journey?.statusText).toBe('Northside Plumbing selected for contact')
    expect(journey?.guidance).toBe(
      'Northside Plumbing is selected for contact. The business still confirms timing, quote, and availability.',
    )
  })

  it('lets a later provider-list answer replace an older selected provider as the active journey state', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'inquiry_handoff',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: "Ready to open Northside Plumbing's qualified inquiry form.",
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

    expect(journey?.selectedProvider).toBeUndefined()
    expect(journey?.statusText).toBe('2 matches ready to compare')
    expect(journey?.guidance).toBe(
      'Compare the options, then choose a business to contact. The business still confirms timing, quote, and availability.',
    )
    expect(journey?.steps.find((step) => step.id === 'inquiry')?.status).toBe('pending')
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

function providerWithoutInquiry(overrides: Partial<AnswerSource> = {}): AnswerSource {
  const { inquiryUrl: _inquiryUrl, ...source } = provider(overrides)
  return source
}

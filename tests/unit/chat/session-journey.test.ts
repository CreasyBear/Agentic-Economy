import { describe, expect, it } from 'vitest'

import { buildSessionJourney } from '@/components/ae/chat/session-journey'
import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

describe('session journey', () => {
  it('stays hidden until a session has a turn', () => {
    expect(buildSessionJourney({ projection: null, liveTurn: null })).toBeNull()
  })

  it('stays hidden for a first live query until listing evidence exists', () => {
    // Nothing to orient during the opening search: the answer's own streaming
    // state carries progress, so an empty journey would only be noise.
    expect(buildSessionJourney({ projection: null, liveTurn: { intent: 'refine_search' } })).toBeNull()
  })

  it('makes the next follow-up explicit after provider evidence exists', () => {
    const journey = buildSessionJourney({ projection: projection([turn()]), liveTurn: null })

    expect(journey?.providerCount).toBe(2)
    expect(journey?.statusText).toBe('2 matches ready to compare')
    expect(journey?.guidance).toBe('Compare the published details, then use a listed contact channel when one is available.')
    expect(journey?.steps.map((step) => step.label)).toEqual(['Find', 'Compare', 'Follow up'])
    expect(journey?.steps.map((step) => [step.id, step.status])).toEqual([
      ['search', 'complete'],
      ['compare', 'complete'],
      ['follow_up', 'active'],
    ])
  })

  it('does not treat an unsupported follow-up as a hosted inquiry step', () => {
    const journey = buildSessionJourney({
      projection: projection([turn()]),
      liveTurn: { intent: 'unsupported' },
    })

    expect(journey?.guidance).toBe('Compare the published details, then use a listed contact channel when one is available.')
    expect(journey?.steps.map((step) => [step.id, step.status])).toEqual([
      ['search', 'complete'],
      ['compare', 'complete'],
      ['follow_up', 'complete'],
    ])
  })

  it('keeps a selected provider on replay without a hosted inquiry step', () => {
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          artifacts: [{ kind: 'selected-provider', provider: provider() }],
          oneLine: 'Demo Plumber is selected for review.',
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.statusText).toBe('Demo Plumber selected for review')
    expect(journey?.guidance).toBe('Compare the published details, then use a listed contact channel when one is available.')
  })

  it('counts selected-provider artifacts as provider context', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn({
          intent: 'unsupported',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Northside Plumbing is selected for review.',
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.providerCount).toBe(1)
    expect(journey?.selectedProvider).toEqual({ name: 'Northside Plumbing' })
    expect(journey?.statusText).toBe('Northside Plumbing selected for review')
    expect(journey?.steps.find((step) => step.id === 'compare')?.detail).toBe('1 match')
  })

  it('keeps a selected business in review state', () => {
    const selected = provider({ slug: 'review-only-plumbing', name: 'Review Only Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: 'Review Only Plumbing does not publish contact on AE.',
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.providerCount).toBe(3)
    expect(journey?.selectedProvider).toEqual({ name: 'Review Only Plumbing' })
    expect(journey?.statusText).toBe('Review Only Plumbing selected for review')
    expect(journey?.guidance).toBe('Compare the published details, then use a listed contact channel when one is available.')
  })

  it('keeps a selected provider through a later boundary-only answer', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
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

    expect(journey?.selectedProvider).toEqual({ name: 'Northside Plumbing' })
    expect(journey?.statusText).toBe('Northside Plumbing selected for review')
    expect(journey?.guidance).toBe('Compare the published details, then use a listed contact channel when one is available.')
  })

  it('lets a later provider-list answer replace an older selected provider as the active journey state', () => {
    const selected = provider({ slug: 'northside-plumbing', name: 'Northside Plumbing' })
    const journey = buildSessionJourney({
      projection: projection([
        turn(),
        turn({
          seq: 2,
          intent: 'unsupported',
          artifacts: [{ kind: 'selected-provider', provider: selected }],
          oneLine: "Ready to open Northside Plumbing's qualified inquiry form.",
        }),
        turn({
          seq: 3,
          intent: 'filter_known',
          query: 'Show only the closest businesses',
          artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
          oneLine: 'One listed business accepts inquiries.',
        }),
      ]),
      liveTurn: null,
    })

    expect(journey?.selectedProvider).toBeUndefined()
    expect(journey?.statusText).toBe('2 matches ready to compare')
    expect(journey?.guidance).toBe('Compare the published details, then use a listed contact channel when one is available.')
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

import { describe, expect, it } from 'vitest'

import { resolveComparisonPresentation } from '@/modules/comparison/internal/presentation'

const deterministicBrief = {
  schemaVersion: 'offering-comparison-brief:v1' as const,
  posture: 'unranked' as const,
  decisiveReasonIds: ['reason:unranked:no_priority'] as const,
  foregroundableFactIds: ['fact:one', 'fact:two'] as const,
  mandatoryCaveatIds: ['caveat:no_priority', 'caveat:published_information'] as const,
  detailSectionIds: [
    'detail:options',
    'detail:comparison_facts',
    'detail:sources_and_freshness',
  ] as const,
  safeActionIds: ['action:view_offering', 'action:change_priorities'] as const,
}

describe('bounded comparison presentation', () => {
  it('accepts only registered composition and existing semantic IDs bound to the digest', () => {
    expect(resolveComparisonPresentation({
      semanticDigest: 'comparison:digest:one',
      brief: deterministicBrief,
      adapter: {
        kind: 'proposed',
        proposal: {
          semanticDigest: 'comparison:digest:one',
          mode: 'answer_first',
          density: 'concise',
          responsiveComposition: 'answer_then_evidence',
          emphasisIds: ['fact:two', 'reason:unranked:no_priority'],
        },
      },
    })).toEqual({
      kind: 'accepted',
      plan: {
        mode: 'answer_first',
        density: 'concise',
        responsiveComposition: 'answer_then_evidence',
        emphasisIds: ['fact:two', 'reason:unranked:no_priority'],
      },
    })
  })

  it.each([
    ['wrong digest', { semanticDigest: 'other' }],
    ['unknown ID', { emphasisIds: ['fact:invented'] }],
    ['duplicate ID', { emphasisIds: ['fact:one', 'fact:one'] }],
    ['too many IDs', { emphasisIds: ['fact:one', 'fact:two', 'caveat:no_priority', 'detail:options'] }],
    ['unknown mode', { mode: 'free_form' }],
    ['free prose', { prose: 'Call this provider now' }],
    ['component name', { component: 'CheckoutCard' }],
    ['URL', { href: 'https://example.com/run' }],
    ['action', { action: 'book' }],
    ['ARIA', { ariaLabel: 'Open everything' }],
    ['disclosure control', { disclosureOpen: true }],
  ])('falls back atomically for %s', (_label, patch) => {
    const proposal = {
      semanticDigest: 'comparison:digest:one',
      mode: 'answer_first',
      density: 'concise',
      responsiveComposition: 'answer_then_evidence',
      emphasisIds: ['fact:one'],
      ...patch,
    }
    expect(resolveComparisonPresentation({
      semanticDigest: 'comparison:digest:one',
      brief: deterministicBrief,
      adapter: { kind: 'proposed', proposal },
    })).toEqual({
      kind: 'fallback',
      reason: 'invalid_proposal',
      plan: {
        mode: 'answer_first',
        density: 'comfortable',
        responsiveComposition: 'answer_then_evidence',
        emphasisIds: [],
      },
    })
  })

  it.each([
    'disabled',
    'timeout',
    'unavailable',
    'unsafe',
    'switched_model',
  ] as const)('returns the same complete immediate fallback when the adapter is %s', (kind) => {
    const adapter = { kind }
    expect(resolveComparisonPresentation({
      semanticDigest: 'comparison:digest:one',
      brief: deterministicBrief,
      adapter,
    })).toMatchObject({
      kind: 'fallback',
      plan: {
        mode: 'answer_first',
        density: 'comfortable',
        responsiveComposition: 'answer_then_evidence',
        emphasisIds: [],
      },
    })
  })
})

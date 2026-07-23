import { describe, expect, it } from 'vitest'

import {
  buildComparisonBrief,
  compareOfferings,
  type ResolvedComparisonSelection,
} from '@/modules/comparison/public'

describe('deterministic comparison decision brief', () => {
  it('is complete and stable without model prose for ordered posture', () => {
    const comparison = compareOfferings({
      selections: [selection('dear', 200), selection('cheap', 100)],
      priorities: ['professional_service:v1:lowest_total_price'],
    })

    const first = buildComparisonBrief(comparison)
    const second = buildComparisonBrief(comparison)
    expect(first).toEqual(second)
    expect(first).toEqual({
      schemaVersion: 'offering-comparison-brief:v1',
      posture: 'ordered',
      decisiveReasonIds: ['reason:professional_service:v1:lowest_total_price'],
      foregroundableFactIds: [
        'fact:business:cheap:offering:cheap:1:professional_service:v1:price_basis',
        'fact:business:dear:offering:dear:1:professional_service:v1:price_basis',
      ],
      mandatoryCaveatIds: ['caveat:published_information'],
      detailSectionIds: [
        'detail:options',
        'detail:comparison_facts',
        'detail:sources_and_freshness',
      ],
      safeActionIds: ['action:view_offering', 'action:change_priorities'],
    })
    expect(JSON.stringify(first)).not.toMatch(/generated|model|prose|score/i)
  })

  it.each([
    ['no priority', [], 'reason:unranked:no_priority', ['caveat:no_priority']],
    [
      'stale decisive fact',
      ['professional_service:v1:lowest_total_price'],
      'reason:unranked:stale_fact',
      ['caveat:stale_fact'],
    ],
  ] as const)('keeps stable IDs and mandatory caveats for %s', (_label, priorities, reason, caveats) => {
    const stale = _label === 'stale decisive fact'
    const comparison = compareOfferings({
      selections: [
        selection('one', 100, stale),
        selection('two', 200),
      ],
      priorities,
    })
    const brief = buildComparisonBrief(comparison)

    expect(brief.posture).toBe('unranked')
    expect(brief.decisiveReasonIds).toContain(reason)
    expect(brief.mandatoryCaveatIds).toEqual([
      ...caveats,
      'caveat:published_information',
    ])
    expect(brief.foregroundableFactIds.length).toBeLessThanOrEqual(3)
    expect(brief.detailSectionIds).toHaveLength(3)
    expect(brief.safeActionIds).toEqual(['action:view_offering', 'action:change_priorities'])
  })

  it('surfaces changed-revision and partial-selection caveats without removing other brief content', () => {
    const changed = {
      ...selection('changed', 100),
      newerCurrentReference: {
        businessId: 'business:changed',
        offeringRef: 'offering:changed',
        offeringRevision: 2,
      },
    }
    const comparison = compareOfferings({
      selections: [changed, selection('current', 200)],
      priorities: [],
      refusedSelectionCount: 1,
    })
    const brief = buildComparisonBrief(comparison)

    expect(brief.mandatoryCaveatIds).toEqual([
      'caveat:no_priority',
      'caveat:selection_refused',
      'caveat:newer_revision',
      'caveat:published_information',
    ])
    expect(brief.detailSectionIds).toEqual([
      'detail:options',
      'detail:comparison_facts',
      'detail:sources_and_freshness',
    ])
  })
})

function selection(
  suffix: string,
  amountMinor: number,
  stale = false,
): ResolvedComparisonSelection {
  const source = { kind: 'business_supplied' as const }
  const known = <T>(value: T) => ({ kind: 'known' as const, value, source, observedAt: 100 })
  const priceValue = {
    description: 'Published total',
    currency: 'AUD',
    amountMinor,
    unit: 'total' as const,
  }
  return {
    selection: {
      businessId: `business:${suffix}`,
      offeringRef: `offering:${suffix}`,
      offeringRevision: 1,
      projectionObservedAt: 100,
    },
    business: { businessId: `business:${suffix}`, slug: suffix, name: `Business ${suffix}` },
    offering: {
      offeringRef: `offering:${suffix}`,
      revision: 1,
      name: `Offering ${suffix}`,
      category: 'Professional service',
      summary: 'Published comparison facts.',
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'professional_service:v1',
          scopeBasis: known('Brochure website'),
          priceBasis: stale
            ? { kind: 'stale', lastKnown: priceValue, source, observedAt: 100, validUntil: 120 }
            : known(priceValue),
          timingBasis: known('Four weeks'),
          serviceArea: known('Perth'),
        },
      },
    },
    publication: { publishedAt: 90, safeDisplayDisposition: 'retain_safe_history' },
    projectionDisposition: 'current',
    resolvedAt: 150,
  }
}

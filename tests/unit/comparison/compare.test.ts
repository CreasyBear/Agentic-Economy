import { describe, expect, it } from 'vitest'

import {
  compareOfferings,
  comparisonSelectionId,
  type ComparisonFact,
  type ResolvedComparisonSelection,
} from '@/modules/comparison/public'

describe('pure Offering comparison', () => {
  it('defaults to explicit unranked when no priority was stated', () => {
    const selections = [professional('one', knownPrice(100)), professional('two', knownPrice(200))]
    expect(compareOfferings({ selections, priorities: [] })).toMatchObject({
      schemaVersion: 'offering-comparison:v1',
      ordering: { kind: 'unranked', reason: 'no_priority' },
    })
  })

  it('returns unranked for an exact tie without applying a hidden tie-break', () => {
    const selections = [professional('one', knownPrice(100)), professional('two', knownPrice(100))]
    const result = compareOfferings({
      selections,
      priorities: ['professional_service:v1:lowest_total_price'],
    })
    expect(result.ordering).toEqual({
      kind: 'unranked',
      reason: 'tie',
      blockingFactIds: [
        'fact:business:one:offering:one:1:professional_service:v1:price_basis',
        'fact:business:two:offering:two:1:professional_service:v1:price_basis',
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(/score|weight|tieBreak/i)
  })

  it.each([
    ['unknown', { kind: 'unknown', explanation: 'Price not known.', source, observedAt: 100 }],
    ['not supplied', { kind: 'not_supplied', source, observedAt: 100 }],
    ['stale', {
      kind: 'stale',
      lastKnown: priceValue(90),
      source,
      observedAt: 100,
      validUntil: 120,
    }],
  ] as const)('%s decisive evidence blocks ordering for the whole set', (_label, price) => {
    const result = compareOfferings({
      selections: [professional('one', price), professional('two', knownPrice(200))],
      priorities: ['professional_service:v1:lowest_total_price'],
    })

    expect(result.ordering).toMatchObject({
      kind: 'unranked',
      reason: price.kind === 'stale' ? 'stale_fact' : 'missing_material_fact',
    })
    expect(result.ordering).not.toHaveProperty('orderedSelectionIds')
  })

  it('blocks cross-profile ordering rather than matching labels or price units by inference', () => {
    const result = compareOfferings({
      selections: [professional('service', knownPrice(100)), machine('data', 1)],
      priorities: ['professional_service:v1:lowest_total_price'],
    })

    expect(result.ordering).toMatchObject({
      kind: 'unranked',
      reason: 'not_comparable',
    })
  })

  it('returns the unique evidence-backed lexicographic sequence and decisive reasons without a score', () => {
    const cheaper = professional('cheap', knownPrice(100))
    const dearer = professional('dear', knownPrice(200))
    const result = compareOfferings({
      selections: [dearer, cheaper],
      priorities: ['professional_service:v1:lowest_total_price'],
    })

    expect(result.ordering).toEqual({
      kind: 'ordered',
      rule: 'lexicographic_stated_priorities:v1',
      orderedSelectionIds: [
        comparisonSelectionId(cheaper.selection),
        comparisonSelectionId(dearer.selection),
      ],
      decisivePriorityIds: ['professional_service:v1:lowest_total_price'],
      decisiveFactIds: [
        'fact:business:cheap:offering:cheap:1:professional_service:v1:price_basis',
        'fact:business:dear:offering:dear:1:professional_service:v1:price_basis',
      ],
      reasonIds: ['reason:professional_service:v1:lowest_total_price'],
    })
    expect(JSON.stringify(result)).not.toMatch(/score|weight|model|reputation|trust/i)
  })

  it('changes the order when the decisive source fixture changes', () => {
    const first = professional('first', knownPrice(100))
    const second = professional('second', knownPrice(200))
    const before = compareOfferings({
      selections: [first, second],
      priorities: ['professional_service:v1:lowest_total_price'],
    })
    const after = compareOfferings({
      selections: [professional('first', knownPrice(300)), second],
      priorities: ['professional_service:v1:lowest_total_price'],
    })

    expect(before.ordering.kind === 'ordered' ? before.ordering.orderedSelectionIds[0] : '').toContain('first')
    expect(after.ordering.kind === 'ordered' ? after.ordering.orderedSelectionIds[0] : '').toContain('second')
  })
})

const source = { kind: 'business_supplied' as const }

function priceValue(amountMinor: number) {
  return {
    description: `AUD ${amountMinor / 100} total`,
    currency: 'AUD',
    amountMinor,
    unit: 'total' as const,
  }
}

function knownPrice(amountMinor: number) {
  return {
    kind: 'known' as const,
    value: priceValue(amountMinor),
    source,
    observedAt: 100,
  }
}

function professional(
  suffix: string,
  priceBasis: ComparisonFact<ReturnType<typeof priceValue>>,
): ResolvedComparisonSelection {
  const known = <T>(value: T) => ({ kind: 'known' as const, value, source, observedAt: 100 })
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
          priceBasis,
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

function machine(suffix: string, amountMinor: number): ResolvedComparisonSelection {
  const known = <T>(value: T) => ({ kind: 'known' as const, value, source, observedAt: 100 })
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
      category: 'Machine data',
      summary: 'Published machine facts.',
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'machine_data:v1',
          interfaceFormat: known('graphql'),
          requestMethod: known('POST'),
          authentication: known('api_key'),
          priceBasis: known({
            description: 'AUD 0.01 per request',
            currency: 'AUD',
            amountMinor,
            unit: 'request',
          }),
          freshnessOrUpdateCadence: known('Every minute'),
        },
      },
    },
    publication: { publishedAt: 90, safeDisplayDisposition: 'retain_safe_history' },
    projectionDisposition: 'current',
    resolvedAt: 150,
  }
}

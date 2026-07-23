import { describe, expect, it } from 'vitest'

import {
  resolveComparisonSelections,
  type ComparisonOfferingReadPort,
  type ComparisonSelectionRef,
} from '@/modules/comparison/public'

const ref = (suffix: string, revision = 1): ComparisonSelectionRef => ({
  businessId: `business:${suffix}`,
  offeringRef: `offering:${suffix}`,
  offeringRevision: revision,
  projectionObservedAt: 100,
})

describe('exact comparison selection resolution', () => {
  it('checks live suppression before historical facts and never reads facts after refusal', async () => {
    const calls: string[] = []
    const port: ComparisonOfferingReadPort = {
      readLiveAvailability: async () => {
        calls.push('live')
        return { kind: 'unavailable', reason: 'business_suppressed' }
      },
      readExactPublicOffering: async () => {
        calls.push('history')
        throw new Error('suppressed history must never be read')
      },
    }

    const result = await resolveComparisonSelections({
      state: { version: 'offering-comparison:v1', selections: [ref('hidden')], priorities: [] },
      resolvedAt: 200,
      port,
    })

    expect(calls).toEqual(['live'])
    expect(result).toEqual({
      kind: 'resolved',
      disposition: 'partial',
      selections: [],
      refusals: [{
        selection: ref('hidden'),
        reason: 'business_suppressed',
      }],
    })
  })

  it.each([
    ['wrong business', 'business_mismatch'],
    ['never-public history', 'never_public'],
    ['source mismatch', 'source_hash_mismatch'],
  ] as const)('returns unavailable without facts for %s', async (_label, reason) => {
    const port = portFor({
      history: async () => ({ kind: 'unavailable', reason }),
    })
    const result = await resolveComparisonSelections({
      state: { version: 'offering-comparison:v1', selections: [ref('refused')], priorities: [] },
      resolvedAt: 200,
      port,
    })

    expect(result).toMatchObject({
      disposition: 'partial',
      selections: [],
      refusals: [{ reason }],
    })
    expect(JSON.stringify(result)).not.toContain('private facts')
  })

  it('preserves an exact old revision and reports the newer current reference separately', async () => {
    const selected = ref('studio', 1)
    const result = await resolveComparisonSelections({
      state: { version: 'offering-comparison:v1', selections: [selected], priorities: [] },
      resolvedAt: 200,
      port: portFor({
        live: async () => ({
          kind: 'available',
          currentReference: {
            businessId: selected.businessId,
            offeringRef: selected.offeringRef,
            offeringRevision: 2,
          },
        }),
        history: async () => exact(selected),
      }),
    })

    expect(result).toMatchObject({
      disposition: 'current',
      selections: [{
        selection: selected,
        offering: { revision: 1, name: 'Offering studio' },
        newerCurrentReference: {
          businessId: selected.businessId,
          offeringRef: selected.offeringRef,
          offeringRevision: 2,
        },
      }],
    })
    expect(result.kind === 'resolved' && result.selections[0]?.offering.revision).toBe(1)
  })

  it('treats projectionObservedAt as context, never as a content selector', async () => {
    const selected = ref('observed')
    const seen: ComparisonSelectionRef[] = []
    const port = portFor({
      history: async (selection) => {
        seen.push(selection)
        return exact(selection)
      },
    })

    await resolveComparisonSelections({
      state: { version: 'offering-comparison:v1', selections: [selected], priorities: [] },
      resolvedAt: 200,
      port,
    })

    expect(seen).toEqual([selected])
    expect(Object.keys(seen[0] ?? {})).toEqual([
      'businessId',
      'offeringRef',
      'offeringRevision',
      'projectionObservedAt',
    ])
  })

  it('preserves valid selections in URL order when one selection is refused', async () => {
    const selections = [ref('first'), ref('refused'), ref('third')]
    const result = await resolveComparisonSelections({
      state: { version: 'offering-comparison:v1', selections, priorities: [] },
      resolvedAt: 200,
      port: portFor({
        live: async (selection) => selection.businessId === 'business:refused'
          ? { kind: 'unavailable', reason: 'offering_suppressed' }
          : { kind: 'available' },
      }),
    })

    expect(result).toMatchObject({
      disposition: 'partial',
      selections: [
        { selection: selections[0] },
        { selection: selections[2] },
      ],
      refusals: [{ selection: selections[1], reason: 'offering_suppressed' }],
    })
  })
})

function portFor(overrides: Readonly<{
  live?: ComparisonOfferingReadPort['readLiveAvailability']
  history?: ComparisonOfferingReadPort['readExactPublicOffering']
}> = {}): ComparisonOfferingReadPort {
  return {
    readLiveAvailability: overrides.live ?? (async () => ({ kind: 'available' })),
    readExactPublicOffering: overrides.history ?? (async (selection) => exact(selection)),
  }
}

function exact(selection: ComparisonSelectionRef) {
  return {
    kind: 'resolved' as const,
    business: {
      businessId: selection.businessId,
      slug: selection.businessId.replace('business:', ''),
      name: `Business ${selection.businessId.replace('business:', '')}`,
    },
    offering: {
      offeringRef: selection.offeringRef,
      revision: selection.offeringRevision,
      name: `Offering ${selection.offeringRef.replace('offering:', '')}`,
      category: 'Professional service',
      summary: 'Published comparison facts.',
      comparison: professionalComparison(100_00),
    },
    publication: { publishedAt: 90, safeDisplayDisposition: 'retain_safe_history' as const },
    projectionDisposition: 'current' as const,
  }
}

function professionalComparison(amountMinor: number) {
  const source = { kind: 'business_supplied' as const }
  const known = <T>(value: T) => ({ kind: 'known' as const, value, source, observedAt: 90 })
  return {
    schemaVersion: 'offering-comparison:v1' as const,
    profile: {
      profileId: 'professional_service:v1' as const,
      scopeBasis: known('Brochure website'),
      priceBasis: known({
        description: 'Published total',
        currency: 'AUD',
        amountMinor,
        unit: 'total' as const,
      }),
      timingBasis: known('Four weeks'),
      serviceArea: known('Perth'),
    },
  }
}

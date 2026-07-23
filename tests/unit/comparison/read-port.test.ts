import { describe, expect, it, vi } from 'vitest'

import {
  createComparisonOfferingReadPort,
  type PublicComparisonOfferingTransportResult,
} from '@/modules/comparison/comparison.functions'
import {
  resolveComparisonSelections,
  type ComparisonSelectionRef,
} from '@/modules/comparison/public'

const reference = {
  businessId: 'business:studio',
  offeringRef: 'offering:studio',
  offeringRevision: 1,
}

describe('request-scoped comparison Offering read port', () => {
  it('memoizes one hash-free source read across live and exact projections', async () => {
    const read = vi.fn(async () => resolvedTransport())
    const port = createComparisonOfferingReadPort({ read })

    await expect(port.readLiveAvailability(reference)).resolves.toEqual({
      kind: 'available',
      currentReference: {
        businessId: 'business:studio',
        offeringRef: 'offering:studio',
        offeringRevision: 2,
      },
    })
    await expect(port.readExactPublicOffering(reference)).resolves.toMatchObject({
      kind: 'resolved',
      offering: { revision: 1, name: 'Original service' },
    })

    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith({
      businessId: 'business:studio',
      offeringRef: 'offering:studio',
      revision: 1,
    })
    expect(JSON.stringify(read.mock.calls)).not.toContain('sourceHash')
  })

  it.each([
    null,
    { kind: 'resolved', business: {}, offering: {} },
    { kind: 'unavailable', reason: 'invented_reason' },
    { ...resolvedTransport(), sourceHash: 'sha256:leak' },
  ])('strictly refuses malformed or hash-bearing transport without throwing', async (transport) => {
    const port = createComparisonOfferingReadPort({ read: async () => transport })
    await expect(port.readExactPublicOffering(reference)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'revision_unavailable',
    })
  })

  it('preserves valid siblings and URL order while reading each tuple once', async () => {
    const reads: string[] = []
    const selections = ['first', 'hidden', 'third'].map(selection)
    const port = createComparisonOfferingReadPort({
      read: async ({ offeringRef }) => {
        reads.push(offeringRef)
        return offeringRef === 'offering:hidden'
          ? { kind: 'unavailable', reason: 'business_suppressed' }
          : resolvedTransport(offeringRef.replace('offering:', ''))
      },
    })

    const result = await resolveComparisonSelections({
      state: {
        version: 'offering-comparison:v1',
        selections,
        priorities: [],
      },
      resolvedAt: 200,
      port,
    })

    expect(result).toMatchObject({
      disposition: 'partial',
      selections: [
        { selection: selections[0] },
        { selection: selections[2] },
      ],
      refusals: [{ selection: selections[1], reason: 'business_suppressed' }],
    })
    expect(reads).toEqual(['offering:first', 'offering:hidden', 'offering:third'])
  })
})

function selection(suffix: string): ComparisonSelectionRef {
  return {
    businessId: `business:${suffix}`,
    offeringRef: `offering:${suffix}`,
    offeringRevision: 1,
    projectionObservedAt: 100,
  }
}

function resolvedTransport(suffix = 'studio'): PublicComparisonOfferingTransportResult {
  return {
    kind: 'resolved',
    business: {
      businessId: `business:${suffix}`,
      slug: suffix,
      name: `Business ${suffix}`,
    },
    offering: {
      offeringRef: `offering:${suffix}`,
      revision: 1,
      name: 'Original service',
      category: 'Professional service',
      summary: 'Exact facts.',
    },
    publication: {
      publishedAt: 10,
      safeDisplayDisposition: 'retain_safe_history',
    },
    projectionDisposition: 'current',
    currentReference: {
      businessId: `business:${suffix}`,
      offeringRef: `offering:${suffix}`,
      offeringRevision: 2,
    },
  }
}

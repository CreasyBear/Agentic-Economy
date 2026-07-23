import { describe, expect, it, vi } from 'vitest'

import { LOCAL_E2E_COMPARISON_FIXTURES } from '@/lib/dev/local-e2e-comparison-fixtures'
import {
  createComparisonOfferingReadPort,
  type PublicComparisonOfferingTransportResult,
} from '@/modules/comparison/comparison.functions'
import {
  configuredLocalE2EComparisonRead,
  readLocalE2EComparisonFixture,
} from '@/modules/comparison/internal/local-e2e-read-port'
import {
  resolveComparisonSelections,
  type ComparisonSelectionRef,
} from '@/modules/comparison/public'
import {
  adaptLegacyCatalogToOfferingApi,
  createLocalE2eRegistrySourceState,
  listPublicBusinessCatalog,
} from '@/modules/registry/public'

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

  it('keeps labelled local exact records aligned with registry nominations without deriving their facts', async () => {
    const registry = listPublicBusinessCatalog(
      createLocalE2eRegistrySourceState(),
      { limit: 50 },
    ).items.map(adaptLegacyCatalogToOfferingApi)
    const nominated = new Set(registry.flatMap((business) => (
      business.offerings.map((offering) => (
        `${business.businessId}\u0000${offering.offeringRef}\u0000${offering.revision}`
      ))
    )))
    const fixtureNominations = LOCAL_E2E_COMPARISON_FIXTURES
      .filter((fixture) => fixture.offering.revision === 1)
      .map((fixture) => (
        `${fixture.business.businessId}\u0000${fixture.offering.offeringRef}\u0000${fixture.offering.revision}`
      ))

    expect(fixtureNominations.every((tuple) => nominated.has(tuple))).toBe(true)
    expect(JSON.stringify(LOCAL_E2E_COMPARISON_FIXTURES)).not.toMatch(
      /sourceHash|evidenceRef|credential|private:/i,
    )

    const old = LOCAL_E2E_COMPARISON_FIXTURES[0]
    const port = createComparisonOfferingReadPort({
      read: readLocalE2EComparisonFixture,
    })
    await expect(port.readLiveAvailability({
      businessId: old.business.businessId,
      offeringRef: old.offering.offeringRef,
      offeringRevision: old.offering.revision,
    })).resolves.toEqual({
      kind: 'available',
      currentReference: {
        businessId: old.business.businessId,
        offeringRef: old.offering.offeringRef,
        offeringRevision: 2,
      },
    })
    await expect(port.readExactPublicOffering({
      businessId: old.business.businessId,
      offeringRef: old.offering.offeringRef,
      offeringRevision: 2,
    })).resolves.toMatchObject({
      kind: 'resolved',
      offering: { revision: 2 },
      publication: { safeDisplayDisposition: 'retain_safe_history' },
    })
  })

  it('selects the fixture adapter only through the fail-closed local E2E guard', () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'false')
    vi.stubEnv('NODE_ENV', 'test')
    expect(configuredLocalE2EComparisonRead()).toBeUndefined()

    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => configuredLocalE2EComparisonRead()).toThrow(
      'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production.',
    )

    vi.stubEnv('NODE_ENV', 'test')
    expect(configuredLocalE2EComparisonRead()).toBe(readLocalE2EComparisonFixture)
    vi.unstubAllEnvs()
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

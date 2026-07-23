import { describe, expect, it, vi } from 'vitest'

import { resolveColdStartSourceDecision } from '@/modules/answer-thread/internal/turns/retrieval-first'
import type { OfferingAnswerSource } from '@/modules/answer/public'
import type {
  ComparisonOfferingReadPort,
  ExactOfferingReference,
} from '@/modules/comparison/public'

const confirmedConstraintIds = [
  'website:v1:simple',
  'website:v1:small_startup',
  'website:v1:perth_local_preference',
  'website:v1:affordability_preference',
  'website:v1:indicative_price_requested',
] as const

describe('cold-start exact Offering resolution', () => {
  it('uses exact source publication facts instead of candidate observation or disposition', async () => {
    const source = candidate('one', {
      observedAt: 999_999,
      disposition: 'stale',
      pricingSummary: 'Candidate says free',
    })
    const readLiveAvailability = vi.fn(async () => ({
      kind: 'available' as const,
    }))
    const readExactPublicOffering = vi.fn(async (reference: ExactOfferingReference) => (
      exactResolved(reference, 'Exact published AUD 1500', 25)
    ))

    const result = await resolveColdStartSourceDecision({
      sources: [source],
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds,
      port: { readLiveAvailability, readExactPublicOffering },
      resolvedAt: 150,
    })

    expect(readLiveAvailability).toHaveBeenCalledWith({
      businessId: 'business:one',
      offeringRef: 'offering:one',
      offeringRevision: 1,
    })
    expect(readExactPublicOffering).toHaveBeenCalledOnce()
    expect(result.prices).toContainEqual({
      evidenceClass: 'provider_published_price',
      value: 'Exact published AUD 1500',
    })
    expect(JSON.stringify(result)).not.toContain('Candidate says free')
    expect(JSON.stringify(result)).not.toContain('999999')
  })

  it('turns a suppressed candidate into an exact refusal without reading hidden history', async () => {
    const readExactPublicOffering = vi.fn()
    const port: ComparisonOfferingReadPort = {
      readLiveAvailability: vi.fn(async () => ({
        kind: 'unavailable' as const,
        reason: 'offering_suppressed' as const,
      })),
      readExactPublicOffering,
    }

    const result = await resolveColdStartSourceDecision({
      sources: [candidate('suppressed')],
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds,
      port,
      resolvedAt: 150,
    })

    expect(result).toMatchObject({
      outcome: 'no_current_match',
      searchedRegisteredSupplyCount: 1,
    })
    expect(readExactPublicOffering).not.toHaveBeenCalled()
  })

  it('runs the exact live gate and historical resolver for every nominated candidate', async () => {
    const readLiveAvailability = vi.fn(async () => ({
      kind: 'available' as const,
    }))
    const readExactPublicOffering = vi.fn(async (reference: ExactOfferingReference) => (
      exactResolved(reference, `Exact ${reference.offeringRef}`, 25)
    ))

    await resolveColdStartSourceDecision({
      sources: [candidate('one'), candidate('two')],
      confirmedChoiceId: 'transactional',
      confirmedConstraintIds,
      port: { readLiveAvailability, readExactPublicOffering },
      resolvedAt: 150,
    })

    expect(readLiveAvailability).toHaveBeenCalledTimes(2)
    expect(readExactPublicOffering).toHaveBeenCalledTimes(2)
  })
})

function candidate(
  suffix: string,
  overrides: {
    observedAt?: number
    disposition?: 'current' | 'partial' | 'stale'
    pricingSummary?: string
  } = {},
): OfferingAnswerSource {
  return {
    sourceKind: 'offering_v2',
    citationIndex: 1,
    business: {
      businessId: `business:${suffix}`,
      slug: `business-${suffix}`,
      name: `Business ${suffix}`,
      category: 'Website',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: `/business-${suffix}`,
      observedAt: overrides.observedAt ?? 100,
      disposition: overrides.disposition ?? 'current',
      accessSummary: {
        humanRequest: false,
        externalOperation: false,
        aeSupportedAction: false,
      },
    },
    offerings: [{
      offeringRef: `offering:${suffix}`,
      revision: 1,
      name: `Website ${suffix}`,
      category: 'Website',
      summary: 'Candidate projection only.',
      ...(overrides.pricingSummary === undefined
        ? {}
        : { pricingSummary: overrides.pricingSummary }),
      accessPaths: [],
      support: { integrated: false, aeSupportedAction: false },
    }],
    detailUrl: `/business-${suffix}`,
  }
}

function exactResolved(
  reference: ExactOfferingReference,
  priceDescription: string,
  publishedAt: number,
) {
  const known = <T>(value: T) => ({
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 20,
  })
  const suffix = reference.businessId.slice('business:'.length)
  return {
    kind: 'resolved' as const,
    business: {
      businessId: reference.businessId,
      slug: `exact-${suffix}`,
      name: `Exact ${suffix}`,
    },
    offering: {
      offeringRef: reference.offeringRef,
      revision: reference.offeringRevision,
      name: `Exact Website ${suffix}`,
      category: 'Website',
      summary: 'Exact public history.',
      comparison: {
        schemaVersion: 'offering-comparison:v1' as const,
        profile: {
          profileId: 'professional_service:v1' as const,
          scopeBasis: known('Exact published scope'),
          priceBasis: known({
            description: priceDescription,
            currency: 'AUD',
            amountMinor: 150_000,
            unit: 'total' as const,
          }),
          timingBasis: known('Exact timing'),
          serviceArea: known('Exact service area'),
        },
      },
    },
    publication: {
      publishedAt,
      safeDisplayDisposition: 'retain_safe_history' as const,
    },
    projectionDisposition: 'current' as const,
  }
}

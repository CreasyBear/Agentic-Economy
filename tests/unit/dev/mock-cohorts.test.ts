import { describe, expect, it } from 'vitest'

import {
  DEV_SEED_BUSINESS_FIXTURES,
  buildDevSeedCatalogState,
} from '@/modules/dev/public'
import { searchPublicBusinessCatalog } from '@/modules/registry/internal/search'
import {
  resolveCheckupQuote,
  sandboxCheckupQuotePathForSlug,
} from '@/modules/sandbox-supply/public'

describe('development mock supply cohorts', () => {
  const bundle = buildDevSeedCatalogState()

  it.each([
    {
      label: 'wedding photographers',
      query: 'wedding photographer',
      mode: 'whole_catalogue' as const,
      slugs: ['bedford-photography', 'little-reed-weddings', 'rachel-levingston-photography'],
    },
    {
      label: 'Parramatta funeral services',
      query: 'funeral Parramatta',
      mode: 'whole_catalogue' as const,
      slugs: ['wn-bull-funerals-parramatta', 'funerals-of-compassion-parramatta', 'gregory-and-carr-parramatta'],
    },
    {
      label: 'Adelaide dentists',
      query: 'dentist Adelaide',
      mode: 'whole_catalogue' as const,
      slugs: ['adelaide-cbd-dentist', 'perfect-smile-adelaide', 'fixed-dental-adelaide'],
    },
  ])('registry.search returns the $label cohort', ({ query, mode, slugs }) => {
    const result = searchPublicBusinessCatalog(bundle.state, { query, mode, limit: 50 })
    const returnedSlugs = new Set(result.items.map((item) => item.slug))

    expect(result.kind).toBe('ok')
    expect(slugs.every((slug) => returnedSlugs.has(slug))).toBe(true)
    expect(slugs).toHaveLength(3)
  })

  it('quotes a priced dental cohort offering through the existing sandbox resolver seam', () => {
    const fixture = DEV_SEED_BUSINESS_FIXTURES.find(
      (candidate) => candidate.requestedSlug === 'adelaide-cbd-dentist',
    )
    if (fixture === undefined || fixture.pricingSummary === undefined) {
      throw new Error('The priced Adelaide dental cohort fixture is required.')
    }

    const slug = fixture.requestedSlug
    const result = resolveCheckupQuote({
      slug,
      requestedAt: Date.parse('2026-08-01T09:00:00.000Z'),
      offerings: [
        {
          name: fixture.serviceName,
          price: {
            kind: 'fixed',
            currency: 'AUD',
            amountMinor: 15_000,
            unit: 'visit',
            taxTreatment: 'inclusive',
          },
          accessPaths: [
            {
              kind: 'external_operation',
              url: `https://agentic.example${sandboxCheckupQuotePathForSlug(slug)}`,
              method: 'POST',
            },
          ],
        },
      ],
    })

    expect(result).toMatchObject({
      kind: 'ok',
      code: 'quoted',
      quote: {
        provenance: 'ae_sandbox_provider',
        slug: 'adelaide-cbd-dentist',
        service: 'Dental check-up and clean',
        price: { currency: 'AUD', amountMinor: 15_000, unit: 'visit' },
      },
    })
  })
})

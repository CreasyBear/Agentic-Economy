import { describe, expect, it } from 'vitest'

import {
  DEV_SEED_BUSINESS_COUNT,
  DEV_SEED_BUSINESS_FIXTURES,
  buildDevSeedCatalogState,
} from '@/modules/dev/public'

describe('buildDevSeedCatalogState', () => {
  it('builds inquiry-ready published businesses and support record', () => {
    const bundle = buildDevSeedCatalogState()

    expect(bundle.seededSlugs).toEqual(DEV_SEED_BUSINESS_FIXTURES.map((fixture) => fixture.requestedSlug))
    expect(bundle.seededSlugs).toHaveLength(DEV_SEED_BUSINESS_COUNT)
    expect(bundle.state.businesses).toHaveLength(DEV_SEED_BUSINESS_FIXTURES.length)
    expect(bundle.state.businesses).toHaveLength(100)
    expect(bundle.state.businesses.every((business) => business.publicStatus === 'published')).toBe(true)
    expect(bundle.state.offerings.every((offering) => offering.status === 'published')).toBe(true)
    expect(bundle.state.businesses.filter((business) => business.name.startsWith('Sandbox Option'))).toMatchObject([
      { slug: 'sandbox-option-one', publicStatus: 'published', claimStatus: 'published' },
      { slug: 'sandbox-option-two', publicStatus: 'published', claimStatus: 'published' },
    ])
    expect(bundle.state.businesses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'joondalup-rapid-plumbing',
        publishedPhone: '0412 345 678',
      }),
      expect.objectContaining({
        slug: 'fremantle-coastal-electrical',
        publishedPhone: '(08) 9430 1234',
      }),
    ]))
    expect(
      bundle.state.businesses.find((business) => business.slug === 'plumbing-demo'),
    ).not.toHaveProperty('publishedPhone')
    expect(bundle.state.revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        serviceAreaSummary: 'Joondalup and nearby suburbs',
        availabilitySummary: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
      }),
      expect.objectContaining({
        serviceAreaSummary: 'Fremantle and nearby suburbs',
        availabilitySummary: 'Mon–Sat 8am–6pm',
      }),
    ]))
    expect(bundle.state.accessPaths).toEqual(expect.arrayContaining([
      expect.objectContaining({
        descriptor: expect.objectContaining({ kind: 'human_request', channel: 'phone' }),
      }),
    ]))
    expect(bundle.supportRecord.capability).toBe('human_inquiry_owner_inbox')
    expect(bundle.supportRecord.supportedChannels).toContain('public_inquiry')
  })

  it('seeds both supplied and genuinely missing decision facts', () => {
    const offerings = DEV_SEED_BUSINESS_FIXTURES.flatMap((fixture) => fixture.offerings)
    const withHours = offerings.filter((offering) => offering.availabilitySummary !== 'Hours unknown')
    const withoutHours = offerings.filter((offering) => offering.availabilitySummary === 'Hours unknown')
    const withPrice = offerings.filter((offering) => offering.pricingSummary !== undefined)

    // A catalog that only demonstrates one state proves nothing about the other.
    expect(withHours.length).toBeGreaterThan(0)
    expect(withoutHours.length).toBeGreaterThan(0)
    expect(withPrice.length).toBeGreaterThan(0)
    expect(withPrice.length).toBeLessThan(offerings.length)

    // The sentinel the public projection drops must never be seeded as if it
    // were a published fact: it reads as "the owner told us", and nobody did.
    expect(offerings.map((offering) => offering.availabilitySummary))
      .not.toContain('Hours supplied by owner')

    // Price and hours are independent facts; at least one fixture publishes a
    // price without hours so no surface may assume they travel together.
    expect(withoutHours.some((offering) => offering.pricingSummary !== undefined)).toBe(true)

    // A leaked development price must not read as a real market quote.
    for (const offering of withPrice) {
      expect(offering.pricingSummary).toMatch(/^Demo price — /)
    }
  })
})

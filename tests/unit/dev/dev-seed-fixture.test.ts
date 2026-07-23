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
    expect(bundle.state.businesses.filter((business) => business.name.startsWith('Sandbox Option'))).toMatchObject([
      { slug: 'sandbox-option-one', publicStatus: 'published', claimStatus: 'published' },
      { slug: 'sandbox-option-two', publicStatus: 'published', claimStatus: 'published' },
    ])
    const phase5DemoBusinessIds = new Set(bundle.state.businesses
      .filter((business) => business.slug.startsWith('sandbox-phase5-'))
      .map((business) => business.businessId))
    const phase5DemoCapabilities = bundle.state.serviceCapabilities.filter(
      (capability) => phase5DemoBusinessIds.has(capability.businessId),
    )
    expect(phase5DemoCapabilities).toHaveLength(4)
    expect(phase5DemoCapabilities.every((capability) => (
      capability.firstRequest.mode === 'not_available_yet'
      && capability.firstRequest.publicChannel === 'not_available'
      && capability.callable === false
    ))).toBe(true)
    expect(bundle.state.serviceCapabilities
      .filter((capability) => !phase5DemoBusinessIds.has(capability.businessId))
      .every((capability) => capability.firstRequest.mode === 'inquiry_available')).toBe(true)
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
    expect(bundle.state.businessServices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        serviceArea: 'Joondalup and nearby suburbs',
        hoursOrUnknown: 'Mon–Fri 7am–5pm',
      }),
      expect.objectContaining({
        serviceArea: 'Fremantle and nearby suburbs',
        hoursOrUnknown: 'Mon–Sat 8am–6pm',
      }),
    ]))
    expect(bundle.supportRecord.capability).toBe('human_inquiry_owner_inbox')
    expect(bundle.supportRecord.supportedChannels).toContain('public_inquiry')
  })
})

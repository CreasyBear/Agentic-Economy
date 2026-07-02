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
    expect(
      bundle.state.serviceCapabilities.every((capability) => capability.firstRequest.mode === 'inquiry_available')
    ).toBe(true)
    expect(bundle.supportRecord.capability).toBe('human_inquiry_owner_inbox')
    expect(bundle.supportRecord.supportedChannels).toContain('public_inquiry')
  })
})

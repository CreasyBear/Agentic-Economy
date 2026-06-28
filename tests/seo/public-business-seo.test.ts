import { describe, expect, it } from 'vitest'

import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'

describe('public business SEO builder', () => {
  it('builds canonical metadata and schema without ratings, offers, or payments', () => {
    const readback = getDefaultPublicOwnerStatusReadback()
    const seo = buildPublicBusinessSeo({
      catalog: readback.catalog,
      options: { canonicalBaseUrl: 'https://ae.example/' },
    })
    const jsonLd = serializeJsonLd(seo.jsonLd)

    expect(seo).toMatchObject({
      slug: 'parramatta-emergency-plumbing',
      h1: 'Parramatta Emergency Plumbing',
      canonicalUrl: 'https://ae.example/parramatta-emergency-plumbing',
      indexDirective: 'index',
    })
    expect(seo.title).toContain('Emergency pipe repair')
    expect(seo.description).toContain('Parramatta, NSW')
    expect(jsonLd).toContain('LocalBusiness')
    expect(jsonLd).toContain('Service')
    expect(jsonLd).toContain('BreadcrumbList')
    expect(jsonLd).not.toMatch(/AggregateRating|Review|Offer|paymentAccepted|priceRange/)
  })
})

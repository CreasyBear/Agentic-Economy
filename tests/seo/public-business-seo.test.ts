import { describe, expect, it } from 'vitest'

import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'
import { handleBusinessDetailRequest } from '@/routes/api.businesses.$slug'

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

  it('serves the public business JSON route as a public catalog subset only', async () => {
    const response = handleBusinessDetailRequest('parramatta-emergency-plumbing')
    const body = await response.json()
    const serialized = JSON.stringify(body)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toMatchObject({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v1',
      business: {
        slug: 'parramatta-emergency-plumbing',
        publicStatus: 'published',
        services: [
          {
            slug: 'emergency-pipe-repair',
            status: 'published',
            capabilities: [{ kind: 'phone_inquiry', status: 'unavailable' }],
          },
        ],
      },
    })
    expect(serialized).not.toMatch(
      /businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|MCP|OpenAPI|callable|paymentRequired/
    )
  })
})

import { describe, expect, it, vi } from 'vitest'

import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'

describe('public business SEO builder', () => {
  it('builds canonical metadata and schema without ratings, offers, or payments', () => {
    const readback = getDefaultPublicOwnerStatusReadback()
    const seo = buildPublicBusinessSeo({
      catalog: readback.catalog,
      options: { canonicalBaseUrl: 'https://ae.example/' },
    })
    const jsonLd = serializeJsonLd(seo.jsonLd)
    const offeringJsonLd = seo.jsonLd.find((item) => item['@type'] === 'Service')
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
    expect(offeringJsonLd).toMatchObject({
      '@id': expect.stringContaining('#offering-'),
      name: 'Emergency pipe repair',
      serviceType: 'Emergency plumbing',
      description: 'Burst pipe triage and repair for urgent local plumbing jobs.',
      areaServed: 'Parramatta and nearby suburbs',
    })
    expect(jsonLd).not.toMatch(/AggregateRating|Review|Offer|paymentAccepted|priceRange/)
  })

  /**
   * The durable handler reaches the configured source first, and the registry
   * seam fails loudly rather than falling back when no source URL is set. Pin
   * the explicit local catalog so this asserts the response contract instead
   * of whatever happens to be in a shared deployment.
   */
  it('serves the public business JSON route as a public catalog subset only', async () => {
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    vi.stubEnv('CONVEX_URL', undefined)
    vi.stubEnv('VITE_CONVEX_URL', undefined)

    try {
      await assertPublicCatalogSubsetResponse()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})


async function assertPublicCatalogSubsetResponse(): Promise<void> {
  const response = await handleDurableBusinessDetailRequest('parramatta-emergency-plumbing')
  const body = await response.json()
  const serialized = JSON.stringify(body)

  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(body).toMatchObject({
    kind: 'found',
    schemaVersion: 'public-business-catalog-api:v2',
    business: {
      slug: 'parramatta-emergency-plumbing',
      trustTier: 'claimed',
      offerings: [
        { name: 'Emergency pipe repair' },
      ],
    },
  })
  // `businessId` is deliberately absent from this list: the Offering
  // projection publishes it as a stable public reference, exactly as the
  // UCP manifest already does. Every other identifier here stays private.
  expect(serialized).not.toMatch(
    /serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|MCP|OpenAPI|callable|paymentRequired/
  )
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { getPublicBusinessCatalog, getPublicBusinessPageReadback } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  createDefaultDiscoverySourceState,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import {
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleDurableListBusinessesRequest } from '@/routes/api.businesses'
import { handleDurableSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleLlmsTxtRequest } from '@/routes/llms[.]txt'
import { handleRobotsTxtRequest } from '@/routes/robots[.]txt'
import { handleSiteDiscoveryManifestRequest } from '@/routes/[.]well-known/ucp'
import { handleSitemapXmlRequest } from '@/routes/sitemap[.]xml'
import { handleUcpManifestRequest } from '@/routes/$slug.ucp'
import { handleDeveloperDiscoveryFixturesRequest } from '@/routes/api.discovery.fixtures'
import { handleCustomerRequestContractSchemaGet } from '@/routes/api.v1.requests.schema'
import { handleAgentCustomerRequestPost } from '@/lib/server/customer-request-agent-api'
import { createDurablePublishedDiscoveryState } from '../fixtures/discovery-published-state'

beforeEach(() => {
  // `.env.development.local` sets a machine-specific canonical host, which
  // otherwise leaks into every generated discovery artifact and makes this
  // parity assertion depend on whose laptop is running it.
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://ae.example')
  vi.stubEnv('AE_CANONICAL_HOST_ALLOWLIST', 'ae.example')
})

afterEach(() => {
  vi.unstubAllEnvs()
})
/**
 * Every case here asserts parity between advertised discovery output and the
 * routes that serve it. The durable route handlers reach the configured source
 * first, so without pinning the explicit local catalog these assert against
 * whatever a shared deployment currently holds.
 */
describe('discovery route parity', () => {
  let restoreLocalBypass: (() => void) | undefined

  beforeEach(() => {
    const previous = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    restoreLocalBypass = () => {
      if (previous === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
        return
      }
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previous
    }
  })

  afterEach(() => {
    restoreLocalBypass?.()
    restoreLocalBypass = undefined
  })

  it('tracks one durable catalog and suppression across public page, registry projections, UCP, llms, and sitemap', async () => {
    const state = createDurablePublishedDiscoveryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
      idPrefix: 'discovery-parity-test',
    })

    const page = getPublicBusinessCatalog(state, {
      slug: brandNonEmpty('fremantle-heat-pump-repairs', 'Slug'),
      indexStatus: 'indexed',
      discoveryStatus: 'available',
    })
    const registryList = listPublicBusinessCatalog(state)
    const registrySearch = searchPublicBusinessCatalog(state, {
      query: 'heat pump fremantle',
    })
    const apiDetail = getPublicBusinessCatalogBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })
    const generated = regenerateDiscoveryManifest(
      state,
      { slug: brandNonEmpty('fremantle-heat-pump-repairs', 'Slug') },
      { canonicalBaseUrl: 'https://ae.example', now: 13_000 },
    )
    if (generated.kind !== 'ok') {
      throw new Error(`Expected source UCP manifest to generate: ${generated.reason}`)
    }
    const ucp = generated.manifest
    const llms = buildLlmsTxt(state, { canonicalBaseUrl: 'https://ae.example' })
    const sitemap = buildSitemapXml(state, { canonicalBaseUrl: 'https://ae.example', now: 13_000 })
    const fixtures = await (
      await handleDeveloperDiscoveryFixturesRequest(new Request('https://ae.example/api/discovery/fixtures'), state, {
        now: 13_000,
      })
    ).json()

    expect(page).toMatchObject({
      kind: 'available',
      catalog: { slug: 'fremantle-heat-pump-repairs', name: 'Fremantle Heat Pump Repairs' },
    })
    expect(registryList.items.map((item) => item.slug)).toEqual(['fremantle-heat-pump-repairs'])
    expect(registrySearch.items.map((item) => item.slug)).toEqual(['fremantle-heat-pump-repairs'])
    expect(apiDetail).toMatchObject({
      kind: 'found',
      business: { slug: 'fremantle-heat-pump-repairs', name: 'Fremantle Heat Pump Repairs' },
    })
    expect(ucp).toMatchObject({
      slug: 'fremantle-heat-pump-repairs',
      businessName: 'Fremantle Heat Pump Repairs',
    })
    expect(llms.body).toContain('slug=fremantle-heat-pump-repairs')
    expect(sitemap.body).toContain('https://ae.example/fremantle-heat-pump-repairs')
    expect(fixtures).toMatchObject({
      kind: 'public_catalog_fixture_bundle',
      state: 'available',
    })
    expect(fixtures.examples).toEqual([
      expect.objectContaining({ slug: 'fremantle-heat-pump-repairs', name: 'Fremantle Heat Pump Repairs' }),
    ])
    expect(fixtures.routeHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: 'https://ae.example/api/businesses',
          status: 'available',
        }),
        expect.objectContaining({
          route: 'https://ae.example/api/businesses/search?q=',
          status: 'available',
        }),
        expect.objectContaining({
          route: 'https://ae.example/api/businesses/{slug}',
          status: 'available',
        }),
        expect.objectContaining({
          route: 'https://ae.example/{slug}/ucp',
          status: 'available',
        }),
      ])
    )
    expect(JSON.stringify({ page, registryList, registrySearch, apiDetail, ucp, llms })).not.toContain(
      'parramatta-emergency-plumbing'
    )

    suppressFirstBusiness(state)

    const suppressedPage = getPublicBusinessCatalog(state, {
      slug: brandNonEmpty('fremantle-heat-pump-repairs', 'Slug'),
      indexStatus: 'indexed',
      discoveryStatus: 'available',
    })
    const suppressedRegistryList = listPublicBusinessCatalog(state)
    const suppressedRegistrySearch = searchPublicBusinessCatalog(state, {
      query: 'heat pump fremantle',
    })
    const suppressedDetail = getPublicBusinessCatalogBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })
    const suppressedGenerated = regenerateDiscoveryManifest(
      state,
      { slug: brandNonEmpty('fremantle-heat-pump-repairs', 'Slug') },
      { canonicalBaseUrl: 'https://ae.example', now: 13_000 },
    )
    const suppressedLlms = buildLlmsTxt(state, { canonicalBaseUrl: 'https://ae.example' })
    const suppressedSitemap = buildSitemapXml(state, { canonicalBaseUrl: 'https://ae.example', now: 13_000 })

    expect(suppressedPage).toEqual({ kind: 'hidden', reason: 'not_published' })
    expect(suppressedRegistryList.items).toEqual([])
    expect(suppressedRegistrySearch.items).toEqual([])
    expect(suppressedDetail).toEqual({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    })
    expect(suppressedGenerated).toEqual({
      kind: 'error',
      code: 'discovery_manifest_not_public',
      reason: 'no_public_catalog',
      retryable: false,
    })
    expect(suppressedLlms.body).not.toContain('fremantle-heat-pump-repairs')
    expect(suppressedSitemap.body).not.toContain('fremantle-heat-pump-repairs')
  })

  it('keeps every URL advertised by explicit local manifest, llms, sitemap, and robots outputs resolvable', async () => {
    const origin = 'https://ae.example'
    const state = createDefaultDiscoverySourceState()
    const manifestResponse = handleUcpManifestRequest(
      new Request(`${origin}/parramatta-emergency-plumbing/ucp`),
      'parramatta-emergency-plumbing'
    )
    const manifest = await manifestResponse.json()
    const llms = buildLlmsTxt(state, { canonicalBaseUrl: origin })
    const sitemap = buildSitemapXml(state, { canonicalBaseUrl: origin, now: 0 })
    const robots = buildRobotsTxt({ canonicalBaseUrl: origin })
    const urls = uniqueUrls([
      ...manifest.routes.map((route: { url: string }) => route.url),
      ...llms.urls,
      ...sitemap.urls,
      ...sitemapLocs(sitemap.body),
      ...robots.urls,
    ])

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      const resolved = await resolveAdvertisedUrl(url)
      expect(resolved, url).toBe(true)
    }
  })

  it('keeps llms API routes aligned with public API response schemas', async () => {
    const origin = 'https://ae.example'
    const llms = buildLlmsTxt(createDefaultDiscoverySourceState(), { canonicalBaseUrl: origin })
    const listUrl = llms.urls.find((url) => new URL(url).pathname === '/api/businesses')
    const searchUrl = llms.urls.find((url) => new URL(url).pathname === '/api/businesses/search')
    const detailUrl = llms.urls.find((url) => new URL(url).pathname === '/api/businesses/parramatta-emergency-plumbing')

    if (listUrl === undefined || searchUrl === undefined || detailUrl === undefined) {
      throw new Error('Expected llms API URLs to be present.')
    }

    const listBody = await (await handleDurableListBusinessesRequest(new Request(listUrl))).json()
    const searchBody = await (await handleDurableSearchBusinessesRequest(new Request(searchUrl))).json()
    const detailBody = await (await handleDurableBusinessDetailRequest('parramatta-emergency-plumbing')).json()

    // The contract under test is parity: every slug llms.txt advertises must
    // be served by the list route on the same schema. Which other businesses
    // the catalog holds is not this test's business.
    expect(listBody).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
    })
    const listPage = z.object({ items: z.array(z.object({ slug: z.string() })) }).parse(listBody)
    expect(listPage.items.map((item) => item.slug)).toContain('parramatta-emergency-plumbing')
    expect(searchBody).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v2',
      query: '',
      items: [],
    })
    expect(detailBody).toMatchObject({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v2',
      business: { slug: 'parramatta-emergency-plumbing' },
    })
  })
})

async function resolveAdvertisedUrl(url: string): Promise<boolean> {
  const parsed = new URL(url)
  const path = parsed.pathname

  if (path === '/') {
    return true
  }

  if (path === '/claim' || path === '/registry' || path === '/for-agents' || path === '/privacy/remove-business') {
    return true
  }

  if (path === '/api/v1/requests/schema') {
    return handleCustomerRequestContractSchemaGet().status === 200
  }

  if (path === '/llms.txt') {
    return handleLlmsTxtRequest(new Request(url)).status === 200
  }

  if (path === '/sitemap.xml') {
    return handleSitemapXmlRequest(new Request(url)).status === 200
  }

  if (path === '/robots.txt') {
    return handleRobotsTxtRequest(new Request(url)).status === 200
  }

  if (path === '/.well-known/ucp') {
    return handleSiteDiscoveryManifestRequest(new Request(url)).status === 200
  }

  if (path === '/api/businesses') {
    return (await handleDurableListBusinessesRequest(new Request(url))).status === 200
  }

  if (path === '/api/businesses/search') {
    return (await handleDurableSearchBusinessesRequest(new Request(url))).status === 200
  }

  if (path === '/api/v1/requests') {
    const response = await handleAgentCustomerRequestPost(new Request(url, { method: 'POST', body: '{}' }), {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
    })
    return response.status === 401
  }

  const detailMatch = /^\/api\/businesses\/([^/]+)$/u.exec(path)
  if (detailMatch?.[1] !== undefined) {
    return (await handleDurableBusinessDetailRequest(detailMatch[1])).status === 200
  }

  const ucpMatch = /^\/([^/]+)\/ucp$/u.exec(path)
  if (ucpMatch?.[1] !== undefined) {
    return handleUcpManifestRequest(new Request(url), ucpMatch[1]).status === 200
  }

  const pageMatch = /^\/([^/]+)$/u.exec(path)
  if (pageMatch?.[1] !== undefined) {
    return getPublicBusinessPageReadback(pageMatch[1]).kind === 'available'
  }

  return false
}

function sitemapLocs(body: string): readonly string[] {
  return Array.from(body.matchAll(/<loc>([^<]+)<\/loc>/gu), (match) => match[1] ?? '')
    .filter((url) => url.length > 0)
}

function uniqueUrls(urls: readonly string[]): readonly string[] {
  return Array.from(new Set(urls))
}




function suppressFirstBusiness(state: DiscoverySourceState): void {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected a business to suppress.')
  }

  business.publicStatus = 'suppressed'
  business.claimStatus = 'suppressed'
  business.suppressedAt = 12_000
  for (const service of state.businessServices.filter((candidate) => candidate.businessId === business.businessId)) {
    service.status = 'suppressed'
  }
  state.suppressionRules.push({
    targetType: 'business',
    targetRef: business.businessId,
    status: 'active',
    reasonCode: 'privacy_removal_requested',
    evidenceRefs: ['private:evidence:suppression'],
    createdByAdminRef: 'admin:test',
    createdAt: 12_000,
    beforePublicStatus: 'published',
    beforeClaimStatus: 'published',
  })
}

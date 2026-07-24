import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  getPublicBusinessCatalog,
  getPublicBusinessPageReadback,
  publishBusinessCatalog,
} from '@/modules/catalog/public'
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
import { handleBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import {
  handleListBusinessesRequest,
} from '@/routes/api.businesses'
import {
  handleSearchBusinessesRequest,
} from '@/routes/api.businesses.search'
import { handleLlmsTxtRequest } from '@/routes/llms[.]txt'
import { handleRobotsTxtRequest } from '@/routes/robots[.]txt'
import { handleSitemapXmlRequest } from '@/routes/sitemap[.]xml'
import { handleUcpManifestRequest } from '@/routes/$slug.ucp'
import { handleDeveloperDiscoveryFixturesRequest } from '@/routes/api.discovery.fixtures'
import { handleAgentCustomerRequestPost } from '@/lib/server/customer-request-agent-api'


beforeEach(() => {
  vi.stubEnv('AE_CANONICAL_HOST_ALLOWLIST', 'ae.example')
})

afterEach(() => {
  vi.unstubAllEnvs()
})
describe('discovery route parity', () => {
  it('tracks one durable catalog and suppression across public page, registry projections, UCP, llms, and sitemap', async () => {
    const state = createDurablePublishedDiscoveryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
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

    const listBody = await handleListBusinessesRequest(new Request(listUrl)).json()
    const searchBody = await handleSearchBusinessesRequest(new Request(searchUrl)).json()
    const detailBody = await handleBusinessDetailRequest('parramatta-emergency-plumbing').json()

    expect(listBody).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      items: [{ slug: 'parramatta-emergency-plumbing' }],
    })
    expect(searchBody).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      query: '',
      items: [],
    })
    expect(detailBody).toMatchObject({
      kind: 'found',
      schemaVersion: 'public-business-catalog-api:v1',
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

  if (path === '/claim' || path === '/registry' || path === '/privacy/remove-business') {
    return true
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

  if (path === '/api/businesses') {
    return handleListBusinessesRequest(new Request(url)).status === 200
  }

  if (path === '/api/businesses/search') {
    return handleSearchBusinessesRequest(new Request(url)).status === 200
  }

  if (path === '/api/v1/requests') {
    const response = await handleAgentCustomerRequestPost(new Request(url, { method: 'POST', body: '{}' }), {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
    })
    return response.status === 401
  }

  const detailMatch = /^\/api\/businesses\/([^/]+)$/u.exec(path)
  if (detailMatch?.[1] !== undefined) {
    return handleBusinessDetailRequest(detailMatch[1]).status === 200
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


function createDurablePublishedDiscoveryState(input: {
  businessName: string
  requestedSlug: string
  serviceName: string
  serviceQuery: string
  suburb: string
}): DiscoverySourceState {
  const state = emptyDiscoverySourceState()
  const claim = claimBusiness(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: `owner:${input.requestedSlug}`,
      displayName: input.businessName,
    },
    facts: {
      name: input.businessName,
      category: 'Heat pump repair',
      suburb: input.suburb,
      stateTerritory: 'WA',
      requestedSlug: input.requestedSlug,
      ownerMessage: 'Owner supplied durable source facts.',
      sourceRefs: [
        {
          label: `${input.businessName} service card`,
          evidenceRef: `private:evidence:${input.requestedSlug}`,
          sourceHash: brandNonEmpty(`hash:source:${input.requestedSlug}`, 'SourceHash'),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
      rateLimit: {
        scope: 'claim_submit',
        key: `discovery:${input.requestedSlug}`,
        now: 10_000,
        limit: 5,
        windowMs: 60_000,
      },
    },
    operationKey: operationKey(`claim:${input.requestedSlug}`),
    correlationId: correlationId(`claim:${input.requestedSlug}`),
    now: 10_000,
  })

  if (claim.kind === 'error') {
    throw new Error(`Expected durable claim fixture to publish: ${claim.reason}`)
  }

  const publish = publishBusinessCatalog(state, {
    actor: {
      kind: 'authenticated_owner',
      clerkUserId: `owner:${input.requestedSlug}`,
      displayName: input.businessName,
    },
    claimId: claim.claim.claimId,
    services: [
      {
        name: input.serviceName,
        category: 'Heat pump repair',
        summary: `${input.serviceName} for ${input.suburb} homes.`,
        serviceArea: `${input.serviceQuery} and nearby suburbs`,
        hoursOrUnknown: 'Weekdays by appointment',
        firstRequest: {
          mode: 'not_available_yet',
          publicChannel: 'not_available',
          publicDisclosure: 'This business has not published a request path.',
          noContactReason: 'Owner has not supplied public contact instructions.',
        },
      },
    ],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey(`publish:${input.requestedSlug}`),
    correlationId: correlationId(`publish:${input.requestedSlug}`),
    now: 11_000,
  })

  if (publish.kind === 'error') {
    throw new Error(`Expected durable publish fixture to publish: ${publish.reason}`)
  }

  return state
}

function emptyDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
    discoveryManifests: [],
    invalidationIntents: [],
  }
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

function matchingCsrf(key: string) {
  return {
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    allowedOrigins: ['https://ae.example'],
  }
}

function operationKey(value: string) {
  return brandNonEmpty(`op:discovery-parity-test:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`corr:discovery-parity-test:${value}`, 'CorrelationId')
}

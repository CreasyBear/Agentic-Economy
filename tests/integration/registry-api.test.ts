import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_E2E_BUSINESS_FIXTURES } from '../helpers/local-e2e-business-fixtures'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'

import { emptyRegistrySourceState } from '../fixtures/source-state'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  readPublicOfferingRegistryBusinessDetail,
  readPublicOfferingRegistryPage,
} from '@/modules/registry/registry.functions'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
} from '@/modules/registry/public'
import type {
  RegistrySourceState,
} from '@/modules/registry/public'
import { handleDurableListBusinessesRequest } from '@/routes/api.businesses'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import {
  handleDurableSearchBusinessesRequest,
  optionalHasPrice,
  optionalMaxPrice,
} from '@/routes/api.businesses.search'
import { handleDurableListServicesRequest } from '@/routes/api.v1.services'
import { handleDurableSearchServicesRequest } from '@/routes/api.v1.services.search'

const admittedLocalE2eBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find(
  (fixture) => fixture.inquiryAdmission === 'admitted',
)

if (admittedLocalE2eBusiness === undefined) {
  throw new Error('An admitted local E2E business fixture is required.')
}
const admittedLocalE2eOffering = admittedLocalE2eBusiness.offerings[0]

if (admittedLocalE2eOffering === undefined) {
  throw new Error('An admitted local E2E Offering fixture is required.')
}

describe('registry public API routes', () => {
  it('reads one non-default durable catalog through registry, search, API list, and API detail', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      offeringName: 'Heat pump diagnostics',
      offeringQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })

    const registry = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const search = searchPublicBusinessOfferingSupply(state, {
      query: 'heat pump fremantle',
      limit: 10,
    })
    const detail = getPublicBusinessOfferingSupplyBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })

    expect(registry.page.map((item) => item.slug)).toEqual([
      'fremantle-heat-pump-repairs',
    ])
    expect(registry).toMatchObject({
      kind: 'ok',
      page: [
        {
          slug: 'fremantle-heat-pump-repairs',
          name: 'Fremantle Heat Pump Repairs',
        },
      ],
      isDone: true,
    })
    expect(search).toMatchObject({
      kind: 'ok',
      query: 'heat pump fremantle',
      items: [{ slug: 'fremantle-heat-pump-repairs' }],
      pagination: { total: 1, hasMore: false },
    })
    expect(detail).toMatchObject({
      kind: 'found',
      business: {
        slug: 'fremantle-heat-pump-repairs',
        name: 'Fremantle Heat Pump Repairs',
        businessContext: {
          kind: 'local_human',
          suburb: 'Fremantle',
          stateTerritory: 'WA',
        },
        offerings: [
          { name: 'Heat pump diagnostics' },
        ],
      },
    })
    expect(JSON.stringify([registry, search, detail])).not.toContain(
      'demo-listed-provider',
    )
  })

  it('removes a suppressed durable catalog from registry, search, API list, and API detail', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      offeringName: 'Heat pump diagnostics',
      offeringQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })
    suppressFirstBusiness(state)
    const registry = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const search = searchPublicBusinessOfferingSupply(state, {
      query: 'heat pump fremantle',
      limit: 10,
    })
    const detail = getPublicBusinessOfferingSupplyBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })

    expect(registry).toMatchObject({
      kind: 'ok',
      page: [],
      isDone: true,
    })
    expect(search).toMatchObject({
      kind: 'ok',
      query: 'heat pump fremantle',
      items: [],
      pagination: { total: 0, hasMore: false },
    })
    expect(detail).toEqual({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No public business catalog exists for this slug.',
    })
  })

  it('keeps the shared admitted local fixture continuous across registry search, listing detail, and inquiry admission without contaminating the default source', async () => {
    vi.stubEnv('CONVEX_URL', undefined)
    vi.stubEnv('VITE_CONVEX_URL', undefined)
    let restoreLocalSource: (() => void) | undefined = installLocalE2eRegistrySourceForTests()

    try {
      const searchQuery = `${admittedLocalE2eOffering.name} ${admittedLocalE2eBusiness.suburb}`
      const registryResponse = await handleDurableSearchServicesRequest(
        new Request(`https://ae.example/api/v1/services/search?q=${encodeURIComponent(searchQuery)}`),
      )
      const registry = await registryResponse.json()
      const listing = await readPublicOfferingRegistryBusinessDetail({
        slug: admittedLocalE2eBusiness.requestedSlug,
      })

      if (listing.kind !== 'found') {
        throw new Error('Expected the admitted local E2E fixture to have a public listing.')
      }

      expect(registry).toMatchObject({
        query: searchQuery,
        kind: 'ok',
        services: [
          {
            id: admittedLocalE2eBusiness.requestedSlug,
            name: admittedLocalE2eBusiness.businessName,
            category: admittedLocalE2eBusiness.category,
          },
        ],
      })
      expect(listing.business).toMatchObject({
        slug: admittedLocalE2eBusiness.requestedSlug,
        name: admittedLocalE2eBusiness.businessName,
        category: admittedLocalE2eBusiness.category,
        businessContext: {
          kind: 'local_human',
          suburb: admittedLocalE2eBusiness.suburb,
          stateTerritory: admittedLocalE2eBusiness.stateTerritory,
          ...(admittedLocalE2eBusiness.publishedPhone === undefined
            ? {}
            : { publishedPhone: admittedLocalE2eBusiness.publishedPhone }),
        },
        offerings: [
          {
            name: admittedLocalE2eOffering.name,
            category: admittedLocalE2eOffering.category,
            summary: admittedLocalE2eOffering.summary,
            serviceAreaSummary: admittedLocalE2eOffering.serviceAreaSummary,
            availabilitySummary: admittedLocalE2eOffering.availabilitySummary,
          },
        ],
      })

      restoreLocalSource()
      restoreLocalSource = undefined

      await expect(handleDurableSearchServicesRequest(
        new Request(`https://ae.example/api/v1/services/search?q=${encodeURIComponent(searchQuery)}`),
      )).rejects.toThrow('CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.')
      await expect(readPublicOfferingRegistryPage({
        paginationOpts: { cursor: null, numItems: 50 },
      })).rejects.toThrow(
        'CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.',
      )
      await expect(readPublicOfferingRegistryBusinessDetail({
        slug: admittedLocalE2eBusiness.requestedSlug,
      })).rejects.toThrow(
        'CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.',
      )
      const defaultState = emptyRegistrySourceState()
      const defaultCatalog = listPublicBusinessOfferingSupply(defaultState, {
        paginationOpts: { cursor: null, numItems: 50 },
      })
      const defaultSearch = searchPublicBusinessOfferingSupply(defaultState, {
        query: searchQuery,
        limit: 50,
      })
      const defaultDetail = getPublicBusinessOfferingSupplyBySlug(defaultState, {
        slug: admittedLocalE2eBusiness.requestedSlug,
      })

      expect(defaultCatalog.page.map((item) => item.slug)).not.toContain(
        admittedLocalE2eBusiness.requestedSlug,
      )
      expect(defaultSearch.items.map((item) => item.slug)).not.toContain(
        admittedLocalE2eBusiness.requestedSlug,
      )
      expect(defaultDetail).toEqual({
        kind: 'not_found',
        code: 'business_not_found',
        reason: 'No public business catalog exists for this slug.',
      })
    } finally {
      restoreLocalSource?.()
      vi.unstubAllEnvs()
    }
  })

  it('keeps durable public DTOs strict across registry and API outputs', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      offeringName: 'Heat pump diagnostics',
      offeringQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
      publishedPhone: '1300 123 456',
    })

    const registry = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const search = searchPublicBusinessOfferingSupply(state, {
      query: 'heat pump',
      limit: 10,
    })
    const detail = getPublicBusinessOfferingSupplyBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })
    const serialized = JSON.stringify({ registry, search, detail })

    expect(serialized).not.toMatch(
      /ownerId|clerk|sourceHash|rawContact|admin|private:evidence|MCP|OpenAPI|apiKey|"callable"\s*:\s*true|"paymentRequired"\s*:\s*true/i,
    )
    expect(serialized).not.toContain('not_available_yet')
    expect(serialized).toContain('1300 123 456')
    expect(serialized).not.toMatch(
      /booking available|payment available|callable endpoint/i,
    )
  })

  describe('public catalog HTTP routes', () => {
    let restoreLocalSource: (() => void) | undefined

    beforeEach(() => {
      vi.stubEnv('CONVEX_URL', undefined)
      vi.stubEnv('VITE_CONVEX_URL', undefined)
      restoreLocalSource = installLocalE2eRegistrySourceForTests()
    })

    afterEach(() => {
      restoreLocalSource?.()
      restoreLocalSource = undefined
      vi.unstubAllEnvs()
    })

    it('lists eligible public business supply without private fields', async () => {
      const response = await handleDurableListBusinessesRequest(
        new Request('https://ae.example/api/businesses?limit=1'),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(body).toMatchObject({
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        page: [
          {
            slug: 'adelaide-listed-provider',
            publicUrl: '/adelaide-listed-provider',
            trustTier: 'claimed',
            disposition: 'partial',
            photos: [],
            offerings: [
              { offeringRef: 'offering:adelaide-listed-provider:listed-offering' },
            ],
          },
        ],
        isDone: false,
        continueCursor: '1',
      })
      expect(typeof body.page[0].observedAt).toBe('number')
      // v2 publishes a business identifier by contract.
      expect(body.page[0].businessId).toBe('business:adelaide-listed-provider')
      expect(JSON.stringify(body)).not.toMatch(
        /ownerId|clerk|sourceHash|rawContact|admin|private:evidence|callable|paymentRequired|MCP|OpenAPI/,
      )
    })
    it.each([
      ['businesses list', handleDurableListBusinessesRequest, 'https://ae.example/api/businesses?limit=-5'],
      ['businesses search', handleDurableSearchBusinessesRequest, 'https://ae.example/api/businesses/search?q=plumber&limit=-5'],
      ['services list', handleDurableListServicesRequest, 'https://ae.example/api/v1/services?limit=-5'],
      ['services search', handleDurableSearchServicesRequest, 'https://ae.example/api/v1/services/search?q=plumber&limit=-5'],
    ] as const)('rejects limit=-5 for %s with an RFC 9457 problem', async (_label, handler, url) => {
      const response = await handler(new Request(url))
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('application/problem+json')
      expect(body).toMatchObject({
        type: 'about:blank',
        title: 'Invalid argument',
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_query_parameter',
        detail: 'Too small: expected number to be >=1',
      })
    })
    it.each(['NaN', 'Infinity', '-Infinity', '0', '1.5', 'not-a-number'])(
      'rejects invalid limit %s with an RFC 9457 problem',
      async (limit) => {
        const response = await handleDurableListBusinessesRequest(
          new Request(`https://ae.example/api/businesses?limit=${limit}`),
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(response.headers.get('Content-Type')).toBe('application/problem+json')
        expect(body).toMatchObject({
          status: 400,
          kind: 'INVALID_ARGUMENT',
          code: 'invalid_query_parameter',
        })
      },
    )

    it.each([
      ['businesses list', handleDurableListBusinessesRequest, 'https://ae.example/api/businesses?cursor=not-a-valid-cursor'],
      ['businesses search', handleDurableSearchBusinessesRequest, 'https://ae.example/api/businesses/search?q=plumber&cursor=not-a-result'],
      ['services list', handleDurableListServicesRequest, 'https://ae.example/api/v1/services?cursor=not-a-valid-cursor'],
      ['services search', handleDurableSearchServicesRequest, 'https://ae.example/api/v1/services/search?q=plumber&cursor=not-a-result'],
    ] as const)('rejects an invalid cursor for %s with an RFC 9457 problem', async (_label, handler, url) => {
      const response = await handler(new Request(url))
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('application/problem+json')
      expect(body).toMatchObject({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_cursor',
      })
    })


    it('rejects an unknown search mode before running the search action', async () => {

      const response = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=plumber&mode=bogus'),
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('application/problem+json')
      expect(body).toMatchObject({
        type: 'about:blank',
        title: 'Invalid argument',
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_query_parameter',
        detail: 'Invalid search mode.',
      })
    })
    it('does not turn stop-word discovery prompts into an all-businesses result', async () => {
      const response = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=find+providers'),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        kind: 'ok',
        query: '',
        items: [],
        pagination: { total: 0, hasMore: false },
      })
    })
    it('searches deterministically across name, service, category, suburb, state, and service-area tokens', async () => {
      const response = await handleDurableSearchBusinessesRequest(
        new Request(
          'https://ae.example/api/businesses/search?q=listed+offering+parramatta',
        ),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        query: 'listed offering parramatta',
        items: [
          { slug: 'demo-listed-provider' },
        ],
        pagination: { total: 1, hasMore: false },
      })
    })

    it('keeps direct search scoped to the supplied local context', async () => {
      const perthResponse = await handleDurableSearchBusinessesRequest(
        new Request(
          'https://ae.example/api/businesses/search?q=listed+offering&mode=near_me&location=Perth',
        ),
      )
      const perthBody = await perthResponse.json()
      const parramattaResponse = await handleDurableSearchBusinessesRequest(
        new Request(
          'https://ae.example/api/businesses/search?q=listed+offering&mode=near_me&location=Parramatta',
        ),
      )
      const parramattaBody = await parramattaResponse.json()

      expect(perthBody).toMatchObject({
        kind: 'ok',
        query: 'listed offering',
        items: [],
        pagination: { total: 0, hasMore: false },
      })
      expect(parramattaBody).toMatchObject({
        kind: 'ok',
        query: 'listed offering',
        items: [
          { slug: 'demo-listed-provider' },
        ],
        pagination: { total: 1, hasMore: false },
      })
    })

    it.each(['paramata', 'parammata'])(
      'does not correct close suburb misspelling "%s" in registry search',
      async (query) => {
        const response = await handleDurableSearchBusinessesRequest(
          new Request(`https://ae.example/api/businesses/search?q=${query}`),
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({
          kind: 'ok',
          query,
          items: [],
          pagination: { total: 0, hasMore: false },
        })
      },
    )

    it('returns explicit empty search and 404 detail shapes', async () => {
      const emptySearch = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q='),
      )
      const emptyBody = await emptySearch.json()
      const missingDetail = await handleDurableBusinessDetailRequest('missing-business')
      const missingBody = await missingDetail.json()

      expect(emptySearch.status).toBe(200)
      expect(emptyBody).toMatchObject({
        kind: 'ok',
        query: '',
        items: [],
        pagination: { total: 0, hasMore: false },
      })
      expect(missingDetail.status).toBe(404)
      expect(missingBody).toEqual({
        type: 'about:blank',
        title: 'Not found',
        status: 404,
        detail: 'No public business catalog exists for this slug.',
        kind: 'NOT_FOUND',
        code: 'business_not_found',
      })
    })

    it('rejects an overlong business slug with an RFC 9457 problem', async () => {
      const response = await handleDurableBusinessDetailRequest('x'.repeat(201))
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('application/problem+json')
      expect(body).toMatchObject({
        status: 400,
        kind: 'INVALID_ARGUMENT',
        code: 'invalid_query_parameter',
      })
    })

    /**
     * Price filters are optional on a route agents already call. A value the
     * route cannot read is dropped, never turned into a 400: a malformed
     * budget must not cost the caller the whole search.
     */
    it('reads an exact price ceiling and ignores incomplete or malformed triples', () => {
      expect(optionalMaxPrice('USDC', '7000', '6')).toEqual({
        maxPrice: { currency: 'USDC', units: '7000', exponent: 6 },
      })
      expect(optionalMaxPrice(null, '7000', '6')).toEqual({})
      expect(optionalMaxPrice('USDC', null, '6')).toEqual({})
      expect(optionalMaxPrice('USDC', '7000', null)).toEqual({})
      expect(optionalMaxPrice('usdc', '7000', '6')).toEqual({})
      expect(optionalMaxPrice('USDC', '-1', '6')).toEqual({})
      expect(optionalMaxPrice('USDC', '07000', '6')).toEqual({})
      expect(optionalMaxPrice('USDC', '7000', '19')).toEqual({})
      expect(optionalMaxPrice('USDC', '7000', '6.5')).toEqual({})

      expect(optionalHasPrice('true')).toEqual({ hasPrice: true })
      expect(optionalHasPrice('1')).toEqual({ hasPrice: true })
      expect(optionalHasPrice('false')).toEqual({ hasPrice: false })
      expect(optionalHasPrice('0')).toEqual({ hasPrice: false })
      expect(optionalHasPrice(null)).toEqual({})
      expect(optionalHasPrice('maybe')).toEqual({})
    })

    it('accepts exact price parameters on the live search route without narrowing supply that published no price', async () => {
      const baseline = await (await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=listed+offering+parramatta'),
      )).json()
      const budgeted = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=listed+offering+parramatta&max_price_currency=USDC&max_price_units=7000&max_price_exponent=6'),
      )
      const malformed = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=listed+offering+parramatta&max_price_currency=usdc&max_price_units=07000'),
      )

      expect(budgeted.status).toBe(200)
      expect(malformed.status).toBe(200)
      // This seed publishes prose pricing only. A budget must leave it alone:
      // `pricingSummary` is never read as a number.
      expect(await budgeted.json()).toMatchObject({ items: baseline.items })
      expect(await malformed.json()).toMatchObject({ items: baseline.items })
    })
  })

  it('excludes unpublished and suppressed source state from list and search', () => {
    const unpublishedState = emptyRegistrySourceState()
    const publicState = createDurablePublishedRegistryState({
      businessName: 'Demo listed provider',
      requestedSlug: 'demo-listed-provider',
      offeringName: 'Listed offering',
      offeringQuery: 'listed offering parramatta',
      suburb: 'Parramatta',
    })
    const suppressed = publicState.businesses.at(0)

    if (suppressed === undefined) {
      throw new Error('Expected default public business state.')
    }

    suppressed.publicStatus = 'suppressed'
    suppressed.suppressedAt = 3_000

    expect(listPublicBusinessOfferingSupply(unpublishedState, {
      paginationOpts: { cursor: null, numItems: 20 },
    }).page).toEqual([])
    expect(listPublicBusinessOfferingSupply(publicState, {
      paginationOpts: { cursor: null, numItems: 20 },
    }).page).toEqual([])
    expect(
      searchPublicBusinessOfferingSupply(publicState, {
        query: 'listed offering parramatta',
      }).items,
    ).toEqual([])
  })

  it('paginates public catalogs deterministically without skipping cursor records', () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Demo listed provider',
      requestedSlug: 'demo-listed-provider',
      offeringName: 'Listed offering',
      offeringQuery: 'listed offering parramatta',
      suburb: 'Parramatta',
    })
    addPublishedCatalogClone(state, {
      name: 'Aardvark Plumbing',
      slug: 'aardvark-plumbing',
    })
    addPublishedCatalogClone(state, {
      name: 'Zebra Plumbing',
      slug: 'zebra-plumbing',
    })

    const first = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: null, numItems: 1 },
    })
    if (first.isDone) {
      throw new Error('Expected a second registry page.')
    }

    const second = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: first.continueCursor, numItems: 1 },
    })
    if (second.isDone) {
      throw new Error('Expected a third registry page.')
    }

    const third = listPublicBusinessOfferingSupply(state, {
      paginationOpts: { cursor: second.continueCursor, numItems: 1 },
    })

    expect(first.page.map((item) => item.slug)).toEqual(['aardvark-plumbing'])
    expect(first.continueCursor).toBe('1')
    expect(second.page.map((item) => item.slug)).toEqual([
      'demo-listed-provider',
    ])
    expect(second.continueCursor).toBe('2')
    expect(third.page.map((item) => item.slug)).toEqual(['zebra-plumbing'])
    expect(third.isDone).toBe(true)
  })
})

function addPublishedCatalogClone(
  state: RegistrySourceState,
  input: { name: string; slug: string },
): void {
  const business = state.businesses.at(0)
  const context = state.businessContexts.at(0)
  const offering = state.offerings.at(0)
  const revision = offering === undefined
    ? undefined
    : state.revisions.find(
        (candidate) =>
          candidate.offeringRef === offering.offeringRef &&
          candidate.revision === offering.currentRevision,
      )

  if (business === undefined || context === undefined || offering === undefined || revision === undefined) {
    throw new Error('Expected default registry source state.')
  }

  const businessId = brandNonEmpty(`business:${input.slug}`, 'BusinessId')
  const offeringRef = brandNonEmpty(`offering:${businessId}:offering`, 'OfferingRef')
  const sourceHash = canonicalDigest(`source:${input.slug}`)
  const offeringSourceHash = canonicalDigest({
    businessId,
    offeringRef,
    revision: 1,
    name: input.name,
    category: revision.category,
    summary: revision.summary,
    serviceAreaSummary: revision.serviceAreaSummary ?? '',
    availabilitySummary: revision.availabilitySummary ?? '',
  })

  state.businesses.push({
    ...business,
    businessId,
    slug: brandNonEmpty(input.slug, 'Slug'),
    name: input.name,
    normalizedName: input.name.toLowerCase(),
    sourceHash,
    createdAt: business.createdAt + state.businesses.length,
    updatedAt: business.updatedAt + state.businesses.length,
  })
  state.businessContexts.push({
    ...context,
    businessId,
    sourceHash,
    approvedAt: context.approvedAt + state.businessContexts.length,
  })
  state.offerings.push({
    ...offering,
    offeringRef,
    businessId,
    currentRevision: 1,
    createdAt: offering.createdAt + state.offerings.length,
    updatedAt: offering.updatedAt + state.offerings.length,
  })
  state.revisions.push({
    ...revision,
    offeringRef,
    businessId,
    revision: 1,
    sourceHash: offeringSourceHash,
    createdAt: revision.createdAt + state.revisions.length,
  })
}

function createDurablePublishedRegistryState(input: {
  businessName: string
  requestedSlug: string
  offeringName: string
  offeringQuery: string
  suburb: string
  publishedPhone?: string
}): RegistrySourceState {
  const state = emptyRegistrySourceState()
  const ownerId = brandNonEmpty(`owner:${input.requestedSlug}`, 'OwnerId')
  const businessId = brandNonEmpty(`business:${input.requestedSlug}`, 'BusinessId')
  const slug = brandNonEmpty(input.requestedSlug, 'Slug')
  const businessContext = {
    kind: 'local_human' as const,
    suburb: input.suburb,
    stateTerritory: 'WA',
    ...(input.publishedPhone === undefined ? {} : { publishedPhone: input.publishedPhone }),
  }
  const businessSourceHash = canonicalDigest({ input, businessContext })
  state.owners.push({
    ownerId,
    clerkUserId: `owner:${input.requestedSlug}`,
    displayName: input.businessName,
    createdAt: 10_000,
    updatedAt: 10_000,
  })
  state.businesses.push({
    businessId,
    ownerId,
    slug,
    name: input.businessName,
    normalizedName: input.businessName.toLowerCase(),
    category: 'Heat pump repair',
    businessContext,
    publicStatus: 'published',
    trustTier: 'claimed',
    sourceHash: businessSourceHash,
    createdAt: 10_000,
    updatedAt: 11_000,
  })
  state.businessContexts.push({
    businessId,
    category: 'Heat pump repair',
    businessContext,
    ownerMessage: 'Owner supplied durable source facts.',
    sourceRefs: [{
      label: `${input.businessName} Offering card`,
      evidenceRef: `private:evidence:${input.requestedSlug}`,
      sourceHash: businessSourceHash,
    }],
    sourceHash: businessSourceHash,
    approvedAt: 10_000,
  })

  const offeringRef = brandNonEmpty(
    `offering:${businessId}:${input.offeringName.toLowerCase().replaceAll(' ', '-')}`,
    'OfferingRef',
  )
  const facts = {
    name: input.offeringName,
    category: 'Heat pump repair',
    summary: `${input.offeringName} for ${input.suburb} homes.`,
    serviceAreaSummary: `${input.offeringQuery} and nearby suburbs`,
    availabilitySummary: 'Weekdays by appointment',
  }
  const sourceHash = canonicalDigest({
    businessId,
    offeringRef,
    revision: 1,
    ...facts,
  })
  state.offerings.push({
    offeringRef,
    businessId,
    currentRevision: 1,
    status: 'published',
    createdAt: 11_000,
    updatedAt: 11_000,
  })
  state.revisions.push({
    offeringRef,
    businessId,
    revision: 1,
    ...facts,
    sourceHash,
    createdAt: 11_000,
  })

  return state
}

function suppressFirstBusiness(state: RegistrySourceState): void {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected a business to suppress.')
  }

  business.publicStatus = 'suppressed'
  business.suppressedAt = 12_000
}

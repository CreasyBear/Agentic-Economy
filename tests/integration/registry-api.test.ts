import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LOCAL_E2E_BUSINESS_FIXTURES } from '@/lib/dev/local-e2e-business-fixtures'

import {
  claimBusiness,
  createEmptyBusinessSourceState,
} from '@/modules/business/public'
import {
  createEmptyCatalogSourceState,
  publishBusinessCatalog,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  readPublicOfferingRegistryBusinessDetail,
  readPublicOfferingRegistryPage,
  resolvePublicRegistryInquiryTarget,
  setCatalogSearchBackendForTests,
} from '@/modules/registry/registry.functions'
import {
  createDefaultRegistrySourceState,
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type {
  PublicBusinessCatalogApiPage,
  RegistrySourceState,
} from '@/modules/registry/public'
import { readPublicTargetAdmissionThroughSource } from '@/modules/inquiries/inquiry.functions'
import { handleDurableListBusinessesRequest } from '@/routes/api.businesses'
import { handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import {
  handleDurableSearchBusinessesRequest,
  optionalHasPrice,
  optionalMaxPriceMinor,
} from '@/routes/api.businesses.search'
import { loadServicesRouteReadback } from '@/routes/index'

const admittedLocalE2eBusiness = LOCAL_E2E_BUSINESS_FIXTURES.find(
  (fixture) => fixture.inquiryAdmission === 'admitted',
)

if (admittedLocalE2eBusiness === undefined) {
  throw new Error('An admitted local E2E business fixture is required.')
}

describe('registry public API routes', () => {
  it('reads one non-default durable catalog through registry, search, API list, and API detail', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })

    const registry = listPublicBusinessCatalog(state, { limit: 10 })
    const search = searchPublicBusinessCatalog(state, {
      query: 'heat pump fremantle',
      limit: 10,
    })
    const detail = getPublicBusinessCatalogBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })

    expect(registry.items.map((item) => item.slug)).toEqual([
      'fremantle-heat-pump-repairs',
    ])
    expect(registry).toMatchObject({
      kind: 'ok',
      items: [
        {
          slug: 'fremantle-heat-pump-repairs',
          name: 'Fremantle Heat Pump Repairs',
        },
      ],
      pagination: { total: 1, hasMore: false },
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
        suburb: 'Fremantle',
        services: [
          { slug: 'heat-pump-diagnostics', name: 'Heat pump diagnostics' },
        ],
      },
    })
    expect(JSON.stringify([registry, search, detail])).not.toContain(
      'parramatta-emergency-plumbing',
    )
  })

  it('removes a suppressed durable catalog from registry, search, API list, and API detail', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })
    suppressFirstBusiness(state)

    const registry = listPublicBusinessCatalog(state, { limit: 10 })
    const search = searchPublicBusinessCatalog(state, {
      query: 'heat pump fremantle',
      limit: 10,
    })
    const detail = getPublicBusinessCatalogBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })

    expect(registry).toMatchObject({
      kind: 'ok',
      items: [],
      pagination: { total: 0, hasMore: false },
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

  it('keeps the shared admitted local fixture continuous across registry search, listing detail, and inquiry admission without contaminating the default fallback', async () => {
    const previousLocalE2eFlag = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousRegistrySeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    const restoreCatalogSearchBackend = setCatalogSearchBackendForTests('convex')
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const searchQuery = `${admittedLocalE2eBusiness.serviceName} ${admittedLocalE2eBusiness.suburb}`
      const registry = await loadServicesRouteReadback({ q: searchQuery })
      const listing = await readPublicOfferingRegistryBusinessDetail({
        slug: admittedLocalE2eBusiness.requestedSlug,
      })

      if (listing.kind !== 'found') {
        throw new Error('Expected the admitted local E2E fixture to have a public listing.')
      }

      const inquiryOffering = listing.business.offerings.find(
        (offering) => offering.name === admittedLocalE2eBusiness.serviceName,
      )
      if (inquiryOffering === undefined) {
        throw new Error('Expected the admitted local E2E fixture listing to expose its shared Offering.')
      }

      const inquiryAccessPath = inquiryOffering.accessPaths.find(
        (path) => path.kind === 'human_request' && path.channel === 'ae_inquiry',
      )
      if (inquiryAccessPath === undefined) {
        throw new Error('Expected the admitted local E2E fixture Offering to expose an AE inquiry path.')
      }

      const inquiryTarget = await resolvePublicRegistryInquiryTarget({
        businessSlug: listing.business.slug,
        serviceSlug: inquiryOffering.offeringRef.split(':').at(-1) ?? '',
      })
      if (inquiryTarget.kind !== 'resolved') {
        throw new Error('Expected the admitted local E2E fixture listing to resolve an inquiry target.')
      }

      const admission = await readPublicTargetAdmissionThroughSource({
        businessId: inquiryTarget.businessId,
        serviceId: inquiryTarget.serviceId,
        capabilityKind: 'phone_inquiry',
      })

      expect(registry).toMatchObject({
        query: searchQuery,
        kind: 'ok',
        services: [
          {
            business: {
              slug: admittedLocalE2eBusiness.requestedSlug,
              name: admittedLocalE2eBusiness.businessName,
              suburb: admittedLocalE2eBusiness.suburb,
            },
            name: admittedLocalE2eBusiness.serviceName,
          },
        ],
      })
      expect(listing.business).toMatchObject({
        slug: admittedLocalE2eBusiness.requestedSlug,
        name: admittedLocalE2eBusiness.businessName,
        category: admittedLocalE2eBusiness.category,
        suburb: admittedLocalE2eBusiness.suburb,
        stateTerritory: admittedLocalE2eBusiness.stateTerritory,
        publishedPhone: admittedLocalE2eBusiness.publishedPhone,
        offerings: [
          {
            name: admittedLocalE2eBusiness.serviceName,
            category: admittedLocalE2eBusiness.serviceCategory,
            summary: admittedLocalE2eBusiness.serviceSummary,
            serviceAreaSummary: admittedLocalE2eBusiness.serviceArea,
            availabilitySummary: admittedLocalE2eBusiness.hoursOrUnknown,
          },
        ],
      })
      expect(admission).toMatchObject({
        kind: 'ok',
        admission: {
          version: 'r1-target-admitted:v1',
          admitted: true,
          proof: { kind: 'claimed_owner' },
        },
      })

      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'false'
      delete process.env.CONVEX_URL
      delete process.env.VITE_CONVEX_URL

      await expect(loadServicesRouteReadback({ q: searchQuery })).rejects.toThrow(
        'registry_source_query_failed',
      )
      await expect(readPublicOfferingRegistryPage({ limit: 50 })).rejects.toThrow(
        'registry_source_query_failed',
      )
      await expect(readPublicOfferingRegistryBusinessDetail({
        slug: admittedLocalE2eBusiness.requestedSlug,
      })).rejects.toThrow('registry_source_query_failed')
      const defaultState = createDefaultRegistrySourceState()
      const defaultCatalog = listPublicBusinessCatalog(defaultState, { limit: 50 })
      const defaultSearch = searchPublicBusinessCatalog(defaultState, {
        query: searchQuery,
        limit: 50,
      })
      const defaultDetail = getPublicBusinessCatalogBySlug(defaultState, {
        slug: admittedLocalE2eBusiness.requestedSlug,
      })

      expect(defaultCatalog.items.map((item) => item.slug)).not.toContain(
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
      if (previousLocalE2eFlag === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalE2eFlag
      }
      if (previousRegistrySeed === undefined) {
        delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
      } else {
        process.env.AE_ANSWER_EVAL_REGISTRY_SEED = previousRegistrySeed
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
      restoreCatalogSearchBackend()
    }
  })

  it('keeps durable public DTOs strict across registry and API outputs', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
      publishedPhone: '1300 123 456',
    })

    const registry = listPublicBusinessCatalog(state, { limit: 10 })
    const search = searchPublicBusinessCatalog(state, {
      query: 'heat pump',
      limit: 10,
    })
    const detail = getPublicBusinessCatalogBySlug(state, {
      slug: 'fremantle-heat-pump-repairs',
    })
    const serialized = JSON.stringify({ registry, search, detail })

    expect(serialized).not.toMatch(
      /businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|MCP|OpenAPI|apiKey|"callable"\s*:\s*true|"paymentRequired"\s*:\s*true/i,
    )
    expect(serialized).toContain('not_available_yet')
    expect(serialized).toContain('1300 123 456')
    expect(serialized).not.toMatch(
      /booking available|payment available|callable endpoint/i,
    )
  })

  describe('public catalog HTTP routes', () => {
    // The routes now run the registered registry actions, which read the v2
    // Offering seam. Pin that seam to the same in-memory default catalog the
    // v1 handlers used, and take the Convex URL away so neither the registry
    // read nor the inquiry-admission overlay can reach a live deployment.
    const previousEnv = {
      localE2e: process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E,
      seed: process.env.AE_ANSWER_EVAL_REGISTRY_SEED,
      convexUrl: process.env.CONVEX_URL,
      publicConvexUrl: process.env.VITE_CONVEX_URL,
    }

    beforeEach(() => {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
      process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'
      delete process.env.CONVEX_URL
      delete process.env.VITE_CONVEX_URL
    })

    afterEach(() => {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousEnv.localE2e)
      restoreEnv('AE_ANSWER_EVAL_REGISTRY_SEED', previousEnv.seed)
      restoreEnv('CONVEX_URL', previousEnv.convexUrl)
      restoreEnv('VITE_CONVEX_URL', previousEnv.publicConvexUrl)
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
        items: [
          {
            slug: 'parramatta-emergency-plumbing',
            publicUrl: '/parramatta-emergency-plumbing',
            trustTier: 'claimed',
            disposition: 'current',
            photos: [],
            offerings: [
              { offeringRef: 'legacy-offering:parramatta-emergency-plumbing:emergency-pipe-repair' },
            ],
          },
        ],
        pagination: { limit: 1, total: 1, hasMore: false },
      })
      expect(typeof body.items[0].observedAt).toBe('number')
      // v2 publishes a business identifier by contract; the v1 DTO had none.
      expect(body.items[0].businessId).toBe('legacy-business:parramatta-emergency-plumbing')
      expect(JSON.stringify(body)).not.toMatch(
        /serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|callable|paymentRequired|MCP|OpenAPI/,
      )
    })

    it('searches deterministically across name, service, category, suburb, state, and service-area tokens', async () => {
      const response = await handleDurableSearchBusinessesRequest(
        new Request(
          'https://ae.example/api/businesses/search?q=emergency+plumber+parramatta',
        ),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        kind: 'ok',
        schemaVersion: 'public-business-catalog-api:v2',
        query: 'emergency plumber parramatta',
        items: [{ slug: 'parramatta-emergency-plumbing' }],
        pagination: { total: 1, hasMore: false },
      })
    })

    it('keeps direct search scoped to the supplied local context', async () => {
      const perthResponse = await handleDurableSearchBusinessesRequest(
        new Request(
          'https://ae.example/api/businesses/search?q=emergency+plumber&mode=near_me&location=Perth',
        ),
      )
      const perthBody = await perthResponse.json()
      const parramattaResponse = await handleDurableSearchBusinessesRequest(
        new Request(
          'https://ae.example/api/businesses/search?q=emergency+plumber&mode=near_me&location=Parramatta',
        ),
      )
      const parramattaBody = await parramattaResponse.json()

      expect(perthBody).toMatchObject({
        kind: 'ok',
        query: 'emergency plumber',
        items: [],
        pagination: { total: 0, hasMore: false },
      })
      expect(parramattaBody).toMatchObject({
        kind: 'ok',
        query: 'emergency plumber',
        items: [{ slug: 'parramatta-emergency-plumbing' }],
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
        kind: 'not_found',
        code: 'business_not_found',
        reason: 'No public business catalog exists for this slug.',
      })
    })

    it('drops an ae_inquiry access path the source will not admit, and keeps the rest of the listing', async () => {
      // The local-e2e seed publishes plumbing-demo with an inquiry-only first
      // request and no phone, which is the one shape that becomes an
      // ae_inquiry access path.
      delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
      const seam = await readPublicOfferingRegistryBusinessDetail({ slug: 'plumbing-demo' })
      if (seam.kind !== 'found') {
        throw new Error('Expected the local e2e seed to publish plumbing-demo.')
      }
      const seamOffering = seam.business.offerings[0]
      expect(seamOffering?.accessPaths).toEqual([
        expect.objectContaining({ kind: 'human_request', channel: 'ae_inquiry' }),
      ])

      const response = await handleDurableBusinessDetailRequest('plumbing-demo')
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.kind).toBe('found')
      const offering = body.business.offerings[0]
      expect(offering.offeringRef).toBe(seamOffering?.offeringRef)
      expect(offering.name).toBe('Diagnostic plumbing')
      expect(offering.accessPaths).toEqual([])
      expect(body.business.accessSummary.humanRequest).toBe(false)
    })

    /**
     * Both price parameters are optional on a route agents already call. A
     * value the route cannot read is dropped, never turned into a 400: a
     * malformed budget must not cost the caller the whole search.
     */
    it('reads a price ceiling and a price requirement off the query string, ignoring anything unreadable', () => {
      expect(optionalMaxPriceMinor('25000')).toEqual({ maxPriceMinor: 25_000 })
      expect(optionalMaxPriceMinor(' 25000 ')).toEqual({ maxPriceMinor: 25_000 })
      expect(optionalMaxPriceMinor(null)).toEqual({})
      expect(optionalMaxPriceMinor('')).toEqual({})
      expect(optionalMaxPriceMinor('$250')).toEqual({})
      expect(optionalMaxPriceMinor('250.5')).toEqual({})
      expect(optionalMaxPriceMinor('-1')).toEqual({})
      expect(optionalMaxPriceMinor('0')).toEqual({})

      expect(optionalHasPrice('true')).toEqual({ hasPrice: true })
      expect(optionalHasPrice('1')).toEqual({ hasPrice: true })
      expect(optionalHasPrice('false')).toEqual({ hasPrice: false })
      expect(optionalHasPrice('0')).toEqual({ hasPrice: false })
      expect(optionalHasPrice(null)).toEqual({})
      expect(optionalHasPrice('maybe')).toEqual({})
    })

    it('accepts price parameters on the live search route without narrowing supply that published no price', async () => {
      const baseline = await (await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=emergency+plumber+parramatta'),
      )).json()
      const budgeted = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=emergency+plumber+parramatta&max_price_minor=25000'),
      )
      const malformed = await handleDurableSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=emergency+plumber+parramatta&max_price_minor=%24250&has_price=maybe'),
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
    const publicState = createDefaultRegistrySourceState()
    const suppressed = publicState.businesses.at(0)

    if (suppressed === undefined) {
      throw new Error('Expected default public business state.')
    }

    suppressed.publicStatus = 'suppressed'
    suppressed.claimStatus = 'suppressed'
    suppressed.suppressedAt = 3_000

    expect(listPublicBusinessCatalog(unpublishedState).items).toEqual([])
    expect(listPublicBusinessCatalog(publicState).items).toEqual([])
    expect(
      searchPublicBusinessCatalog(publicState, {
        query: 'emergency plumber parramatta',
      }).items,
    ).toEqual([])
  })

  it('paginates public catalogs deterministically without skipping cursor records', () => {
    const state = createDefaultRegistrySourceState()
    addPublishedCatalogClone(state, {
      name: 'Aardvark Plumbing',
      slug: 'aardvark-plumbing',
    })
    addPublishedCatalogClone(state, {
      name: 'Zebra Plumbing',
      slug: 'zebra-plumbing',
    })

    const first = listPublicBusinessCatalog(state, { limit: 1 })
    if (first.pagination.nextCursor === undefined) {
      throw new Error('Expected a second registry page.')
    }

    const second = listPublicBusinessCatalog(state, {
      limit: 1,
      cursor: first.pagination.nextCursor,
    })
    if (second.pagination.nextCursor === undefined) {
      throw new Error('Expected a third registry page.')
    }

    const third = listPublicBusinessCatalog(state, {
      limit: 1,
      cursor: second.pagination.nextCursor,
    })

    expect(first.items.map((item) => item.slug)).toEqual(['aardvark-plumbing'])
    expect(first.pagination.nextCursor).toBe('parramatta-emergency-plumbing')
    expect(second.items.map((item) => item.slug)).toEqual([
      'parramatta-emergency-plumbing',
    ])
    expect(second.pagination.nextCursor).toBe('zebra-plumbing')
    expect(third.items.map((item) => item.slug)).toEqual(['zebra-plumbing'])
    expect(third.pagination.hasMore).toBe(false)
  })
})

function emptyRegistrySourceState(): RegistrySourceState {
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
  }
}

function addPublishedCatalogClone(
  state: RegistrySourceState,
  input: { name: string; slug: string },
): void {
  const business = state.businesses.at(0)
  const context = state.businessContexts.at(0)
  const service = state.businessServices.at(0)
  const capabilities = state.serviceCapabilities.filter(
    (candidate) => candidate.serviceId === service?.serviceId,
  )

  if (
    business === undefined ||
    context === undefined ||
    service === undefined
  ) {
    throw new Error('Expected default registry source state.')
  }

  const businessId = brandNonEmpty(`business:${input.slug}`, 'BusinessId')
  const serviceId = brandNonEmpty(`service:${input.slug}`, 'ServiceId')
  const sourceHash = brandNonEmpty(`hash:source:${input.slug}`, 'SourceHash')

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
  state.businessServices.push({
    ...service,
    businessId,
    serviceId,
    serviceSlug: brandNonEmpty(`${input.slug}-service`, 'Slug'),
    sourceHash,
    createdAt: service.createdAt + state.businessServices.length,
    updatedAt: service.updatedAt + state.businessServices.length,
  })
  for (const capability of capabilities) {
    state.serviceCapabilities.push({
      ...capability,
      businessId,
      serviceId,
      sourceHash,
      createdAt: capability.createdAt + state.serviceCapabilities.length,
      updatedAt: capability.updatedAt + state.serviceCapabilities.length,
    })
  }
}

async function jsonBody(
  response: Promise<Response>,
): Promise<PublicBusinessCatalogApiPage> {
  return (await response).json() as Promise<PublicBusinessCatalogApiPage>
}

function createDurablePublishedRegistryState(input: {
  businessName: string
  requestedSlug: string
  serviceName: string
  serviceQuery: string
  suburb: string
  publishedPhone?: string
}): RegistrySourceState {
  const state = emptyRegistrySourceState()
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
      ...(input.publishedPhone === undefined ? {} : { publishedPhone: input.publishedPhone }),
      ownerMessage: 'Owner supplied durable source facts.',
      sourceRefs: [
        {
          label: `${input.businessName} service card`,
          evidenceRef: `private:evidence:${input.requestedSlug}`,
          sourceHash: brandNonEmpty(
            `hash:source:${input.requestedSlug}`,
            'SourceHash',
          ),
        },
      ],
    },
    security: {
      csrf: matchingCsrf('claim'),
      rateLimit: {
        scope: 'claim_submit',
        key: `registry:${input.requestedSlug}`,
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
    throw new Error(
      `Expected durable claim fixture to publish: ${claim.reason}`,
    )
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
          noContactReason:
            'Owner has not supplied public contact instructions.',
        },
      },
    ],
    security: { csrf: matchingCsrf('publish') },
    operationKey: operationKey(`publish:${input.requestedSlug}`),
    correlationId: correlationId(`publish:${input.requestedSlug}`),
    now: 11_000,
  })

  if (publish.kind === 'error') {
    throw new Error(
      `Expected durable publish fixture to publish: ${publish.reason}`,
    )
  }

  return state
}

function suppressFirstBusiness(state: RegistrySourceState): void {
  const business = state.businesses.at(0)
  if (business === undefined) {
    throw new Error('Expected a business to suppress.')
  }

  state.suppressionRules.push({
    targetType: 'business',
    targetRef: business.businessId,
    status: 'active',
    reasonCode: 'privacy_removal_requested',
    evidenceRefs: ['private:evidence:suppression'],
    createdByAdminRef: 'admin:test',
    createdAt: 12_000,
    beforePublicStatus: business.publicStatus,
    beforeClaimStatus: business.claimStatus,
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
  return brandNonEmpty(`op:registry-durable-test:${value}`, 'OperationKey')
}

function correlationId(value: string) {
  return brandNonEmpty(`corr:registry-durable-test:${value}`, 'CorrelationId')
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

import { describe, expect, it } from 'vitest'

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
  readPublicRegistryBusinessDetail,
  readPublicRegistryCatalogPage,
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
import {
  handleListBusinessesRequest,
} from '@/routes/api.businesses'
import {
  handleBusinessDetailRequest,
} from '@/routes/api.businesses.$slug'
import {
  handleSearchBusinessesRequest,
} from '@/routes/api.businesses.search'
import { loadRegistryRouteReadback } from '@/routes/registry'

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

    try {
      const searchQuery = `${admittedLocalE2eBusiness.serviceName} ${admittedLocalE2eBusiness.suburb}`
      const registry = await loadRegistryRouteReadback({ q: searchQuery, limit: 10 })
      const listing = await readPublicRegistryBusinessDetail({
        slug: admittedLocalE2eBusiness.requestedSlug,
      })

      if (listing.kind !== 'found') {
        throw new Error('Expected the admitted local E2E fixture to have a public listing.')
      }

      const inquiryService = listing.business.services.find(
        (service) => service.name === admittedLocalE2eBusiness.serviceName,
      )
      if (inquiryService === undefined) {
        throw new Error('Expected the admitted local E2E fixture listing to expose its shared service.')
      }

      const inquiryCapability = inquiryService.capabilities.find(
        (capability) => capability.kind === 'phone_inquiry' && capability.status === 'available',
      )
      if (inquiryCapability === undefined) {
        throw new Error('Expected the admitted local E2E fixture service to expose an available inquiry capability.')
      }

      const inquiryTarget = await resolvePublicRegistryInquiryTarget({
        businessSlug: listing.business.slug,
        serviceSlug: inquiryService.slug,
      })
      if (inquiryTarget.kind !== 'resolved') {
        throw new Error('Expected the admitted local E2E fixture listing to resolve an inquiry target.')
      }

      const admission = await readPublicTargetAdmissionThroughSource({
        businessId: inquiryTarget.businessId,
        serviceId: inquiryTarget.serviceId,
        capabilityKind: inquiryCapability.kind,
      })

      expect(registry).toMatchObject({
        query: searchQuery,
        result: {
          kind: 'ok',
          items: [
            {
              slug: admittedLocalE2eBusiness.requestedSlug,
              name: admittedLocalE2eBusiness.businessName,
              suburb: admittedLocalE2eBusiness.suburb,
              services: [{ name: admittedLocalE2eBusiness.serviceName }],
            },
          ],
        },
      })
      expect(listing.business).toMatchObject({
        slug: admittedLocalE2eBusiness.requestedSlug,
        name: admittedLocalE2eBusiness.businessName,
        category: admittedLocalE2eBusiness.category,
        suburb: admittedLocalE2eBusiness.suburb,
        stateTerritory: admittedLocalE2eBusiness.stateTerritory,
        publishedPhone: admittedLocalE2eBusiness.publishedPhone,
        services: [
          {
            name: admittedLocalE2eBusiness.serviceName,
            category: admittedLocalE2eBusiness.serviceCategory,
            summary: admittedLocalE2eBusiness.serviceSummary,
            serviceArea: admittedLocalE2eBusiness.serviceArea,
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

      await expect(loadRegistryRouteReadback({ q: searchQuery, limit: 10 })).rejects.toThrow(
        'registry_source_query_failed',
      )
      await expect(readPublicRegistryCatalogPage({ limit: 50 })).rejects.toThrow(
        'registry_source_query_failed',
      )
      await expect(readPublicRegistryBusinessDetail({
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

  it('lists eligible public business catalogs without private fields', async () => {
    const response = handleListBusinessesRequest(
      new Request('https://ae.example/api/businesses?limit=1'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      items: [
        {
          slug: 'parramatta-emergency-plumbing',
          publicUrl: '/parramatta-emergency-plumbing',
          publicStatus: 'published',
          indexStatus: 'queued',
          services: [{ slug: 'emergency-pipe-repair', status: 'published' }],
        },
      ],
      pagination: { limit: 1, total: 1, hasMore: false },
    })
    expect(JSON.stringify(body)).not.toMatch(
      /businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|callable|paymentRequired|MCP|OpenAPI/,
    )
  })

  it('searches deterministically across name, service, category, suburb, state, and service-area tokens', async () => {
    const response = handleSearchBusinessesRequest(
      new Request(
        'https://ae.example/api/businesses/search?q=emergency+plumber+parramatta',
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      kind: 'ok',
      query: 'emergency plumber parramatta',
      items: [{ slug: 'parramatta-emergency-plumbing' }],
      pagination: { total: 1, hasMore: false },
    })
  })

  it('keeps direct search scoped to the supplied local context', async () => {
    const perthResponse = handleSearchBusinessesRequest(
      new Request(
        'https://ae.example/api/businesses/search?q=emergency+plumber&mode=near_me&location=Perth',
      ),
    )
    const perthBody = await perthResponse.json()
    const parramattaResponse = handleSearchBusinessesRequest(
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
      const response = handleSearchBusinessesRequest(
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
    const emptySearch = handleSearchBusinessesRequest(
      new Request('https://ae.example/api/businesses/search?q='),
    )
    const emptyBody = await emptySearch.json()
    const missingDetail = handleBusinessDetailRequest('missing-business')
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
          publicDisclosure: 'First request is not available yet.',
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

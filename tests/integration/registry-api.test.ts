import { describe, expect, it } from 'vitest'

import { claimBusiness, createEmptyBusinessSourceState } from '@/modules/business/public'
import { createEmptyCatalogSourceState, publishBusinessCatalog } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  createDefaultRegistrySourceState,
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type { PublicBusinessCatalogApiPage, RegistrySourceState } from '@/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { handleDurableListBusinessesRequest, handleListBusinessesRequest } from '@/routes/api.businesses'
import { handleBusinessDetailRequest, handleDurableBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleDurableSearchBusinessesRequest, handleSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { loadRegistryRouteReadback } from '@/routes/registry'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

describe('registry public API routes', () => {
  it('reads one non-default durable catalog through registry, search, API list, and API detail', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })

    await withRegistrySourcePortForTest(state, async () => {
      const registry = await loadRegistryRouteReadback({ q: 'heat pump fremantle', limit: 10 })
      const list = await jsonBody(handleDurableListBusinessesRequest(new Request('https://ae.example/api/businesses')))
      const search = await jsonBody(
        handleDurableSearchBusinessesRequest(
          new Request('https://ae.example/api/businesses/search?q=heat+pump+fremantle')
        )
      )
      const detailResponse = await handleDurableBusinessDetailRequest('fremantle-heat-pump-repairs')
      const detail = await detailResponse.json()

      expect(registry.result.items.map((item) => item.slug)).toEqual(['fremantle-heat-pump-repairs'])
      expect(list).toMatchObject({
        kind: 'ok',
        items: [{ slug: 'fremantle-heat-pump-repairs', name: 'Fremantle Heat Pump Repairs' }],
        pagination: { total: 1, hasMore: false },
      })
      expect(search).toMatchObject({
        kind: 'ok',
        query: 'heat pump fremantle',
        items: [{ slug: 'fremantle-heat-pump-repairs' }],
        pagination: { total: 1, hasMore: false },
      })
      expect(detailResponse.status).toBe(200)
      expect(detail).toMatchObject({
        kind: 'found',
        business: {
          slug: 'fremantle-heat-pump-repairs',
          name: 'Fremantle Heat Pump Repairs',
          suburb: 'Fremantle',
          services: [{ slug: 'heat-pump-diagnostics', name: 'Heat pump diagnostics' }],
        },
      })
      expect(JSON.stringify([registry, list, search, detail])).not.toContain('parramatta-emergency-plumbing')
    })
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

    await withRegistrySourcePortForTest(state, async () => {
      const registry = await loadRegistryRouteReadback({ q: '', limit: 10 })
      const list = await jsonBody(handleDurableListBusinessesRequest(new Request('https://ae.example/api/businesses')))
      const search = await jsonBody(
        handleDurableSearchBusinessesRequest(
          new Request('https://ae.example/api/businesses/search?q=heat+pump+fremantle')
        )
      )
      const detailResponse = await handleDurableBusinessDetailRequest('fremantle-heat-pump-repairs')
      const detail = await detailResponse.json()

      expect(registry.result.items).toEqual([])
      expect(list).toMatchObject({ kind: 'ok', items: [], pagination: { total: 0, hasMore: false } })
      expect(search).toMatchObject({
        kind: 'ok',
        query: 'heat pump fremantle',
        items: [],
        pagination: { total: 0, hasMore: false },
      })
      expect(detailResponse.status).toBe(404)
      expect(detail).toEqual({
        kind: 'not_found',
        code: 'business_not_found',
        reason: 'No public business catalog exists for this slug.',
      })
    })
  })

  it('keeps the empty registry page list query compatible with the durable Convex validator', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })
    const listInputs: unknown[] = []

    const reset = setPublicRegistrySourcePortForTests({
      list: (input) => {
        listInputs.push(input)
        expect(input).toEqual({ limit: 10 })
        return Promise.resolve(listPublicBusinessCatalog(state, input))
      },
      search: () => {
        throw new Error('Expected empty registry query to use list, not search.')
      },
      detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
    })

    try {
      const registry = await loadRegistryRouteReadback({ q: '', limit: 10 })

      expect(registry.result.items.map((item) => item.slug)).toEqual(['fremantle-heat-pump-repairs'])
      expect(listInputs).toHaveLength(1)
    } finally {
      reset()
    }
  })

  it('keeps durable public DTOs strict across registry and API outputs', async () => {
    const state = createDurablePublishedRegistryState({
      businessName: 'Fremantle Heat Pump Repairs',
      requestedSlug: 'fremantle-heat-pump-repairs',
      serviceName: 'Heat pump diagnostics',
      serviceQuery: 'heat pump fremantle',
      suburb: 'Fremantle',
    })

    await withRegistrySourcePortForTest(state, async () => {
      const registry = await loadRegistryRouteReadback({ q: 'heat pump', limit: 10 })
      const list = await jsonBody(handleDurableListBusinessesRequest(new Request('https://ae.example/api/businesses')))
      const search = await jsonBody(
        handleDurableSearchBusinessesRequest(new Request('https://ae.example/api/businesses/search?q=heat+pump'))
      )
      const detail = await (await handleDurableBusinessDetailRequest('fremantle-heat-pump-repairs')).json()
      const serialized = JSON.stringify({ registry, list, search, detail })

      expect(serialized).not.toMatch(
        /businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|MCP|OpenAPI|apiKey|"callable"\s*:\s*true|"paymentRequired"\s*:\s*true/i
      )
      expect(serialized).toContain('not_available_yet')
      expect(serialized).not.toMatch(/booking available|payment available|callable endpoint/i)
    })
  })

  it('lists eligible public business catalogs without private fields', async () => {
    const response = handleListBusinessesRequest(new Request('https://ae.example/api/businesses?limit=1'))
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
      /businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence|callable|paymentRequired|MCP|OpenAPI/
    )
  })

  it('searches deterministically across name, service, category, suburb, state, and service-area tokens', async () => {
    const response = handleSearchBusinessesRequest(
      new Request('https://ae.example/api/businesses/search?q=emergency+plumber+parramatta')
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

  it('returns explicit empty search and 404 detail shapes', async () => {
    const emptySearch = handleSearchBusinessesRequest(new Request('https://ae.example/api/businesses/search?q='))
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
      searchPublicBusinessCatalog(publicState, { query: 'emergency plumber parramatta' }).items
    ).toEqual([])
  })

  it('paginates public catalogs deterministically without skipping cursor records', () => {
    const state = createDefaultRegistrySourceState()
    addPublishedCatalogClone(state, { name: 'Aardvark Plumbing', slug: 'aardvark-plumbing' })
    addPublishedCatalogClone(state, { name: 'Zebra Plumbing', slug: 'zebra-plumbing' })

    const first = listPublicBusinessCatalog(state, { limit: 1 })
    if (first.pagination.nextCursor === undefined) {
      throw new Error('Expected a second registry page.')
    }

    const second = listPublicBusinessCatalog(state, { limit: 1, cursor: first.pagination.nextCursor })
    if (second.pagination.nextCursor === undefined) {
      throw new Error('Expected a third registry page.')
    }

    const third = listPublicBusinessCatalog(state, { limit: 1, cursor: second.pagination.nextCursor })

    expect(first.items.map((item) => item.slug)).toEqual(['aardvark-plumbing'])
    expect(first.pagination.nextCursor).toBe('parramatta-emergency-plumbing')
    expect(second.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
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
  input: { name: string; slug: string }
): void {
  const business = state.businesses.at(0)
  const context = state.businessContexts.at(0)
  const service = state.businessServices.at(0)
  const capabilities = state.serviceCapabilities.filter((candidate) => candidate.serviceId === service?.serviceId)

  if (business === undefined || context === undefined || service === undefined) {
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

async function jsonBody(response: Promise<Response>): Promise<PublicBusinessCatalogApiPage> {
  return (await response).json() as Promise<PublicBusinessCatalogApiPage>
}

function createDurablePublishedRegistryState(input: {
  businessName: string
  requestedSlug: string
  serviceName: string
  serviceQuery: string
  suburb: string
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
          publicDisclosure: 'First request is not available yet.',
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

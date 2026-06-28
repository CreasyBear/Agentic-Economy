import { describe, expect, it } from 'vitest'

import { createEmptyBusinessSourceState } from '@/modules/business/public'
import { createEmptyCatalogSourceState } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  createDefaultRegistrySourceState,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import { handleListBusinessesRequest } from '@/routes/api.businesses'
import { handleBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleSearchBusinessesRequest } from '@/routes/api.businesses.search'

describe('registry public API routes', () => {
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

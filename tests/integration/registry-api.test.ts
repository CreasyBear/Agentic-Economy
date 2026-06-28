import { describe, expect, it } from 'vitest'

import { createEmptyBusinessSourceState } from '@/modules/business/public'
import { createEmptyCatalogSourceState } from '@/modules/catalog/public'
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
    expect(JSON.stringify(body)).not.toMatch(/businessId|serviceId|ownerId|clerk|sourceHash|rawContact|admin|private:evidence/)
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

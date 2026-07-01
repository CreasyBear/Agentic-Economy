import { afterEach, describe, expect, it, vi } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  readPublicRegistryBusinessDetail,
  readPublicRegistryCatalogPage,
  readPublicRegistrySearchPage,
  setPublicRegistrySourcePortForTests,
  setCatalogSearchBackendForTests,
  setCatalogSearchPortForTests,
} from '@/modules/registry/registry.functions'
import type { CatalogSearchPort } from '@/modules/registry/internal/catalog-search-port'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'

vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: vi.fn(async () => {
    throw new Error('convex unavailable')
  }),
  sourceQuery: (name: string) => name,
}))

describe('registry convex fallback', () => {
  afterEach(() => {
    vi.clearAllMocks()
    setCatalogSearchBackendForTests(undefined)
    setCatalogSearchPortForTests(undefined)
  })

  it('falls back to the in-memory catalog when Convex queries fail outside production', async () => {
    const page = await readPublicRegistrySearchPage({
      query: 'emergency plumber parramatta',
      limit: 10,
    })

    expect(page.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
  })

  it('returns an empty page for unmatched local queries instead of throwing', async () => {
    const page = await readPublicRegistrySearchPage({
      query: 'Emergency plumber Brunswick',
      limit: 10,
    })

    expect(page.items).toEqual([])
  })

  it('hydrates Meili-ranked candidates from the public Convex catalog before returning them', async () => {
    setCatalogSearchBackendForTests('meilisearch')
    setCatalogSearchPortForTests(fakeCatalogSearchPort({
      search: async () => ({
        kind: 'ok',
        backend: 'meilisearch',
        query: 'emergency plumber parramatta',
        estimatedTotalHits: 1,
        hits: [
          {
            documentId: 'parramatta-emergency-plumbing__emergency-pipe-repair',
            businessSlug: 'parramatta-emergency-plumbing',
            serviceSlug: 'emergency-pipe-repair',
            generatedHash: brandNonEmpty('hash:generated:parramatta', 'SourceHash'),
            rank: 1,
          },
        ],
      }),
    }))

    const page = await readPublicRegistrySearchPage({
      query: 'emergency plumber parramatta',
      limit: 10,
    })

    expect(page.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
    expect(JSON.stringify(page)).not.toMatch(/businessId|serviceId|sourceHash|private:evidence/)
  })

  it('falls back to Convex search when Meili is unavailable', async () => {
    setCatalogSearchBackendForTests('meilisearch')
    setCatalogSearchPortForTests(fakeCatalogSearchPort({
      search: async () => {
        throw new Error('meili unavailable')
      },
    }))

    const page = await readPublicRegistrySearchPage({
      query: 'emergency plumber parramatta',
      limit: 10,
    })

    expect(page.items.map((item) => item.slug)).toEqual(['parramatta-emergency-plumbing'])
    expect(page).toMatchObject({
      kind: 'ok',
      schemaVersion: 'public-business-catalog-api:v1',
      pagination: { total: 1, hasMore: false },
    })
  })

  it('keeps AE smoke validation rows out of public registry reads', async () => {
    const smoke = businessDto({
      slug: 'agentic-economy-r10-smoke',
      name: 'Agentic Economy R10 Smoke',
      services: [
        serviceDto({
          slug: 'r10-emergency-triage-readback',
          name: 'R10 emergency triage readback',
          summary: 'Smoke readback for public registry routes.',
        }),
      ],
    })
    const real = businessDto()
    const reset = setPublicRegistrySourcePortForTests({
      list: async () => pageDto([smoke, real]),
      search: async () => pageDto([smoke, real], 'emergency plumber parramatta'),
      detail: async ({ slug }) =>
        slug === smoke.slug
          ? { kind: 'found', schemaVersion: 'public-business-catalog-api:v1', business: smoke }
          : { kind: 'found', schemaVersion: 'public-business-catalog-api:v1', business: real },
    })

    try {
      await expect(readPublicRegistryCatalogPage({ limit: 10 })).resolves.toMatchObject({
        items: [{ slug: 'parramatta-emergency-plumbing' }],
        pagination: { total: 1 },
      })
      await expect(
        readPublicRegistrySearchPage({ query: 'emergency plumber parramatta', limit: 10 }),
      ).resolves.toMatchObject({
        items: [{ slug: 'parramatta-emergency-plumbing' }],
        pagination: { total: 1 },
      })
      await expect(
        readPublicRegistryBusinessDetail({ slug: 'agentic-economy-r10-smoke' }),
      ).resolves.toEqual({
        kind: 'not_found',
        code: 'business_not_found',
        reason: 'No public business catalog exists for this slug.',
      })
    } finally {
      reset()
    }
  })
})

function fakeCatalogSearchPort(
  overrides: Partial<CatalogSearchPort>,
): CatalogSearchPort {
  return {
    search: async () => ({
      kind: 'ok',
      backend: 'meilisearch',
      query: '',
      hits: [],
    }),
    addOrReplaceDocuments: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'queued',
    }),
    deleteDocuments: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'queued',
    }),
    configureIndex: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'queued',
    }),
    readTask: async () => ({
      taskUid: '1',
      indexUid: 'registry',
      status: 'succeeded',
    }),
    ...overrides,
  }
}

function pageDto(
  items: readonly PublicBusinessCatalogApiDto[],
  query?: string,
): PublicBusinessCatalogApiPage {
  return {
    kind: 'ok',
    schemaVersion: 'public-business-catalog-api:v1',
    ...(query === undefined ? {} : { query }),
    items,
    pagination: {
      limit: 10,
      total: items.length,
      hasMore: false,
    },
  }
}

function businessDto(
  overrides: Partial<PublicBusinessCatalogApiDto> = {},
): PublicBusinessCatalogApiDto {
  return {
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/parramatta-emergency-plumbing',
    trustTier: 'claimed',
    publicStatus: 'published',
    indexStatus: 'indexed',
    discoveryStatus: 'available',
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: 1_000,
    photos: [],
    services: [serviceDto()],
    ...overrides,
  }
}

function serviceDto(
  overrides: Partial<PublicBusinessCatalogApiDto['services'][number]> = {},
): PublicBusinessCatalogApiDto['services'][number] {
  return {
    slug: 'emergency-pipe-repair',
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage and repair for urgent local plumbing jobs.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Hours supplied by owner',
    firstRequest: {
      mode: 'inquiry_available',
      publicDisclosure: 'Use the inquiry form for a first contact.',
      publicChannel: 'public_business_contact',
    },
    status: 'published',
    capabilities: [{ kind: 'quote_request', status: 'available' }],
    ...overrides,
  }
}

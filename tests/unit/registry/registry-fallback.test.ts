import { afterEach, describe, expect, it, vi } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  readPublicRegistrySearchPage,
  setCatalogSearchBackendForTests,
  setCatalogSearchPortForTests,
} from '@/modules/registry/registry.functions'
import type { CatalogSearchPort } from '@/modules/registry/internal/catalog-search-port'

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
            documentId: 'parramatta-emergency-plumbing:emergency-pipe-repair',
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

import { describe, expect, it } from 'vitest'

import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'
import {
  buildMeiliSearchFilter,
  createMeiliCatalogSearchPort,
  registrySearchIndexSettings,
} from '@/modules/registry/internal/catalog-search-port'
import { buildRegistrySearchDocumentsForCatalog } from '@/modules/registry/internal/search-documents'

describe('Meilisearch catalog search port', () => {
  it('builds a literal place filter for local searches', () => {
    expect(
      buildMeiliSearchFilter({
        query: 'emergency plumber',
        mode: 'near_me',
        location: 'Brunswick, VIC',
      }),
    ).toBe('publicStatus = "published" AND placeKeys = "brunswick"')
  })

  it('returns ranked service hits after AE literal post-filtering', async () => {
    const requests: { url: string; body: unknown }[] = []
    const [doc] = buildRegistrySearchDocumentsForCatalog(
      catalog({
        slug: 'brunswick-emergency-plumbing',
        name: 'Brunswick Emergency Plumbing',
        suburb: 'Brunswick',
        stateTerritory: 'VIC',
        serviceArea: 'Brunswick and nearby suburbs',
      }),
    )
    if (doc === undefined) {
      throw new Error('expected search document')
    }

    const port = createMeiliCatalogSearchPort({
      host: 'https://search.example',
      apiKey: 'test-key',
      indexUid: 'registry',
      fetcher: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? '{}')),
        })
        return jsonResponse({
          hits: [doc],
          estimatedTotalHits: 1,
          processingTimeMs: 3,
        })
      },
    })

    const result = await port.search({
      query: 'emergency plumber',
      mode: 'near_me',
      location: 'Brunswick',
      limit: 10,
    })

    expect(requests[0]).toMatchObject({
      url: 'https://search.example/indexes/registry/search',
      body: {
        q: 'emergency plumber',
        filter: 'publicStatus = "published" AND placeKeys = "brunswick"',
      },
    })
    expect(result.hits).toEqual([
      {
        documentId: 'brunswick-emergency-plumbing__emergency-pipe-repair',
        businessSlug: 'brunswick-emergency-plumbing',
        serviceSlug: 'emergency-pipe-repair',
        generatedHash: doc.generatedHash,
        rank: 1,
      },
    ])
  })

  it('rejects typo-tolerant candidates that do not literally match the query', async () => {
    const [doc] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (doc === undefined) {
      throw new Error('expected search document')
    }

    const port = createMeiliCatalogSearchPort({
      host: 'https://search.example',
      apiKey: 'test-key',
      indexUid: 'registry',
      fetcher: async () => jsonResponse({ hits: [doc], estimatedTotalHits: 1 }),
    })

    const result = await port.search({ query: 'paramata', limit: 10 })

    expect(result.hits).toEqual([])
  })

  it('exposes index settings that keep direct registry search literal', () => {
    expect(registrySearchIndexSettings()).toMatchObject({
      filterableAttributes: expect.arrayContaining(['publicStatus', 'placeKeys']),
      typoTolerance: { enabled: false },
    })
  })

  it('maps write task readback for sync health', async () => {
    const [doc] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (doc === undefined) {
      throw new Error('expected search document')
    }

    const port = createMeiliCatalogSearchPort({
      host: 'https://search.example',
      apiKey: 'test-key',
      indexUid: 'registry',
      fetcher: async (url) => {
        if (String(url).endsWith('/tasks/42')) {
          return jsonResponse({
            taskUid: 42,
            indexUid: 'registry',
            status: 'succeeded',
            type: 'documentAdditionOrUpdate',
          })
        }
        return jsonResponse({
          taskUid: 42,
          indexUid: 'registry',
          status: 'enqueued',
          type: 'documentAdditionOrUpdate',
        })
      },
    })

    await expect(port.addOrReplaceDocuments([doc])).resolves.toMatchObject({
      taskUid: '42',
      status: 'queued',
    })
    await expect(port.readTask('42')).resolves.toMatchObject({
      taskUid: '42',
      status: 'succeeded',
      type: 'documentAdditionOrUpdate',
    })
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function catalog(
  overrides: Partial<PublicBusinessCatalogApiDto> & { serviceArea?: string } = {},
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
    services: [
      {
        slug: 'emergency-pipe-repair',
        name: 'Emergency pipe repair',
        category: 'Emergency plumbing',
        summary: 'Emergency plumbing help for urgent pipe repairs.',
        serviceArea: overrides.serviceArea ?? 'Parramatta and nearby suburbs',
        hoursOrUnknown: 'Hours supplied by owner',
        firstRequest: {
          mode: 'inquiry_available',
          publicDisclosure: 'Send a qualified inquiry for owner review.',
          publicChannel: 'ae_status_only',
        },
        status: 'published',
        capabilities: [{ kind: 'quote_request', status: 'available' }],
      },
    ],
    ...overrides,
  }
}

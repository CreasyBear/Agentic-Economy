import { describe, expect, it } from 'vitest'

import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'
import {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
  resolveRegistrySearchLocation,
} from '@/modules/registry/internal/search-documents'

describe('registry search documents', () => {
  it('builds one public search document per published service', () => {
    const docs = buildRegistrySearchDocumentsForCatalog(
      catalog({
        services: [
          service({ slug: 'emergency-pipe-repair', name: 'Emergency pipe repair' }),
          service({ slug: 'blocked-drain', name: 'Blocked drain repair' }),
        ],
      }),
    )

    expect(docs).toHaveLength(2)
    expect(docs.map((doc) => doc.documentId)).toEqual([
      'parramatta-emergency-plumbing:emergency-pipe-repair',
      'parramatta-emergency-plumbing:blocked-drain',
    ])
  })

  it('keeps local location matching literal', () => {
    const [parramatta] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (parramatta === undefined) {
      throw new Error('expected search document')
    }

    expect(
      documentMatchesRegistryQuery(parramatta, {
        query: 'Emergency plumber Parramatta',
      }),
    ).toBe(true)
    expect(
      documentMatchesRegistryQuery(parramatta, {
        query: 'Emergency plumber Brunswick',
      }),
    ).toBe(false)
  })

  it('does not correct close suburb misspellings in literal search', () => {
    const [parramatta] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (parramatta === undefined) {
      throw new Error('expected search document')
    }

    expect(
      documentMatchesRegistryQuery(parramatta, {
        query: 'paramata',
      }),
    ).toBe(false)
  })

  it('uses explicit user context as the local bucket filter', () => {
    const [parramatta] = buildRegistrySearchDocumentsForCatalog(catalog())
    const [perth] = buildRegistrySearchDocumentsForCatalog(
      catalog({
        slug: 'perth-emergency-plumbing',
        name: 'Perth Emergency Plumbing',
        suburb: 'Perth',
        stateTerritory: 'WA',
        serviceArea: 'Perth metro',
      }),
    )
    if (parramatta === undefined || perth === undefined) {
      throw new Error('expected search documents')
    }

    const input = {
      query: 'emergency plumber',
      mode: 'near_me' as const,
      location: 'Perth, WA',
    }

    expect(documentMatchesRegistryQuery(parramatta, input)).toBe(false)
    expect(documentMatchesRegistryQuery(perth, input)).toBe(true)
  })

  it('resolves location from explicit context before query text', () => {
    expect(
      resolveRegistrySearchLocation({
        query: 'emergency plumber',
        mode: 'near_me',
        location: 'Perth, WA',
      }),
    ).toMatchObject({ key: 'perth', source: 'input' })
  })
})

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
      service({
        serviceArea: overrides.serviceArea ?? 'Parramatta and nearby suburbs',
      }),
    ],
    ...overrides,
  }
}

function service(
  overrides: Partial<PublicBusinessCatalogApiDto['services'][number]> = {},
): PublicBusinessCatalogApiDto['services'][number] {
  return {
    slug: 'emergency-pipe-repair',
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Emergency plumbing help for urgent pipe repairs.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Hours supplied by owner',
    firstRequest: {
      mode: 'inquiry_available',
      publicDisclosure: 'Send a qualified inquiry for owner review.',
      publicChannel: 'ae_status_only',
    },
    status: 'published',
    capabilities: [
      {
        kind: 'quote_request',
        status: 'available',
      },
    ],
    ...overrides,
  }
}

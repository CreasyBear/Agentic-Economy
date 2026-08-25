import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
  resolveRegistrySearchLocation,
} from '@/modules/registry/internal/search-documents'

describe('registry search documents', () => {
  it('builds one public search document per published Offering', () => {
    const docs = buildRegistrySearchDocumentsForCatalog(
      catalog({
        offerings: [
          offering({ offeringRef: 'offering:demo-listed-provider:listed-offering', name: 'Listed offering' }),
          offering({ offeringRef: 'offering:demo-listed-provider:blocked-drain', name: 'Blocked drain repair' }),
        ],
      }),
    )

    expect(docs).toHaveLength(2)
    expect(docs[0]).toMatchObject({
      offeringRef: 'offering:demo-listed-provider:listed-offering',
      name: 'Listed offering',
      category: 'Listed provider',
      serviceAreaSummary: 'Parramatta and nearby suburbs',
    })
    expect(docs.map((doc) => doc.documentId)).toEqual([
      'demo-listed-provider__listed-offering',
      'demo-listed-provider__blocked-drain',
    ])
    expect(docs.every((doc) => /^[A-Za-z0-9_-]+$/.test(doc.documentId))).toBe(true)
  })

  it('keeps local location matching literal', () => {
    const [parramatta] = buildRegistrySearchDocumentsForCatalog(catalog())
    if (parramatta === undefined) {
      throw new Error('expected search document')
    }

    expect(
      documentMatchesRegistryQuery(parramatta, {
        query: 'listed offering Parramatta',
      }),
    ).toBe(true)
    expect(
      documentMatchesRegistryQuery(parramatta, {
        query: 'listed offering Brunswick',
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
        slug: 'perth-listed-provider',
        name: 'Perth listed provider',
        businessContext: {
          kind: 'local_human',
          suburb: 'Perth',
          stateTerritory: 'WA',
        },
        serviceAreaSummary: 'Perth metro',
      }),
    )
    if (parramatta === undefined || perth === undefined) {
      throw new Error('expected search documents')
    }

    const input = {
      query: 'listed offering',
      mode: 'near_me' as const,
      location: 'Perth, WA',
    }

    expect(documentMatchesRegistryQuery(parramatta, input)).toBe(false)
    expect(documentMatchesRegistryQuery(perth, input)).toBe(true)
  })

  it('resolves location from explicit context before query text', () => {
    expect(
      resolveRegistrySearchLocation({
        query: 'listed offering',
        mode: 'near_me',
        location: 'Perth, WA',
      }),
    ).toMatchObject({ key: 'perth', source: 'input' })
  })
  it('extracts a place before trailing timing language', () => {
    expect(resolveRegistrySearchLocation({
      query: 'My tooth hurts and I need a dentist near Adelaide this week',
    })).toMatchObject({ key: 'adelaide', source: 'query' })
  })

})

function catalog(
  overrides: Partial<PublicBusinessCatalogApiV2Dto> & { serviceAreaSummary?: string } = {},
): PublicBusinessCatalogApiV2Dto {
  const { serviceAreaSummary = 'Parramatta and nearby suburbs', ...catalogOverrides } = overrides
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: 'business:demo-listed-provider',
    slug: 'demo-listed-provider',
    name: 'Demo listed provider',
    category: 'Listed provider',
    businessContext: {
      kind: 'local_human',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
    },
    publicUrl: '/demo-listed-provider',
    trustTier: 'claimed',
    observedAt: 1_000,
    disposition: 'current',
    photos: [],
    offerings: [offering({ serviceAreaSummary })],
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
    ...catalogOverrides,
  }
}

function offering(
  overrides: Partial<PublicBusinessCatalogApiV2Dto['offerings'][number]> = {},
): PublicBusinessCatalogApiV2Dto['offerings'][number] {
  const offeringRef = brandNonEmpty(
    overrides.offeringRef ?? 'offering:demo-listed-provider:listed-offering',
    'OfferingRef',
  )
  const accessPathRef = brandNonEmpty(
    `access:${offeringRef.slice('offering:'.length)}:inquiry`,
    'AccessPathRef',
  )
  const descriptor = {
    kind: 'human_request' as const,
    channel: 'website' as const,
    disclosure: 'Send a qualified inquiry for owner review.',
  }

  return {
    offeringRef,
    revision: 1,
    name: 'Listed offering',
    category: 'Listed provider',
    summary: 'Published listing for first contact.',
    serviceAreaSummary: 'Parramatta and nearby suburbs',
    accessPaths: [{
      accessPathRef,
      offeringRevision: 1,
      ...descriptor,
    }],
    support: { integrated: false, aeSupportedAction: false },
    ...overrides,
  }
}

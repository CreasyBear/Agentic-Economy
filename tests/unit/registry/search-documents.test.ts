import { describe, expect, it } from 'vitest'

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
          offering({ offeringRef: 'offering:parramatta-emergency-plumbing:emergency-pipe-repair', name: 'Emergency pipe repair' }),
          offering({ offeringRef: 'offering:parramatta-emergency-plumbing:blocked-drain', name: 'Blocked drain repair' }),
        ],
      }),
    )

    expect(docs).toHaveLength(2)
    expect(docs[0]).toMatchObject({
      offeringRef: 'offering:parramatta-emergency-plumbing:emergency-pipe-repair',
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      serviceAreaSummary: 'Parramatta and nearby suburbs',
    })
    expect(docs.map((doc) => doc.documentId)).toEqual([
      'parramatta-emergency-plumbing__emergency-pipe-repair',
      'parramatta-emergency-plumbing__blocked-drain',
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
        serviceAreaSummary: 'Perth metro',
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
    businessId: 'business:parramatta-emergency-plumbing',
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicUrl: '/parramatta-emergency-plumbing',
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
  return {
    offeringRef: 'offering:parramatta-emergency-plumbing:emergency-pipe-repair',
    revision: 1,
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Emergency plumbing help for urgent pipe repairs.',
    serviceAreaSummary: 'Parramatta and nearby suburbs',
    accessPaths: [{
      accessPathRef: 'access:parramatta-emergency-plumbing:emergency-pipe-repair:inquiry',
      kind: 'human_request',
      channel: 'ae_inquiry',
      disclosure: 'Send a qualified inquiry for owner review.',
    }],
    support: { integrated: false, aeSupportedAction: false },
    ...overrides,
  }
}

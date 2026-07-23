import { describe, expect, it } from 'vitest'

import { rebuildBusinessSupplyProjectionSnapshotCommand } from '../../../convex/catalogSupplyProjection'
import type { RuntimeDb, RuntimeDocument } from '../../../convex/source_state'
import type { BusinessSupplyProjection } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'
import {
  buildOfferingV2RegistrySearchDocument,
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

  it('builds one strict business-level v2 document with both profile facts and exact revisions', () => {
    const projection = offeringProjection()
    const document = buildOfferingV2RegistrySearchDocument(projection)

    expect(document).toMatchObject({
      documentId: 'offering-v2__native-supply',
      schemaVersion: 'registry-search-document:v2',
      businessSlug: 'native-supply',
      offerings: [
        {
          offeringRef: 'offering:professional',
          revision: 2,
          name: 'Native advisory',
          comparison: { profile: { profileId: 'professional_service:v1' } },
        },
        {
          offeringRef: 'offering:machine',
          revision: 4,
          name: 'Native telemetry',
          comparison: { profile: { profileId: 'machine_data:v1' } },
        },
      ],
    })
    expect(document.searchText).toContain('fixed scope')
    expect(document.searchText).toContain('graphql')
    expect(JSON.stringify(document)).not.toMatch(
      /services|trustTier|firstRequest|sourceHash|credentials|adapterConfig|privateReasons/u,
    )
  })

  it('atomically replaces and removes the v2 document from the projection rebuild transition', async () => {
    const db = new OfferingProjectionDb(offeringProjectionSeed())

    expect(
      await rebuildBusinessSupplyProjectionSnapshotCommand(
        db as unknown as RuntimeDb,
        'business:1',
        {},
        100,
      ),
    ).toMatchObject({ kind: 'ok' })
    expect(db.tables.registrySearchDocuments).toHaveLength(1)
    expect(db.tables.registrySearchDocuments?.[0]).toMatchObject({
      schemaVersion: 'registry-search-document:v2',
      businessSlug: 'native-supply',
      offerings: [{ offeringRef: 'offering:professional', revision: 2 }],
    })

    db.tables.businessOfferings![0]!.status = 'retired'
    db.tables.businessOfferings![1]!.status = 'retired'
    expect(
      await rebuildBusinessSupplyProjectionSnapshotCommand(
        db as unknown as RuntimeDb,
        'business:1',
        {},
        101,
      ),
    ).toMatchObject({ kind: 'ok' })
    expect(db.tables.registrySearchDocuments).toEqual([])

    db.tables.businessOfferings![0]!.status = 'published'
    db.tables.businessOfferings![1]!.status = 'published'
    await rebuildBusinessSupplyProjectionSnapshotCommand(
      db as unknown as RuntimeDb,
      'business:1',
      {},
      102,
    )
    db.tables.suppressionRules!.push({
      _id: 'suppression:1',
      targetType: 'business',
      targetRef: 'business:1',
      status: 'active',
    })
    expect(
      await rebuildBusinessSupplyProjectionSnapshotCommand(
        db as unknown as RuntimeDb,
        'business:1',
        {},
        103,
      ),
    ).toMatchObject({ kind: 'error' })
    expect(db.tables.registrySearchDocuments).toEqual([])
  })
})

function offeringProjection(): BusinessSupplyProjection {
  return {
    business: {
      businessId: brandNonEmpty('business:1', 'BusinessId'),
      slug: 'native-supply',
      name: 'Native Supply',
      category: 'Professional and machine data',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/native-supply',
    },
    offerings: [
      {
        offering: {
          offeringRef: brandNonEmpty('offering:professional', 'OfferingRef'),
          revision: 2,
          name: 'Native advisory',
          category: 'Advisory',
          summary: 'Professional advice for a fixed scope.',
          comparison: {
            schemaVersion: 'offering-comparison:v1',
            profile: {
              profileId: 'professional_service:v1',
              scopeBasis: known('Fixed scope'),
              priceBasis: known({ description: 'Quoted total', currency: 'AUD', amountMinor: 20_000, unit: 'total' }),
              timingBasis: known('Two weeks'),
              serviceArea: known('Perth'),
            },
          },
        },
        accessPaths: [],
        support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
      },
      {
        offering: {
          offeringRef: brandNonEmpty('offering:machine', 'OfferingRef'),
          revision: 4,
          name: 'Native telemetry',
          category: 'Machine data',
          summary: 'Hourly operational telemetry.',
          comparison: {
            schemaVersion: 'offering-comparison:v1',
            profile: {
              profileId: 'machine_data:v1',
              interfaceFormat: known('graphql'),
              requestMethod: known('POST'),
              authentication: known('api_key'),
              priceBasis: known({ description: 'Per request', currency: 'AUD', amountMinor: 5, unit: 'request' }),
              freshnessOrUpdateCadence: known('Updated hourly'),
            },
          },
        },
        accessPaths: [],
        support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
      },
    ],
    sourceRevision: 4,
    sourceDigest: brandNonEmpty('hash:projection', 'SourceHash'),
    observedAt: 100,
    disposition: 'current',
  }
}

function known<Value>(value: Value) {
  return {
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 100,
  }
}

function offeringProjectionSeed(): Record<string, RuntimeDocument[]> {
  const projection = offeringProjection()
  return {
    operatorControls: [{ _id: 'control', key: 'offering_public_projection_enabled', enabled: true }],
    businesses: [{ _id: 'business:1', publicStatus: 'published', slug: 'native-supply', name: 'Native Supply', updatedAt: 4 }],
    businessContexts: [{ _id: 'context:1', businessId: 'business:1', category: 'Professional and machine data', suburb: 'Perth', stateTerritory: 'WA' }],
    businessOfferings: projection.offerings.map((item) => ({
      _id: `business-offering:${item.offering.revision}`,
      businessId: 'business:1',
      offeringRef: item.offering.offeringRef,
      currentRevision: item.offering.revision,
      status: 'published',
      createdAt: 1,
      updatedAt: item.offering.revision,
    })),
    businessOfferingRevisions: projection.offerings.map((item) => ({
      _id: `business-offering-revision:${item.offering.revision}`,
      businessId: 'business:1',
      ...item.offering,
      sourceHash: `hash:${item.offering.revision}`,
      createdAt: 1,
    })),
    offeringAccessPaths: [],
    suppressionRules: [],
    businessSupplyProjectionSnapshots: [],
    offeringPublicRevisionHistory: [],
    registrySearchDocuments: [{
      _id: 'registry-search-document:stale',
      documentId: 'offering-v2__native-supply',
      schemaVersion: 'registry-search-document:v2',
      businessSlug: 'native-supply',
      searchText: 'stale removed term',
    }],
  }
}

class OfferingProjectionDb {
  constructor(readonly tables: Record<string, RuntimeDocument[]>) {}

  async get(id: string) {
    return Object.values(this.tables).flat().find((row) => row._id === id) ?? null
  }

  async insert(table: string, value: Record<string, unknown>) {
    const id = `${table}:new`
    ;(this.tables[table] ??= []).push({ _id: id, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>) {
    const row = Object.values(this.tables).flat().find((item) => item._id === id)
    if (row !== undefined) Object.assign(row, value)
  }

  async delete(id: string) {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id)
      if (index >= 0) rows.splice(index, 1)
    }
  }

  query(table: string) {
    let rows = [...(this.tables[table] ?? [])]
    const query = {
      withIndex: (
        _name: string,
        select: (builder: { eq: (field: string, value: unknown) => typeof builder }) => unknown,
      ) => {
        const builder = {
          eq: (field: string, value: unknown) => {
            rows = rows.filter((row) => row[field] === value)
            return builder
          },
        }
        select(builder)
        return query
      },
      collect: async () => rows,
      unique: async () => rows.length === 1 ? rows[0]! : null,
    }
    return query
  }
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

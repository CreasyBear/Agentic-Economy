import { describe, expect, it } from 'vitest'
import { catalogForBusinessFromLookup, readOfferingSupplyForBusiness } from '../../../convex/registry'
import type { RuntimeDocument, RuntimeReader } from '../../../convex/source_state'
import {
  decodeStoredBusinessSupplyProjection,
  publicBusinessCatalogApiV2DtoSchema,
} from '@/modules/registry/public'

describe('Offering registry runtime guards', () => {
  it('adapts a published legacy/compare profile with zero services to v2', () => {
    const business = { _id: 'business:1', slug: 'profile-only', name: 'Profile Only', sourceHash: 'hash:b', updatedAt: 1, trustTier: 'claimed' }
    const dto = catalogForBusinessFromLookup({
      contextsByBusinessId: new Map([['business:1', { _id: 'context:1', category: 'Engineering', suburb: 'Perth', stateTerritory: 'WA' }]]),
      servicesByBusinessId: new Map(), capabilitiesByBusinessId: new Map(), indexStatusByBusinessId: new Map(),
      latestDiscoveryAttemptByBusinessId: new Map(), activeSuppressedBusinessIds: new Set(),
    } as never, business)
    expect(dto).toMatchObject({ slug: 'profile-only', services: [] })
  })

  it('live-refuses active suppression before legacy or snapshot projection for list, search and detail consumers', async () => {
    const db = new SuppressedReader()
    const business = { _id: 'business:1', slug: 'hidden', publicStatus: 'published' }
    expect(await readOfferingSupplyForBusiness(db as unknown as RuntimeReader, business)).toBeUndefined()
    expect(db.tablesRead).toEqual(['suppressionRules'])
  })

  it('hydrates a greenfield native Offering snapshot through the shared list/search/detail read seam', async () => {
    const db = new NativeReader()
    const item = await readOfferingSupplyForBusiness(db as unknown as RuntimeReader, { _id: 'business:1', slug: 'native', publicStatus: 'published' })
    expect(item).toMatchObject({ slug: 'native', offerings: [{ name: 'Native advisory' }] })
  })

  it('strictly refuses hostile, private, extra, and legacy stored snapshot shapes', () => {
    const valid = nativeProjection()
    expect(decodeStoredBusinessSupplyProjection(valid)).toEqual({
      kind: 'valid',
      projection: valid,
    })
    for (const hostile of [
      { ...valid, credentials: { apiKey: 'private' } },
      { ...valid, adapterConfig: { endpoint: 'https://private.example' } },
      { ...valid, privateReasons: ['internal'] },
      { ...valid, services: [] },
      {
        ...valid,
        offerings: [{
          ...valid.offerings[0],
          offering: {
            ...valid.offerings[0]!.offering,
            sourceHash: 'hash:private',
          },
        }],
      },
    ]) {
      expect(decodeStoredBusinessSupplyProjection(hostile)).toEqual({
        kind: 'invalid',
        reason: 'invalid_offering_snapshot',
      })
    }
  })

  it('strictly refuses extra, private, and legacy fields in the public v2 DTO', () => {
    const publicDto = {
      schemaVersion: 'public-business-catalog-api:v2',
      businessId: 'business:1',
      slug: 'native',
      name: 'Native Co',
      category: 'Advisory',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/native',
      observedAt: 100,
      disposition: 'current',
      offerings: [],
      accessSummary: {
        humanRequest: false,
        externalOperation: false,
        aeSupportedAction: false,
      },
    }
    for (const hostile of [
      { ...publicDto, sourceHash: 'hash:private' },
      { ...publicDto, credentials: { apiKey: 'private' } },
      { ...publicDto, services: [] },
      { ...publicDto, trustTier: 'claimed' },
    ]) {
      expect(publicBusinessCatalogApiV2DtoSchema.safeParse(hostile).success).toBe(false)
    }
  })
})

function nativeProjection() {
  return {
    business: {
      businessId: 'business:1',
      slug: 'native',
      name: 'Native Co',
      category: 'Advisory',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicUrl: '/native',
    },
    offerings: [{
      offering: {
        offeringRef: 'offering:1',
        revision: 1,
        name: 'Native advisory',
        category: 'Advisory',
        summary: 'Native Offering.',
        comparison: {
          schemaVersion: 'offering-comparison:v1',
          profile: {
            profileId: 'professional_service:v1',
            scopeBasis: fact('Fixed scope'),
            priceBasis: fact({ description: 'Quoted total', currency: 'AUD', amountMinor: 10_000, unit: 'total' }),
            timingBasis: fact('Two weeks'),
            serviceArea: fact('Perth'),
          },
        },
      },
      accessPaths: [],
      support: {
        integrated: false,
        routeable: false,
        reasons: ['not_integrated'],
      },
    }],
    sourceRevision: 1,
    sourceDigest: 'hash:projection',
    observedAt: 100,
    disposition: 'current',
  } as const
}

function fact<T>(value: T) {
  return {
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 100,
  }
}

class SuppressedReader {
  tablesRead: string[] = []
  query(table: string) {
    this.tablesRead.push(table)
    const query = {
      withIndex: (_: string, select: (builder: any) => unknown) => { const builder = { eq: () => builder }; select(builder); return query },
      unique: async () => ({ _id: 'suppression:1', status: 'active' } as RuntimeDocument),
      collect: async () => [],
    }
    return query
  }
}

class NativeReader {
  query(table: string) {
    const rows: Record<string, RuntimeDocument[]> = {
      suppressionRules: [],
      catalogSupplyCutovers: [{ _id: 'cutover', businessId: 'business:1', mode: 'offering' }],
      businessSupplyProjectionSnapshots: [{ _id: 'snapshot', businessId: 'business:1', status: 'current', projectionJson: JSON.stringify({
        business: { businessId: 'business:1', slug: 'native', name: 'Native Co', category: 'Advisory', suburb: 'Perth', stateTerritory: 'WA', publicUrl: '/native' },
        offerings: [{ offering: { offeringRef: 'offering:1', revision: 1, name: 'Native advisory', category: 'Advisory', summary: 'Native Offering.' }, accessPaths: [], support: { integrated: false, routeable: false, reasons: ['not_integrated'] } }],
        sourceRevision: 1, sourceDigest: 'hash:projection', observedAt: Date.now(), disposition: 'current',
      }) }],
    }
    let selected = [...(rows[table] ?? [])]
    const query = { withIndex: (_: string, select: (builder: any) => unknown) => { const builder = { eq: (field: string, value: unknown) => { selected = selected.filter((row) => row[field] === value); return builder } }; select(builder); return query }, unique: async () => selected.length === 1 ? selected[0]! : null, collect: async () => selected }
    return query
  }
}

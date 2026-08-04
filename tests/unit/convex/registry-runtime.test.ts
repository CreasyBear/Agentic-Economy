import { describe, expect, it } from 'vitest'

import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
} from '../../../convex/registry'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Filter = { op: 'eq' | 'search'; field: string; value: unknown }
type ReadTrace = { tableName: string; indexName?: string; operation: 'first' | 'take' | 'unique' | 'paginate' | 'collect'; limit?: number; filters: Filter[] }
type IndexBuilder = { eq: (field: string, value: unknown) => IndexBuilder; search: (field: string, value: string) => IndexBuilder }
type PaginationOpts = { numItems: number; cursor: string | null }
type QueryCtx = { db: FakeDb }

type QueryResult = {
  kind: 'ok'
  page?: Array<{ slug: string }>
  items?: Array<{ slug: string }>
  pagination?: { total: number; hasMore: boolean }
}

const listHandler = (listPublicBusinessOfferingSupply as unknown as { _handler: (ctx: QueryCtx, args: { paginationOpts: PaginationOpts }) => Promise<QueryResult> })._handler
const searchHandler = (searchPublicBusinessOfferingSupply as unknown as { _handler: (ctx: QueryCtx, args: { query: string; location?: string; limit?: number }) => Promise<QueryResult> })._handler
const detailHandler = (getPublicBusinessOfferingSupplyBySlug as unknown as { _handler: (ctx: QueryCtx, args: { slug: string }) => Promise<unknown> })._handler

describe('Convex registry public read paths', () => {
  it('lists published businesses with one native page and bounded snapshot hydration', async () => {
    const db = new FakeDb()
    seedBusinesses(db, 12)

    const page = await listHandler({ db }, { paginationOpts: { cursor: null, numItems: 2 } })

    expect(page).toMatchObject({
      kind: 'ok',
      page: [{ slug: 'business-001' }, { slug: 'business-002' }],
      isDone: false,
    })
    expect(db.reads.some((read) => read.operation === 'paginate' && read.tableName === 'businesses')).toBe(true)
    expect(db.reads.some((read) => read.operation === 'collect')).toBe(false)
    expect(db.reads.every((read) => ['businesses', 'suppressionRules', 'businessSupplyProjectionSnapshots'].includes(read.tableName))).toBe(true)
  })

  it('point-reads detail by slug from the current Offering snapshot', async () => {
    const db = new FakeDb()
    seedBusinesses(db, 20)

    const result = await detailHandler({ db }, { slug: 'business-010' })

    expect(result).toMatchObject({
      kind: 'found',
      business: { slug: 'business-010', offerings: [{ name: 'Emergency pipe repair' }] },
    })
    expect(db.reads.some((read) => read.operation === 'collect')).toBe(false)
    expect(db.reads.every((read) => ['businesses', 'suppressionRules', 'businessSupplyProjectionSnapshots'].includes(read.tableName))).toBe(true)
  })
  it('decodes a legacy JSON projection without losing Offering identity', async () => {
    const db = new FakeDb()
    const businessId = 'businesses:legacy'
    db.seed('businesses', {
      _id: businessId,
      _creationTime: 1,
      ownerId: 'owners:legacy',
      slug: 'legacy-business',
      name: 'Legacy Business',
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicStatus: 'published',
      trustTier: 'claimed',
    })
    db.seed('businessSupplyProjectionSnapshots', {
      _id: 'businessSupplyProjectionSnapshots:legacy',
      _creationTime: 1,
      businessId,
      sourceRevision: 1,
      sourceDigest: 'digest:legacy',
      observedAt: 1,
      disposition: 'current',
      status: 'current',
      projectionJson: JSON.stringify({
        business: {
          businessId,
          slug: 'legacy-business',
          name: 'Legacy Business',
          category: 'Emergency plumbing',
          suburb: 'Parramatta',
          stateTerritory: 'NSW',
          publicUrl: '/legacy-business',
          trustTier: 'claimed',
        },
        offerings: [{
          offering: {
            offeringRef: 'offering:legacy:pipe-repair',
            revision: 1,
            name: 'Emergency pipe repair',
            category: 'Emergency plumbing',
            summary: 'Emergency plumbing help.',
          },
          accessPaths: [],
          support: { integrated: false, routeable: false, reasons: [] },
        }],
        sourceRevision: 1,
        sourceDigest: 'digest:legacy',
        observedAt: 1,
        disposition: 'current',
      }),
    })

    const result = await detailHandler({ db }, { slug: 'legacy-business' })

    expect(result).toMatchObject({
      kind: 'found',
      business: {
        slug: 'legacy-business',
        offerings: [{ offeringRef: 'offering:legacy:pipe-repair', name: 'Emergency pipe repair' }],
      },
    })
  })

  it('uses the bounded registry search index and hydrates canonical snapshots', async () => {
    const db = new FakeDb()
    seedBusinesses(db, 20)
    db.seed('registrySearchDocuments', {
      _id: 'registrySearchDocuments:1',
      _creationTime: 100,
      businessSlug: 'business-007',
      documentId: 'business-007__emergency-pipe-repair',
      schemaVersion: 'registry-search-document:v1',
      offeringRef: 'offering:007:emergency-pipe-repair',
      businessName: 'Business 007',
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      categoryKey: 'emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      trustTier: 'claimed',
      firstRequestMode: 'not_available_yet',
      keywords: ['emergency', 'plumber', 'plumbing'],
      serviceAreaSummary: 'Parramatta and nearby suburbs',
      generatedHash: 'hash:registry-search-007',
      updatedAt: 100,
      placeKeys: ['parramatta', 'parramatta nsw', 'nsw'],
      searchText: 'business 007 emergency pipe repair emergency plumbing plumber parramatta nsw',
      publicStatus: 'published',
    })

    const page = await searchHandler({ db }, { query: 'emergency plumber parramatta', limit: 5 })

    expect(page).toMatchObject({ kind: 'ok', query: 'emergency plumber parramatta', items: [{ slug: 'business-007' }], pagination: { total: 1, hasMore: false } })
    expect(db.reads.some((read) => read.tableName === 'registrySearchDocuments' && read.indexName === 'search_searchText_by_publicStatus' && read.operation === 'take' && read.limit === 250)).toBe(true)
    expect(db.reads.some((read) => read.operation === 'collect')).toBe(false)
    expect(db.reads.every((read) => ['businesses', 'suppressionRules', 'businessSupplyProjectionSnapshots', 'registrySearchDocuments'].includes(read.tableName))).toBe(true)
  })

  it('does not mistake an unqualified capability query for a location', async () => {
    const db = new FakeDb()
    seedBusinesses(db, 1)
    const business = db.table('businesses')[0]
    const snapshot = db.table('businessSupplyProjectionSnapshots')[0]
    if (business === undefined || snapshot === undefined) throw new Error('registry fixture missing')
    business.name = 'Frankfurter Rates'
    const projection = snapshot.projection as {
      business: { name: string }
      offerings: Array<{ offering: { name: string; category: string; summary: string } }>
    }
    projection.business.name = 'Frankfurter Rates'
    const offering = projection.offerings[0]?.offering
    if (offering === undefined) throw new Error('registry offering fixture missing')
    offering.name = 'Currency exchange rates'
    offering.category = 'Currency data'
    offering.summary = 'Current European Central Bank reference exchange rates.'
    db.seed('registrySearchDocuments', {
      _id: 'registrySearchDocuments:frankfurter',
      _creationTime: 100,
      businessSlug: 'business-001',
      documentId: 'business-001__currency-exchange-rates',
      schemaVersion: 'registry-search-document:v1',
      offeringRef: 'offering:001',
      businessName: 'Frankfurter Rates',
      name: 'Currency exchange rates',
      category: 'Currency data',
      categoryKey: 'currency data',
      suburb: 'Online',
      stateTerritory: 'External',
      trustTier: 'claimed',
      firstRequestMode: 'not_available_yet',
      keywords: ['currency', 'exchange', 'rates'],
      serviceAreaSummary: 'Online',
      generatedHash: 'hash:registry-search-frankfurter',
      updatedAt: 100,
      placeKeys: ['external', 'online'],
      searchText: 'frankfurter rates currency exchange rates current european central bank reference exchange rates online',
      publicStatus: 'published',
    })

    const page = await searchHandler({ db }, { query: 'Frankfurter currency rates', limit: 5 })

    expect(page).toMatchObject({ kind: 'ok', items: [{ slug: 'business-001' }] })
  })

  it('falls back to the bounded public-status index while search documents backfill', async () => {
    const db = new FakeDb({ emptySearchIndex: true })
    seedBusinesses(db, 20)
    db.seed('registrySearchDocuments', {
      _id: 'registrySearchDocuments:1',
      _creationTime: 100,
      businessSlug: 'business-007',
      documentId: 'business-007__emergency-pipe-repair',
      schemaVersion: 'registry-search-document:v1',
      offeringRef: 'offering:007:emergency-pipe-repair',
      businessName: 'Business 007',
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      categoryKey: 'emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      trustTier: 'claimed',
      firstRequestMode: 'not_available_yet',
      keywords: ['emergency', 'plumber', 'plumbing'],
      serviceAreaSummary: 'Parramatta and nearby suburbs',
      generatedHash: 'hash:registry-search-007',
      updatedAt: 100,
      placeKeys: ['parramatta', 'parramatta nsw', 'nsw'],
      searchText: 'business 007 emergency pipe repair emergency plumbing plumber parramatta nsw',
      publicStatus: 'published',
    })

    const page = await searchHandler({ db }, { query: 'emergency plumber parramatta', limit: 5 })

    expect(page).toMatchObject({ kind: 'ok', items: [{ slug: 'business-007' }] })
    expect(db.reads.some((read) => read.tableName === 'registrySearchDocuments' && read.indexName === 'by_publicStatus_updatedAt' && read.operation === 'take' && read.limit === 250)).toBe(true)
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: Filter[] = []
  eq(field: string, value: unknown): IndexBuilder { this.filters.push({ op: 'eq', field, value }); return this }
  search(field: string, value: string): IndexBuilder { this.filters.push({ op: 'search', field, value }); return this }
}

class FakeQuery {
  constructor(private readonly db: FakeDb, private readonly tableName: string, private readonly filters: readonly Filter[] = [], private readonly indexName?: string) {}
  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): FakeQuery { const builder = new FakeIndexBuilder(); callback(builder); return new FakeQuery(this.db, this.tableName, builder.filters, indexName) }
  withSearchIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): FakeQuery { const builder = new FakeIndexBuilder(); callback(builder); return new FakeQuery(this.db, this.tableName, builder.filters, indexName) }
  async first(): Promise<Row | null> { this.db.trace(this.tableName, 'first', this.filters, this.indexName); return this.apply()[0] ?? null }
  async unique(): Promise<Row | null> { this.db.trace(this.tableName, 'unique', this.filters, this.indexName); return this.apply()[0] ?? null }
  async take(limit: number): Promise<Row[]> { this.db.trace(this.tableName, 'take', this.filters, this.indexName, limit); return this.apply().slice(0, limit) }
  async paginate(options: PaginationOpts): Promise<{ page: Row[]; isDone: boolean; continueCursor: string }> {
    this.db.trace(this.tableName, 'paginate', this.filters, this.indexName, options.numItems)
    const rows = this.apply()
    const start = options.cursor === null ? 0 : Number(options.cursor.replace('offset:', ''))
    const end = Math.min(start + options.numItems, rows.length)
    return { page: rows.slice(start, end), isDone: end >= rows.length, continueCursor: `offset:${end}` }
  }
  private apply(): Row[] { return this.db.emptySearchIndex && this.indexName === 'search_searchText_by_publicStatus' ? [] : this.db.table(this.tableName).filter((row) => this.filters.every((filter) => matchesFilter(row, filter))).sort((left, right) => String(left.slug ?? '').localeCompare(String(right.slug ?? ''))) }
}

class FakeDb {
  readonly reads: ReadTrace[] = []
  readonly emptySearchIndex: boolean
  private readonly tables: Record<string, Row[]> = {}
  constructor(options: { emptySearchIndex?: boolean } = {}) { this.emptySearchIndex = options.emptySearchIndex ?? false }
  query(tableName: string): FakeQuery { return new FakeQuery(this, tableName) }
  normalizeId(tableName: string, value: string): string | null { return value.startsWith(`${tableName}:`) ? value : null }
  async get(id: string): Promise<Row | null> { return Object.values(this.tables).flat().find((row) => row._id === id) ?? null }
  seed(tableName: string, row: Row): void { (this.tables[tableName] ??= []).push(row) }
  table(tableName: string): Row[] { return this.tables[tableName] ?? [] }
  trace(tableName: string, operation: ReadTrace['operation'], filters: readonly Filter[], indexName?: string, limit?: number): void { this.reads.push({ tableName, operation, filters: [...filters], ...(indexName === undefined ? {} : { indexName }), ...(limit === undefined ? {} : { limit }) }) }
}

function seedBusinesses(db: FakeDb, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    const suffix = String(index).padStart(3, '0')
    const businessId = `businesses:${suffix}`
    const slug = `business-${suffix}`
    db.seed('businesses', { _id: businessId, _creationTime: index, ownerId: `owners:${suffix}`, slug, name: `Business ${suffix}`, normalizedName: `business ${suffix}`, category: 'Emergency plumbing', suburb: 'Parramatta', stateTerritory: 'NSW', publicStatus: 'published', trustTier: 'claimed', claimStatus: 'claimed', sourceHash: canonicalDigest(`business:${suffix}`), createdAt: index, updatedAt: index })
    db.seed('businessSupplyProjectionSnapshots', { _id: `snapshots:${suffix}`, _creationTime: index, businessId, sourceRevision: 1, sourceDigest: canonicalDigest(`projection:${suffix}`), observedAt: index, disposition: 'current', updatedAt: index, status: 'current', projection: { business: { businessId, slug, name: `Business ${suffix}`, category: 'Emergency plumbing', suburb: 'Parramatta', stateTerritory: 'NSW', publicUrl: `/${slug}`, trustTier: 'claimed' }, offerings: [{ offering: { offeringRef: `offering:${suffix}`, revision: 1, name: 'Emergency pipe repair', category: 'Emergency plumbing', summary: 'Emergency plumbing help for urgent pipe repairs.', serviceAreaSummary: 'Parramatta and nearby suburbs' }, accessPaths: [], support: { integrated: false, routeable: false, reasons: ['not_integrated'] } }], sourceRevision: 1, sourceDigest: canonicalDigest(`projection:${suffix}`), observedAt: index, disposition: 'current' } })
  }
}

function matchesFilter(row: Row, filter: Filter): boolean {
  if (filter.op === 'eq') return row[filter.field] === filter.value
  return String(filter.value).split(/\s+/).filter(Boolean).every((token) => String(row[filter.field] ?? '').split(/\s+/).includes(token))
}

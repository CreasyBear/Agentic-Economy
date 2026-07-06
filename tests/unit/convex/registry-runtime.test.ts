import { describe, expect, it } from 'vitest'

import {
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '../../../convex/registry'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Filter =
  | { op: 'eq'; field: string; value: unknown }
  | { op: 'gte'; field: string; value: unknown }
  | { op: 'search'; field: string; value: string }
type ReadTrace = {
  tableName: string
  indexName?: string
  operation: 'collect' | 'first' | 'take' | 'unique'
  limit?: number
  filters: Filter[]
}

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
  gte: (field: string, value: unknown) => IndexBuilder
  search: (field: string, value: string) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  withSearchIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  first: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
  unique: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
}

type QueryCtx = { db: Db }

const listHandler = (listPublicBusinessCatalog as unknown as {
  _handler: (ctx: QueryCtx, args: { cursor?: string; limit?: number }) => Promise<unknown>
})._handler
const searchHandler = (searchPublicBusinessCatalog as unknown as {
  _handler: (
    ctx: QueryCtx,
    args: {
      query: string
      mode?: 'near_me' | 'whole_catalogue'
      location?: string
      cursor?: string
      limit?: number
    },
  ) => Promise<unknown>
})._handler
const detailHandler = (getPublicBusinessCatalogBySlug as unknown as {
  _handler: (ctx: QueryCtx, args: { slug: string }) => Promise<unknown>
})._handler

describe('Convex registry public read paths', () => {
  it('lists public catalogs by paged published businesses and scoped hydration reads', async () => {
    const db = new FakeDb()
    seedCatalogs(db, 12)

    const page = await listHandler({ db }, { limit: 2 })

    expect(page).toMatchObject({
      kind: 'ok',
      items: [{ slug: 'business-001', businessId: 'businesses:001' }, { slug: 'business-002', businessId: 'businesses:002' }],
      pagination: {
        nextCursor: 'business-003',
        limit: 2,
        total: 12,
        hasMore: true,
      },
    })
    expect(unscopedCollects(db.reads)).toEqual([])
    expect(scopedCollects(db.reads, 'businessServices')).toHaveLength(3)
    expect(scopedCollects(db.reads, 'serviceCapabilities')).toHaveLength(3)
  })

  it('hydrates detail by slug without loading the public catalog table set', async () => {
    const db = new FakeDb()
    seedCatalogs(db, 20)

    const result = await detailHandler({ db }, { slug: 'business-010' })

    expect(result).toMatchObject({
      kind: 'found',
      business: {
        slug: 'business-010',
        services: [{ slug: 'service-010', status: 'published' }],
      },
    })
    expect(unscopedCollects(db.reads)).toEqual([])
    expect(
      db.reads.filter(
        (read) =>
          read.tableName === 'businesses' &&
          read.indexName === 'by_publicStatus_slug',
      ),
    ).toEqual([])
  })

  it('searches through bounded registry search documents before hydrating matching slugs', async () => {
    const db = new FakeDb()
    seedCatalogs(db, 20)
    db.seed('registrySearchDocuments', {
      _id: 'registrySearchDocuments:1',
      _creationTime: 100,
      documentId: 'business-007__service-007',
      schemaVersion: 'registry-search-document:v1',
      businessSlug: 'business-007',
      serviceSlug: 'service-007',
      businessName: 'Business 007',
      serviceName: 'Emergency pipe repair',
      serviceCategory: 'Emergency plumbing',
      serviceCategoryKey: 'emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicStatus: 'published',
      trustTier: 'claimed',
      firstRequestMode: 'inquiry_available',
      placeKeys: ['parramatta', 'parramatta nsw', 'nsw'],
      serviceKeywords: ['plumber', 'plumbers'],
      searchText: 'business 007 emergency pipe repair emergency plumbing plumber parramatta nsw',
      serviceArea: 'Parramatta and nearby suburbs',
      generatedHash: 'hash:search:007',
      updatedAt: 7,
    })

    const page = await searchHandler(
      { db },
      { query: 'emergency plumber parramatta', limit: 5 },
    )

    expect(page).toMatchObject({
      kind: 'ok',
      query: 'emergency plumber parramatta',
      items: [{ slug: 'business-007' }],
      pagination: { total: 1, hasMore: false },
    })
    expect(
      db.reads.filter(
        (read) =>
          read.tableName === 'registrySearchDocuments' &&
          read.indexName === 'search_searchText_by_publicStatus' &&
          read.operation === 'take' &&
          read.limit === 250,
      ),
    ).toHaveLength(1)
    expect(
      db.reads.filter(
        (read) =>
          read.tableName === 'businesses' &&
          read.indexName === 'by_publicStatus_slug',
      ),
    ).toEqual([])
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: Filter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ op: 'eq', field, value })
    return this
  }

  gte(field: string, value: unknown): IndexBuilder {
    this.filters.push({ op: 'gte', field, value })
    return this
  }

  search(field: string, value: string): IndexBuilder {
    this.filters.push({ op: 'search', field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly db: FakeDb,
    private readonly tableName: string,
    private readonly filters: readonly Filter[] = [],
    private readonly indexName?: string,
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.db, this.tableName, builder.filters, indexName)
  }

  withSearchIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.db, this.tableName, builder.filters, indexName)
  }

  async collect(): Promise<Row[]> {
    this.db.trace(this.tableName, 'collect', this.filters, this.indexName)
    return this.apply()
  }

  async first(): Promise<Row | null> {
    this.db.trace(this.tableName, 'first', this.filters, this.indexName)
    return this.apply().at(0) ?? null
  }

  async take(limit: number): Promise<Row[]> {
    this.db.trace(this.tableName, 'take', this.filters, this.indexName, limit)
    return this.apply().slice(0, limit)
  }

  async unique(): Promise<Row | null> {
    this.db.trace(this.tableName, 'unique', this.filters, this.indexName)
    return this.apply().at(0) ?? null
  }

  private apply(): Row[] {
    return this.db
      .table(this.tableName)
      .filter((row) => this.filters.every((filter) => matchesFilter(row, filter)))
      .sort((left, right) => rowSort(left, right))
  }
}

class FakeDb implements Db {
  readonly reads: ReadTrace[] = []
  private readonly tables: Record<string, Row[]> = {}

  query(tableName: string): Query {
    return new FakeQuery(this, tableName)
  }

  async get(id: string): Promise<Row | null> {
    return Object.values(this.tables)
      .flat()
      .find((row) => row._id === id) ?? null
  }

  seed(tableName: string, row: Row): void {
    this.table(tableName).push(row)
  }

  table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }

  trace(
    tableName: string,
    operation: ReadTrace['operation'],
    filters: readonly Filter[],
    indexName?: string,
    limit?: number,
  ): void {
    this.reads.push({
      tableName,
      operation,
      filters: [...filters],
      ...(indexName === undefined ? {} : { indexName }),
      ...(limit === undefined ? {} : { limit }),
    })
  }
}

function seedCatalogs(db: FakeDb, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    const suffix = String(index).padStart(3, '0')
    const businessId = `businesses:${suffix}`
    const serviceId = `businessServices:${suffix}`
    const slug = `business-${suffix}`

    db.seed('businesses', {
      _id: businessId,
      _creationTime: index,
      ownerId: `owners:${suffix}`,
      slug,
      name: `Business ${suffix}`,
      normalizedName: `business ${suffix}`,
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      publicStatus: 'published',
      trustTier: 'claimed',
      claimStatus: 'published',
      sourceHash: `hash:business:${suffix}`,
      createdAt: index,
      updatedAt: index,
    })
    db.seed('businessContexts', {
      _id: `businessContexts:${suffix}`,
      _creationTime: index,
      businessId,
      category: 'Emergency plumbing',
      suburb: 'Parramatta',
      stateTerritory: 'NSW',
      sourceRefs: [],
      sourceHash: `hash:business:${suffix}`,
      approvedAt: index,
    })
    db.seed('businessServices', {
      _id: serviceId,
      _creationTime: index,
      businessId,
      serviceSlug: `service-${suffix}`,
      name: 'Emergency pipe repair',
      category: 'Emergency plumbing',
      summary: 'Emergency plumbing help for urgent pipe repairs.',
      serviceArea: 'Parramatta and nearby suburbs',
      hoursOrUnknown: 'Owner supplied hours',
      status: 'published',
      sortOrder: 0,
      sourceHash: `hash:service:${suffix}`,
      createdAt: index,
      updatedAt: index,
    })
    db.seed('serviceCapabilities', {
      _id: `serviceCapabilities:${suffix}`,
      _creationTime: index,
      businessId,
      serviceId,
      kind: 'quote_request',
      status: 'available',
      firstRequestMode: 'inquiry_available',
      publicDisclosure: 'Send a qualified inquiry for owner review.',
      publicChannel: 'ae_status_only',
      callable: false,
      paymentRequired: false,
      sourceHash: `hash:capability:${suffix}`,
      createdAt: index,
      updatedAt: index,
    })
  }
}

function matchesFilter(row: Row, filter: Filter): boolean {
  if (filter.op === 'eq') {
    return row[filter.field] === filter.value
  }
  if (filter.op === 'gte') {
    return String(row[filter.field] ?? '') >= String(filter.value)
  }

  const haystack = String(row[filter.field] ?? '')
  return filter.value
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

function rowSort(left: Row, right: Row): number {
  const leftSlug = typeof left.slug === 'string' ? left.slug : ''
  const rightSlug = typeof right.slug === 'string' ? right.slug : ''
  return leftSlug.localeCompare(rightSlug)
}

function unscopedCollects(reads: readonly ReadTrace[]): ReadTrace[] {
  return reads.filter(
    (read) => read.operation === 'collect' && read.filters.length === 0,
  )
}

function scopedCollects(reads: readonly ReadTrace[], tableName: string): ReadTrace[] {
  return reads.filter(
    (read) =>
      read.tableName === tableName &&
      read.operation === 'collect' &&
      read.filters.length > 0,
  )
}

import { describe, expect, it } from 'vitest'

import { persistDevSeedCatalogState } from '../../../convex/devSeedStore'
import { DEV_SEED_BUSINESS_FIXTURES, buildDevSeedCatalogState } from '../../../src/modules/dev/public'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }
type QueryRead = {
  tableName: string
  indexName: string | null
  method: 'collect' | 'first' | 'unique'
  documentsRead: number
}

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  first: () => Promise<Row | null>
  unique: () => Promise<Row | null>
}

describe('dev seed Convex store', () => {
  it('persists the fixture with indexed lookups instead of table scans', async () => {
    const db = new FakeDb()
    seedUnrelatedRows(db, 250)
    const bundle = buildDevSeedCatalogState(DEV_SEED_BUSINESS_FIXTURES.slice(0, 3))

    await persistDevSeedCatalogState(db, bundle)
    await persistDevSeedCatalogState(db, bundle)

    const seededBusinesses = db
      .dump('businesses')
      .filter((row) => bundle.seededSlugs.includes(String(row.slug)))
    expect(seededBusinesses).toHaveLength(3)
    expect(seededBusinesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'joondalup-rapid-plumbing', publishedPhone: '0412 345 678' }),
      expect.objectContaining({ slug: 'fremantle-coastal-electrical', publishedPhone: '(08) 9430 1234' }),
    ]))
    expect(seededBusinesses.find((row) => row.slug === 'plumbing-demo')?.publishedPhone).toBeUndefined()
    expect(db.dump('capabilityLaunchSupportRecords').filter((row) => row.supportRecordId === 'support:dev-seed:human-inquiry-owner-inbox')).toHaveLength(1)

    expect(db.reads().filter((read) => read.indexName === null)).toEqual([])
    expect(
      db
        .reads()
        .filter((read) => ['businessServices', 'serviceCapabilities', 'claims', 'claimFingerprints'].includes(read.tableName))
        .every((read) => read.documentsRead <= 1)
    ).toBe(true)
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: EqFilter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly tableName: string,
    private readonly rows: readonly Row[],
    private readonly queryReads: QueryRead[],
    private readonly filters: readonly EqFilter[] = [],
    private readonly indexName: string | null = null
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.tableName, this.rows, this.queryReads, [...this.filters, ...builder.filters], indexName)
  }

  async collect(): Promise<Row[]> {
    const rows = this.filteredRows()
    this.recordRead('collect', rows.length)
    return rows
  }

  async first(): Promise<Row | null> {
    const rows = this.filteredRows()
    this.recordRead('first', Math.min(rows.length, 1))
    return rows.at(0) ?? null
  }

  async unique(): Promise<Row | null> {
    const rows = this.filteredRows()
    this.recordRead('unique', rows.length)
    if (rows.length > 1) {
      throw new Error(`Expected unique ${this.tableName} row, found ${rows.length}.`)
    }
    return rows.at(0) ?? null
  }

  private filteredRows(): Row[] {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  private recordRead(method: QueryRead['method'], indexedDocumentsRead: number): void {
    this.queryReads.push({
      tableName: this.tableName,
      indexName: this.indexName,
      method,
      documentsRead: this.indexName === null ? this.rows.length : indexedDocumentsRead,
    })
  }
}

class FakeDb {
  private readonly tables: Record<string, Row[]> = {}
  private readonly queryReads: QueryRead[] = []
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(tableName, this.table(tableName), this.queryReads)
  }

  async get(id: string): Promise<Row | null> {
    return Object.values(this.tables).flat().find((candidate) => candidate._id === id) ?? null
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:seeded-${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) {
      throw new Error(`Missing row ${id}.`)
    }
    Object.assign(row, value)
  }

  seed(tableName: string, row: Row): void {
    this.table(tableName).push(row)
  }

  dump(tableName: string): Row[] {
    return [...this.table(tableName)]
  }

  reads(): QueryRead[] {
    return [...this.queryReads]
  }

  private table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }
}

function seedUnrelatedRows(db: FakeDb, count: number): void {
  for (let index = 0; index < count; index += 1) {
    db.seed('businesses', row('businesses', index, { slug: `unrelated-business-${index}` }))
    db.seed('businessContexts', row('businessContexts', index, { businessId: `businesses:unrelated-${index}` }))
    db.seed('claims', row('claims', index, { businessId: `businesses:unrelated-${index}`, status: 'published' }))
    db.seed('claimFingerprints', row('claimFingerprints', index, { fingerprint: `claim:unrelated-${index}`, status: 'claimed' }))
    db.seed('businessServices', row('businessServices', index, { businessId: `businesses:unrelated-${index}`, serviceSlug: `service-${index}` }))
    db.seed(
      'serviceCapabilities',
      row('serviceCapabilities', index, {
        businessId: `businesses:unrelated-${index}`,
        serviceId: `businessServices:unrelated-${index}`,
        kind: 'phone_inquiry',
      })
    )
    db.seed('capabilityLaunchSupportRecords', row('capabilityLaunchSupportRecords', index, { supportRecordId: `support:unrelated-${index}` }))
  }
}

function row(tableName: string, index: number, value: Record<string, unknown>): Row {
  return {
    _id: `${tableName}:unrelated-${index}`,
    _creationTime: index + 1,
    ...value,
  }
}

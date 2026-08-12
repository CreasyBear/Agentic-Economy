import { describe, expect, it } from 'vitest'

import { listPublicBusinessOfferingSupply } from '../../../convex/registry'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type PaginationOpts = { numItems: number; cursor: string | null }
type IndexBuilder = { eq: (field: string, value: unknown) => IndexBuilder }
type QueryCtx = { db: TestDb }
type ListResult = { page: Array<{ slug: string }>; isDone: boolean; continueCursor: string }

const listHandler = (listPublicBusinessOfferingSupply as unknown as { _handler: (ctx: QueryCtx, args: { paginationOpts: PaginationOpts }) => Promise<ListResult> })._handler

describe('Convex native registry pagination', () => {
  it('walks current Offering snapshots with native cursors', async () => {
    const db = new TestDb(seedBusinesses(1_000))
    const result: string[] = []
    let cursor: string | null = null

    for (let page = 0; page < 100; page += 1) {
      const next = await listHandler({ db }, { paginationOpts: { cursor, numItems: 37 } })
      result.push(...next.page.map((item) => item.slug))
      if (next.isDone) break
      cursor = next.continueCursor
    }

    expect(result).toHaveLength(1_000)
    expect(new Set(result).size).toBe(1_000)
    expect(result[0]).toBe('business-0001')
    expect(result.at(-1)).toBe('business-1000')
  })
})

class TestQuery {
  constructor(private readonly db: TestDb, private readonly tableName: string, private readonly filters: readonly [string, unknown][] = [], private readonly indexName?: string) {}
  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): TestQuery { const builder = new TestIndexBuilder(); callback(builder); return new TestQuery(this.db, this.tableName, builder.filters, indexName) }
  async unique(): Promise<Row | null> { return this.rows()[0] ?? null }
  async paginate(options: PaginationOpts): Promise<{ page: Row[]; isDone: boolean; continueCursor: string }> { const rows = this.rows(); const start = options.cursor === null ? 0 : Number(options.cursor.replace('offset:', '')); const end = Math.min(start + options.numItems, rows.length); return { page: rows.slice(start, end), isDone: end >= rows.length, continueCursor: `offset:${end}` } }
  private rows(): Row[] { return this.db.table(this.tableName).filter((row) => this.filters.every(([field, value]) => row[field] === value)).sort((left, right) => String(left.slug ?? '').localeCompare(String(right.slug ?? ''))) }
}

class TestIndexBuilder implements IndexBuilder {
  readonly filters: [string, unknown][] = []
  eq(field: string, value: unknown): IndexBuilder { this.filters.push([field, value]); return this }
}

class TestDb {
  constructor(private readonly rows: readonly Row[]) {}
  query(tableName: string): TestQuery { return new TestQuery(this, tableName) }
  normalizeId(tableName: string, value: string): string | null { return value.startsWith(`${tableName}:`) ? value : null }
  table(tableName: string): Row[] { return this.rows.filter((row) => row._id.startsWith(`${tableName}:`)) }
}

function seedBusinesses(count: number): Row[] {
  const rows: Row[] = []
  for (let index = 1; index <= count; index += 1) {
    const suffix = String(index).padStart(4, '0')
    const businessId = `businesses:${suffix}`
    const slug = `business-${suffix}`
    rows.push({ _id: businessId, _creationTime: index, slug, name: `Business ${suffix}`, ownerId: `owners:${suffix}`, normalizedName: `business ${suffix}`, category: 'Emergency plumbing', businessContext: { kind: 'local_human', suburb: 'Parramatta', stateTerritory: 'NSW' }, publicStatus: 'published', trustTier: 'claimed', claimStatus: 'claimed', sourceHash: canonicalDigest(`business:${suffix}`), createdAt: index, updatedAt: index })
    rows.push({ _id: `businessSupplyProjectionSnapshots:${suffix}`, _creationTime: index, businessId, sourceRevision: 1, sourceDigest: canonicalDigest(`projection:${suffix}`), observedAt: index, disposition: 'current', updatedAt: index, status: 'current', projection: { business: { businessId, slug, name: `Business ${suffix}`, category: 'Emergency plumbing', businessContext: { kind: 'local_human', suburb: 'Parramatta', stateTerritory: 'NSW' }, publicUrl: `/${slug}`, trustTier: 'claimed' }, offerings: [{ offering: { offeringRef: `offering:${suffix}`, revision: 1, name: 'Emergency plumbing', category: 'Emergency plumbing', summary: 'Emergency plumbing.', price: { kind: 'fixed', amount: { currency: 'AUD', units: '18000', exponent: 2 }, taxTreatment: 'unstated' } }, accessPaths: [], support: { integrated: false, routeable: false, reasons: ['not_integrated'] } }], sourceRevision: 1, sourceDigest: canonicalDigest(`projection:${suffix}`), observedAt: index, disposition: 'current' } })
  }
  return rows
}

import { describe, expect, it } from 'vitest'

import { cleanupExpiredSourceWriteNonces } from '../../../convex/sourceWriteAdmission'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type LtFilter = { kind: 'lt'; field: string; value: unknown }

type IndexBuilder = {
  lt: (field: string, value: unknown) => IndexBuilder
}

type ReadTrace = {
  tableName: string
  indexName: string
  filters: readonly LtFilter[]
  limit: number
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  take: (limit: number) => Promise<Row[]>
}

type Db = {
  query: (tableName: string) => Query
  delete: (id: string) => Promise<void>
}

type SchedulerCall = {
  delayMs: number
  args: { now?: number; batchSize?: number }
}

type Scheduler = {
  runAfter: (delayMs: number, functionRef: unknown, args: { now?: number; batchSize?: number }) => Promise<void>
}

type CleanupCtx = {
  db: Db
  scheduler: Scheduler
}

type CleanupArgs = {
  now?: number
  batchSize?: number
}

type CleanupResult = {
  deleted: number
  cutoff: number
  rescheduled: boolean
}

// cleanupExpiredSourceWriteNonces is a Convex internalMutation; Convex attaches the raw
// handler function as `_handler` so unit tests can invoke it directly without a runtime.
const cleanupMutation = cleanupExpiredSourceWriteNonces as unknown as {
  _handler: (ctx: CleanupCtx, args: CleanupArgs) => Promise<CleanupResult>
}
const cleanupHandler = cleanupMutation._handler

describe('Convex source write nonce cleanup', () => {
  it('deletes only expired nonces in a bounded, index-scoped batch and reschedules on a full batch', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    db.seed('sourceWriteNonces', nonce('nonce:expired-1', 900))
    db.seed('sourceWriteNonces', nonce('nonce:expired-2', 800))
    db.seed('sourceWriteNonces', nonce('nonce:expired-3', 700))
    db.seed('sourceWriteNonces', nonce('nonce:at-cutoff', 1_000))
    db.seed('sourceWriteNonces', nonce('nonce:future', 1_100))

    const result = await cleanupHandler({ db, scheduler }, { now: 1_000, batchSize: 2 })

    expect(result).toEqual({ deleted: 2, cutoff: 1_000, rescheduled: true })
    expect(
      db
        .dump('sourceWriteNonces')
        .map((row) => row._id)
        .sort()
    ).toEqual(['nonce:at-cutoff', 'nonce:expired-1', 'nonce:future'])
    expect(scheduler.calls).toEqual([{ delayMs: 0, args: { now: 1_000, batchSize: 2 } }])

    expect(db.reads).toEqual([
      {
        tableName: 'sourceWriteNonces',
        indexName: 'by_expiresAt',
        filters: [{ kind: 'lt', field: 'expiresAt', value: 1_000 }],
        limit: 2,
      },
    ])

    const nextScheduler = new FakeScheduler()
    const next = await cleanupHandler({ db, scheduler: nextScheduler }, { now: 1_000, batchSize: 10 })

    expect(next).toEqual({ deleted: 1, cutoff: 1_000, rescheduled: false })
    expect(nextScheduler.calls).toEqual([])
    expect(db.dump('sourceWriteNonces').map((row) => row._id).sort()).toEqual(['nonce:at-cutoff', 'nonce:future'])
  })

  it('preserves unexpired and exactly-at-cutoff rows and does not reschedule below a full batch', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    db.seed('sourceWriteNonces', nonce('nonce:expired-1', 900))
    db.seed('sourceWriteNonces', nonce('nonce:expired-2', 800))
    db.seed('sourceWriteNonces', nonce('nonce:at-cutoff', 1_000))
    db.seed('sourceWriteNonces', nonce('nonce:future', 1_100))

    const result = await cleanupHandler({ db, scheduler }, { now: 1_000, batchSize: 10 })

    expect(result).toEqual({ deleted: 2, cutoff: 1_000, rescheduled: false })
    expect(scheduler.calls).toEqual([])
    expect(
      db
        .dump('sourceWriteNonces')
        .map((row) => row._id)
        .sort()
    ).toEqual(['nonce:at-cutoff', 'nonce:future'])
  })

  it('defaults cutoff to now and batch size to 200 when args are omitted', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    const before = Date.now()
    db.seed('sourceWriteNonces', nonce('nonce:long-expired', before - 1))

    const result = await cleanupHandler({ db, scheduler }, {})

    expect(result.deleted).toBe(1)
    expect(result.rescheduled).toBe(false)
    expect(result.cutoff).toBeGreaterThanOrEqual(before)
    expect(db.reads[0]).toMatchObject({ limit: 200 })
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: LtFilter[] = []

  lt(field: string, value: unknown): IndexBuilder {
    this.filters.push({ kind: 'lt', field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly db: FakeDb,
    private readonly tableName: string,
    private readonly rows: readonly Row[],
    private readonly filters: readonly LtFilter[] = [],
    private readonly indexName?: string
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.db, this.tableName, this.rows, builder.filters, indexName)
  }

  async take(limit: number): Promise<Row[]> {
    if (this.indexName === undefined) {
      throw new Error('take() requires withIndex() first — unbounded reads are not supported by this fake')
    }

    this.db.trace({
      tableName: this.tableName,
      indexName: this.indexName,
      filters: this.filters,
      limit,
    })

    return this.rows
      .filter((row) => this.matches(row))
      .sort((left, right) => numericField(left, 'expiresAt') - numericField(right, 'expiresAt'))
      .slice(0, limit)
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.field]
      return typeof value === 'number' && typeof filter.value === 'number' && value < filter.value
    })
  }
}

class FakeDb implements Db {
  readonly reads: ReadTrace[] = []
  private readonly tables: Record<string, Row[]> = {}

  query(tableName: string): Query {
    return new FakeQuery(this, tableName, this.table(tableName))
  }

  async delete(id: string): Promise<void> {
    for (const rows of Object.values(this.tables)) {
      const index = rows.findIndex((row) => row._id === id)
      if (index >= 0) {
        rows.splice(index, 1)
        return
      }
    }
    throw new Error(`Missing row ${id}`)
  }

  seed(tableName: string, row: Row): void {
    this.table(tableName).push(row)
  }

  dump(tableName: string): Row[] {
    return [...this.table(tableName)]
  }

  trace(entry: ReadTrace): void {
    this.reads.push(entry)
  }

  private table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }
}

class FakeScheduler implements Scheduler {
  readonly calls: SchedulerCall[] = []

  async runAfter(delayMs: number, _functionRef: unknown, args: { now?: number; batchSize?: number }): Promise<void> {
    this.calls.push({ delayMs, args })
  }
}

function nonce(id: string, expiresAt: number): Row {
  return {
    _id: id,
    _creationTime: expiresAt - 10_000,
    keyId: `key:${id}`,
    nonce: `nonce-value:${id}`,
    family: 'test-family',
    scope: 'billing',
    operationKey: `op:${id}`,
    correlationId: `corr:${id}`,
    bodyDigest: `digest:${id}`,
    issuedAt: expiresAt - 10_000,
    consumedAt: expiresAt - 5_000,
    expiresAt,
  }
}

function numericField(row: Row, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

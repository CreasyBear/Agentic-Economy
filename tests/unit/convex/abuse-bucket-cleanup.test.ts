import { describe, expect, it } from 'vitest'

import { cleanupExpiredInquiryAbuseBuckets } from '../../../convex/inquiries'
import { cleanupExpiredAbuseRateLimitBuckets } from '../../../convex/security'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { kind: 'eq'; field: string; value: unknown }
type LteFilter = { kind: 'lte'; field: string; value: unknown }
type QueryFilter = EqFilter | LteFilter

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
  lte: (field: string, value: unknown) => IndexBuilder
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

const securityCleanupHandler = (cleanupExpiredAbuseRateLimitBuckets as unknown as {
  _handler: (ctx: CleanupCtx, args: CleanupArgs) => Promise<CleanupResult>
})._handler

const inquiryCleanupHandler = (cleanupExpiredInquiryAbuseBuckets as unknown as {
  _handler: (ctx: CleanupCtx, args: CleanupArgs) => Promise<CleanupResult>
})._handler

describe('Convex abuse bucket cleanup', () => {
  it('deletes expired security buckets in a bounded batch and schedules continuation', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    db.seed('abuseRateLimitBuckets', bucket('security:open-expired', 'open', 900))
    db.seed('abuseRateLimitBuckets', bucket('security:limited-expired', 'limited', 800))
    db.seed('abuseRateLimitBuckets', bucket('security:blocked-expired', 'blocked', 700))
    db.seed('abuseRateLimitBuckets', bucket('security:open-future', 'open', 1_100))

    const result = await securityCleanupHandler({ db, scheduler }, { now: 1_000, batchSize: 2 })

    expect(result).toEqual({ deleted: 2, cutoff: 1_000, rescheduled: true })
    expect(db.dump('abuseRateLimitBuckets').map((row) => row._id).sort()).toEqual([
      'security:blocked-expired',
      'security:open-future',
    ])
    expect(scheduler.calls).toEqual([{ delayMs: 0, args: { now: 1_000, batchSize: 2 } }])

    const nextScheduler = new FakeScheduler()
    const next = await securityCleanupHandler({ db, scheduler: nextScheduler }, { now: 1_000, batchSize: 10 })

    expect(next).toEqual({ deleted: 1, cutoff: 1_000, rescheduled: false })
    expect(nextScheduler.calls).toEqual([])
    expect(db.dump('abuseRateLimitBuckets')).toEqual([expect.objectContaining({ _id: 'security:open-future' })])
  })

  it('deletes expired inquiry buckets without touching future windows', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    db.seed('inquiryAbuseBuckets', bucket('inquiry:open-expired', 'open', 1_000))
    db.seed('inquiryAbuseBuckets', bucket('inquiry:limited-expired', 'limited', 999))
    db.seed('inquiryAbuseBuckets', bucket('inquiry:open-future', 'open', 1_001))

    const result = await inquiryCleanupHandler({ db, scheduler }, { now: 1_000, batchSize: 10 })

    expect(result).toEqual({ deleted: 2, cutoff: 1_000, rescheduled: false })
    expect(scheduler.calls).toEqual([])
    expect(db.dump('inquiryAbuseBuckets')).toEqual([expect.objectContaining({ _id: 'inquiry:open-future' })])
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: QueryFilter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ kind: 'eq', field, value })
    return this
  }

  lte(field: string, value: unknown): IndexBuilder {
    this.filters.push({ kind: 'lte', field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly rows: readonly Row[],
    private readonly filters: readonly QueryFilter[] = []
  ) {}

  withIndex(_indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters])
  }

  async take(limit: number): Promise<Row[]> {
    return this.rows
      .filter((row) => this.matches(row))
      .sort((left, right) => numericField(left, 'resetAt') - numericField(right, 'resetAt'))
      .slice(0, limit)
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.field]
      if (filter.kind === 'eq') {
        return value === filter.value
      }
      return typeof value === 'number' && typeof filter.value === 'number' && value <= filter.value
    })
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName))
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

function bucket(id: string, state: string, resetAt: number): Row {
  return {
    _id: id,
    _creationTime: resetAt,
    key: `key:${id}`,
    scope: 'test',
    window: String(resetAt),
    count: 1,
    state,
    resetAt,
    updatedAt: resetAt - 1,
  }
}

function numericField(row: Row, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

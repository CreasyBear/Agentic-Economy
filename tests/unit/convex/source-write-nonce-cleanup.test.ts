import { describe, expect, it } from 'vitest'

import { cleanupExpiredSourceWriteNonces } from '../../../convex/sourceWriteAdmission'
import {
  SYSTEM_WORKLOAD_ACCOUNT_REF,
  SYSTEM_WORKLOAD_PRINCIPAL_REF,
  type WorkloadCronSnapshot,
} from '../../../convex/workloadCron'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type LtFilter = { kind: 'lt'; field: string; value: unknown }
type EqFilter = { kind: 'eq'; field: string; value: unknown }
type Filter = LtFilter | EqFilter

type IndexBuilder = {
  lt: (field: string, value: unknown) => IndexBuilder
  eq: (field: string, value: unknown) => IndexBuilder
}

type ReadTrace = {
  tableName: string
  indexName: string
  filters: readonly Filter[]
  limit: number
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  take: (limit: number) => Promise<Row[]>
  unique: () => Promise<Row | null>
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
  workload?: WorkloadCronSnapshot
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
  it('rejects missing or forged workload snapshots before deleting or scheduling anything', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    db.seed('sourceWriteNonces', nonce('nonce:expired-denial', 900))

    await expect(cleanupHandler({ db, scheduler }, { now: 1_000, batchSize: 1 }))
      .rejects.toThrow('workload_snapshot_invalid')
    await expect(cleanupHandler({ db, scheduler }, {
      now: 1_000,
      batchSize: 1,
      workload: {
        ...workloadSnapshot('cleanup expired source write nonces', 'cleanupExpiredSourceWriteNonces'),
        actorPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff' as WorkloadCronSnapshot['actorPrincipalRef'],
      },
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(db.dump('sourceWriteNonces').map((row) => row._id)).toEqual(['nonce:expired-denial'])
    expect(scheduler.calls).toEqual([])
  })

  it('deletes only expired nonces in a bounded, index-scoped batch and reschedules on a full batch', async () => {
    const db = new FakeDb()
    const scheduler = new FakeScheduler()
    db.seed('sourceWriteNonces', nonce('nonce:expired-1', 900))
    db.seed('sourceWriteNonces', nonce('nonce:expired-2', 800))
    db.seed('sourceWriteNonces', nonce('nonce:expired-3', 700))
    db.seed('sourceWriteNonces', nonce('nonce:at-cutoff', 1_000))
    db.seed('sourceWriteNonces', nonce('nonce:future', 1_100))

    const result = await cleanupHandler({ db, scheduler }, {
      now: 1_000,
      batchSize: 2,
      workload: workloadSnapshot('cleanup expired source write nonces', 'cleanupExpiredSourceWriteNonces'),
    })

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
    const next = await cleanupHandler({ db, scheduler: nextScheduler }, {
      now: 1_000,
      batchSize: 10,
      workload: workloadSnapshot('cleanup expired source write nonces', 'cleanupExpiredSourceWriteNonces'),
    })

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

    const result = await cleanupHandler({ db, scheduler }, {
      now: 1_000,
      batchSize: 10,
      workload: workloadSnapshot('cleanup expired source write nonces', 'cleanupExpiredSourceWriteNonces'),
    })

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

    const result = await cleanupHandler({ db, scheduler }, {
      workload: workloadSnapshot('cleanup expired source write nonces', 'cleanupExpiredSourceWriteNonces'),
    })

    expect(result.deleted).toBe(1)
    expect(result.rescheduled).toBe(false)
    expect(result.cutoff).toBeGreaterThanOrEqual(before)
    expect(db.reads[0]).toMatchObject({ limit: 200 })
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: Filter[] = []

  lt(field: string, value: unknown): IndexBuilder {
    this.filters.push({ kind: 'lt', field, value })
    return this
  }

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ kind: 'eq', field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly db: FakeDb,
    private readonly tableName: string,
    private readonly rows: readonly Row[],
    private readonly filters: readonly Filter[] = [],
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

  async unique(): Promise<Row | null> {
    const matched = this.rows.filter((row) => this.matches(row))
    if (matched.length > 1) throw new Error(`expected_unique:${this.tableName}`)
    return matched[0] ?? null
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const value = row[filter.field]
      return filter.kind === 'eq'
        ? value === filter.value
        : typeof value === 'number' && typeof filter.value === 'number' && value < filter.value
    })
  }
}

class FakeDb implements Db {
  readonly reads: ReadTrace[] = []
  private readonly tables: Record<string, Row[]> = {}

  constructor() {
    seedWorkloadAuthority(this)
  }

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

function workloadSnapshot(
  name: WorkloadCronSnapshot['name'],
  handler: string,
): WorkloadCronSnapshot {
  return {
    name,
    workloadKind: 'cron',
    actorPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
    activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    correlationRef: `cron:${handler}:test`,
    idempotencyRef: `cron:${handler}:test`,
    purpose: name,
    source: `convex/workloadCron:${handler}`,
    principalRevision: 1,
    activeAccountRevision: 1,
    accessVia: 'membership',
    admittedAt: 1,
  }
}

function seedWorkloadAuthority(db: FakeDb): void {
  const ownerPrincipalRef = 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const ownershipRef = 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const action = {
    actorPrincipalRef: ownerPrincipalRef,
    activeAccountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    correlationRef: 'source-write-cleanup-test:account',
    idempotencyRef: 'source-write-cleanup-test:account',
  }
  db.seed('principals', row('principals:workload', {
    principalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
    kind: 'workload',
    displayName: 'Source-write cleanup workload',
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  }))
  db.seed('principals', row('principals:owner', {
    principalRef: ownerPrincipalRef,
    kind: 'human',
    displayName: 'System operations owner',
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  }))
  db.seed('accounts', row('accounts:workload', {
    accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    displayName: 'System operations',
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: ownerPrincipalRef,
    creationIdempotencyRef: action.idempotencyRef,
    initialOwnershipRef: ownershipRef,
    currentOwnershipRef: ownershipRef,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    lastAction: action,
  }))
  db.seed('accountOwnerships', row('accountOwnerships:workload', {
    ownershipRef,
    accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    ownerPrincipalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: action,
  }))
  db.seed('memberships', row('memberships:workload', {
    membershipRef: 'mem_cccccccccccccccccccccccccccccccc',
    accountRef: SYSTEM_WORKLOAD_ACCOUNT_REF,
    memberPrincipalRef: SYSTEM_WORKLOAD_PRINCIPAL_REF,
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    createdBy: action,
  }))
}

function row(id: string, value: Record<string, unknown>): Row {
  return { _id: id, _creationTime: 1, ...value }
}

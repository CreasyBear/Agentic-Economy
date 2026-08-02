import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  appendHarnessSessionEntry,
  listHarnessRunEntries,
  listHarnessSessionEntries,
  readAdminHarnessSessionEntries,
} from '../../../convex/harnessSessions'
import { harnessSessionSourceFunctionRefs } from '../../../src/modules/harness/harness.functions'
import type {
  HarnessRunStatus,
  HarnessSessionEntryKind,
} from '../../../src/modules/harness/harness.schema'
import type { SourceWriteAdmission } from '../../../src/modules/security/source-write-admission'
import { withSourceWrite } from '../../helpers/source-write-admission'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }
type QueryRead = { tableName: string; indexName?: string }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  order: (direction: 'asc' | 'desc') => Query
  take: (limit: number) => Promise<Row[]>
  unique: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

type AuthCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type AppendArgs = {
  ownerKey: string
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  parentEntryId?: string
  seq?: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey?: string
  requestHash?: string
  createdAt: number
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion?: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}

const appendHandler = (appendHarnessSessionEntry as unknown as {
  _handler: (ctx: AuthCtx, args: AppendArgs) => Promise<unknown>
})._handler
const listSessionHandler = (listHarnessSessionEntries as unknown as {
  _handler: (ctx: AuthCtx, args: { sessionId: string; limit?: number }) => Promise<unknown>
})._handler
const listRunHandler = (listHarnessRunEntries as unknown as {
  _handler: (ctx: AuthCtx, args: { runId: string; limit?: number }) => Promise<unknown>
})._handler
const adminReadHandler = (readAdminHarnessSessionEntries as unknown as {
  _handler: (ctx: AuthCtx, args: { sessionId: string; limit?: number }) => Promise<unknown>
})._handler

describe('Convex harness session journal source', () => {
  it('appends entries into separate session and entry tables without unbounded arrays', async () => {
    const db = new FakeDb({})
    const first = await appendHandler(authCtx(db, null), admittedEntryArgs({ entryId: 'entry-1' }))
    const second = await appendHandler(authCtx(db, null), admittedEntryArgs({
      entryId: 'entry-2',
      kind: 'tool.started',
      idempotencyKey: 'idem-2',
      createdAt: 2,
      payloadJson: '{"tool":"registry.search"}',
    }))

    expect(first).toMatchObject({
      status: 'accepted',
      entry: { entryId: 'entry-1', seq: 1 },
      activeLeafEntryId: 'entry-1',
    })
    expect(second).toMatchObject({
      status: 'accepted',
      entry: { entryId: 'entry-2', seq: 2, parentEntryId: 'entry-1' },
      activeLeafEntryId: 'entry-2',
    })

    expect(db.dump('harnessSessions')).toEqual([
      expect.objectContaining({
        sessionId: 'session-1',
        ownerKey: 'owner:session-1',
        entryCount: 2,
        activeLeafEntryId: 'entry-2',
        lastRunId: 'run-1',
      }),
    ])
    expect(db.dump('harnessSessionEntries')).toHaveLength(2)
    expect(Object.values(db.dump('harnessSessions')[0] ?? {}).some(Array.isArray)).toBe(false)
    expect(Object.values(db.dump('harnessSessionEntries')[0] ?? {}).some(Array.isArray)).toBe(false)
  })

  it('replays duplicate idempotency keys with matching request hashes and rejects drift', async () => {
    const db = new FakeDb({})
    const args = admittedEntryArgs({ entryId: 'entry-1', idempotencyKey: 'same-key' })
    const replayArgs = admittedEntryArgs({ entryId: 'entry-1', idempotencyKey: 'same-key' })
    const driftArgs = admittedEntryArgs({
      entryId: 'entry-drift',
      idempotencyKey: 'same-key',
      payloadJson: '{"changed":true}',
    })

    await expect(appendHandler(authCtx(db, null), args)).resolves.toMatchObject({ status: 'accepted' })
    await expect(appendHandler(authCtx(db, null), replayArgs)).resolves.toMatchObject({
      status: 'replayed',
      entry: { entryId: 'entry-1', idempotencyKey: 'same-key' },
    })

    const conflict = await appendHandler(authCtx(db, null), driftArgs)

    expect(conflict).toMatchObject({
      status: 'conflict',
      reason: 'idempotency_conflict',
      existingEntry: { entryId: 'entry-1' },
      attemptedEntry: { entryId: 'entry-drift' },
    })
    expect(db.dump('harnessSessionEntries')).toHaveLength(1)
  })

  it('rejects parent mismatches without advancing the active leaf', async () => {
    const db = new FakeDb({})
    await appendHandler(authCtx(db, null), admittedEntryArgs({ entryId: 'entry-1' }))

    const conflict = await appendHandler(authCtx(db, null), admittedEntryArgs({
      entryId: 'entry-2',
      parentEntryId: 'entry-missing',
      idempotencyKey: 'bad-parent',
    }))

    expect(conflict).toMatchObject({
      status: 'conflict',
      reason: 'parent_conflict',
      activeLeafEntryId: 'entry-1',
    })
    expect(db.dump('harnessSessions')[0]).toMatchObject({
      activeLeafEntryId: 'entry-1',
      entryCount: 1,
    })
    expect(db.dump('harnessSessionEntries')).toHaveLength(1)
  })

  it('denies public-shaped appends without source-write admission', async () => {
    const db = new FakeDb({})
    const denied = await appendHandler(authCtx(db, null), entryArgs({
      entryId: 'entry-public',
      idempotencyKey: 'public-append',
    }))

    expect(denied).toMatchObject({
      status: 'denied',
      reason: 'missing_source_write_admission',
    })
    expect(db.dump('harnessSessions')).toHaveLength(0)
    expect(db.dump('harnessSessionEntries')).toHaveLength(0)
  })

  it('returns bounded public session and run reads without raw payloads', async () => {
    const db = new FakeDb({})
    await appendHandler(authCtx(db, null), admittedEntryArgs({
      entryId: 'entry-1',
      payloadJson: '{"raw":"secret payload"}',
      privatePayloadJson: '{"provider":"secret private payload"}',
      publicSummaryJson: '{"summary":"safe count"}',
    }))

    db.clearReadLog()
    const publicSession = await listSessionHandler(authCtx(db, null), { sessionId: 'session-1', limit: 10 })
    const publicRun = await listRunHandler(authCtx(db, null), { runId: 'run-1', limit: 10 })
    const publicJson = JSON.stringify({ publicSession, publicRun })

    expect(publicSession).toMatchObject({
      kind: 'ok',
      entries: [expect.objectContaining({ publicSummaryJson: '{"summary":"safe count"}' })],
    })
    expect(publicJson).not.toContain('payloadJson')
    expect(publicJson).not.toContain('privatePayloadJson')
    expect(publicJson).not.toContain('secret payload')
    expect(publicJson).not.toContain('secret private payload')
    expect(publicJson).not.toContain('requestHash')
    expect(publicJson).not.toContain('run-1')
    expect(publicJson).not.toContain('turn-1')
    expect(publicJson).not.toContain('owner:session-1')
    expect(publicJson).not.toContain('activeLeafEntryId')
    expect(db.reads()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'harnessSessionEntries', indexName: 'by_sessionId_seq' }),
        expect.objectContaining({ tableName: 'harnessSessionEntries', indexName: 'by_runId_seq' }),
      ])
    )
  })

  it('keeps admitted idempotent append replay behavior', async () => {
    const db = new FakeDb({})
    const args = admittedEntryArgs({
      entryId: 'entry-admitted',
      idempotencyKey: 'admitted-idempotent',
      payloadJson: '{"phase":"persist"}',
    })
    const replayArgs = admittedEntryArgs({
      entryId: 'entry-admitted',
      idempotencyKey: 'admitted-idempotent',
      payloadJson: '{"phase":"persist"}',
    })

    await expect(appendHandler(authCtx(db, null), args)).resolves.toMatchObject({
      status: 'accepted',
      entry: { entryId: 'entry-admitted', idempotencyKey: 'admitted-idempotent' },
    })
    await expect(appendHandler(authCtx(db, null), replayArgs)).resolves.toMatchObject({
      status: 'replayed',
      entry: { entryId: 'entry-admitted', idempotencyKey: 'admitted-idempotent' },
    })
    expect(db.dump('harnessSessionEntries')).toHaveLength(1)
  })

  it('keeps private payload reads behind admin authority', async () => {
    const db = new FakeDb({
      adminMemberships: [
        {
          _id: 'adminMemberships:1',
          clerkUserId: 'admin-user',
          tokenIdentifier: 'clerk|admin-user',
          role: 'support',
          state: 'active',
          grantedBy: 'system',
          grantedAt: 1,
        },
      ],
    })
    await appendHandler(authCtx(db, null), admittedEntryArgs({
      entryId: 'entry-1',
      payloadJson: '{"raw":"secret payload"}',
      privatePayloadJson: '{"provider":"secret private payload"}',
    }))

    await expect(adminReadHandler(authCtx(db, null), { sessionId: 'session-1' })).resolves.toMatchObject({
      kind: 'denied',
      entries: [],
    })

    const allowed = await adminReadHandler(authCtx(db, identity('admin-user')), { sessionId: 'session-1' })
    expect(allowed).toMatchObject({
      kind: 'allowed',
      entries: [
        expect.objectContaining({
          payloadJson: '{"raw":"secret payload"}',
          privatePayloadJson: '{"provider":"secret private payload"}',
        }),
      ],
    })
  })

  it('exposes typed harness source function references', () => {
    expect(Object.keys(harnessSessionSourceFunctionRefs).sort()).toEqual([
      'appendEntry',
      'listRunEntries',
      'listSessionEntries',
      'readAdminSessionEntries',
    ])
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
    private readonly reads: QueryRead[],
    private readonly filters: readonly EqFilter[] = [],
    private readonly indexName?: string,
    private readonly direction: 'asc' | 'desc' = 'asc',
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(
      this.tableName,
      this.rows,
      this.reads,
      [...this.filters, ...builder.filters],
      indexName,
      this.direction,
    )
  }

  order(direction: 'asc' | 'desc'): Query {
    return new FakeQuery(this.tableName, this.rows, this.reads, this.filters, this.indexName, direction)
  }

  async take(limit: number): Promise<Row[]> {
    this.recordRead()
    const rows = this.filteredRows()
    return (this.direction === 'desc' ? [...rows].reverse() : rows).slice(0, limit)
  }

  async unique(): Promise<Row | null> {
    this.recordRead()
    return this.filteredRows().at(0) ?? null
  }

  private filteredRows(): Row[] {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  private recordRead(): void {
    this.reads.push({
      tableName: this.tableName,
      ...(this.indexName === undefined ? {} : { indexName: this.indexName }),
    })
  }
}

class FakeDb implements Db {
  private readonly tables = new Map<string, Row[]>()
  private readonly queryReads: QueryRead[] = []

  constructor(seed: Record<string, Array<Record<string, unknown> & { _id: string }>>) {
    for (const [tableName, rows] of Object.entries(seed)) {
      this.tables.set(
        tableName,
        rows.map((row, index) => ({ _creationTime: index + 1, ...row })),
      )
    }
  }

  query(tableName: string): Query {
    return new FakeQuery(tableName, this.table(tableName), this.queryReads)
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    const rows = this.table(tableName)
    const id = `${tableName}:${rows.length + 1}`
    rows.push({ _id: id, _creationTime: rows.length + 1, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      const existing = rows[index]
      if (existing !== undefined) {
        rows[index] = { ...existing, ...value }
        return
      }
    }
  }

  dump(tableName: string): Row[] {
    return [...this.table(tableName)]
  }

  reads(): QueryRead[] {
    return [...this.queryReads]
  }

  clearReadLog(): void {
    this.queryReads.length = 0
  }

  private table(tableName: string): Row[] {
    const rows = this.tables.get(tableName) ?? []
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, rows)
    }
    return rows
  }
}

function entryArgs(overrides: Partial<AppendArgs> = {}): AppendArgs {
  return {
    ownerKey: 'owner:session-1',
    operationKey: 'harness-session:session-1:idem-1',
    correlationId: 'run-1',
    entryId: 'entry-1',
    sessionId: 'session-1',
    runId: 'run-1',
    turnId: 'turn-1',
    kind: 'turn.started',
    idempotencyKey: 'idem-1',
    createdAt: 1,
    payloadJson: '{"phase":"turn"}',
    publicSummaryJson: '{"summary":"turn started"}',
    schemaVersion: 1,
    ...overrides,
  }
}

function admittedEntryArgs(overrides: Partial<AppendArgs> = {}): AppendArgs {
  const args = entryArgs(overrides)
  return withSourceWrite('harness_session', args)
}

function authCtx(db: Db, identity: UserIdentity | null): AuthCtx {
  return {
    db,
    auth: { getUserIdentity: async () => identity },
  }
}

function identity(subject: string): UserIdentity {
  return {
    subject,
    tokenIdentifier: `clerk|${subject}`,
    issuer: 'https://clerk.test',
  } as UserIdentity
}

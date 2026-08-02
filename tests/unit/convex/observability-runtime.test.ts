import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OPERATOR_CONTROL_KEY_COUNT,
  readAdminOwnerActivationSummary,
  readOperatorControls,
  recordOwnerActivationEvent,
} from '../../../convex/observability'
type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }
type QueryOperation = 'collect' | 'take' | 'unique' | 'get'
type QueryRead = { tableName: string; operation: QueryOperation; indexName?: string; filters: EqFilter[]; limit?: number }
type WriteOperation =
  | { kind: 'insert'; tableName: string; id: string; value: Record<string, unknown> }
  | { kind: 'patch'; tableName: string; id: string; value: Record<string, unknown> }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  take: (limit: number) => Promise<Row[]>
  unique: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  normalizeId: (tableName: string, value: string) => string | null
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

type Ctx = {
  db: Db
  auth: { getUserIdentity: () => Promise<null> }
  runQuery: (_query: unknown, args: unknown) => Promise<unknown>
  runMutation: (_mutation: unknown, args: unknown) => Promise<{ ok: true }>
}

type RecordOwnerActivationEventArgs = {
  eventType: 'claim_started' | 'visitor_attributed'
  source: string
  stage: 'visitor' | 'claim_started'
  pseudonymousSessionId: string
  correlationId: string
  consentFlag: boolean
  businessId?: string
  payload?: Record<string, string | number | boolean | null>
}

type RecordOwnerActivationEventResult = { ok: true }
type Handler<Args, Result> = (ctx: Ctx, args: Args) => Promise<Result>

const recordOwnerActivationEventHandler = getMutationHandler<
  RecordOwnerActivationEventArgs,
  RecordOwnerActivationEventResult
>(recordOwnerActivationEvent)
const readAdminOwnerActivationSummaryHandler = (readAdminOwnerActivationSummary as unknown as {
  _handler: (ctx: AdminSummaryCtx, args: Record<string, never>) => Promise<OwnerActivationSummary>
})._handler
const readOperatorControlsHandler = (readOperatorControls as unknown as {
  _handler: (ctx: AdminSummaryCtx, args: Record<string, never>) => Promise<unknown>
})._handler

type OwnerActivationSummary = {
  byStage: Array<{ stage: string; count: number }>
  totalTracked: number
}

type AdminSummaryCtx = Omit<Ctx, 'auth'> & {
  auth: {
    getUserIdentity: () => Promise<{ issuer: string; subject: string; tokenIdentifier: string }>
  }
}

const allowedNoBusinessTables: Record<string, true> = { funnelEvents: true }
const allowedBusinessTables: Record<string, true> = { funnelEvents: true, ownerActivationState: true }

describe('Convex observability runtime bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps canonical stage keys and counts from aggregate readbacks', async () => {
    const rows: Row[] = [
      { _id: 'ownerActivationState:1', _creationTime: 1, stage: 'visitor' },
      { _id: 'ownerActivationState:2', _creationTime: 2, stage: 'claim_started' },
      { _id: 'ownerActivationState:3', _creationTime: 3, stage: 'visitor' },
    ]
    const db = seededUnrelatedDb()
    db.seed('adminMemberships', {
      _id: 'adminMemberships:admin',
      _creationTime: 4,
      clerkUserId: 'clerk:admin',
      tokenIdentifier: 'token:admin',
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'bootstrap',
      grantedAt: 1,
    })
    db.seedAggregate(rows)

    const result = await readAdminOwnerActivationSummaryHandler(
      {
        ...testCtx(db),
        auth: {
          getUserIdentity: async () => ({
            issuer: 'issuer:test',
            subject: 'clerk:admin',
            tokenIdentifier: 'token:admin',
          }),
        },
      },
      {},
    )

    expect(result).toEqual({
      byStage: [
        { stage: 'visitor', count: 2 },
        { stage: 'claim_started', count: 1 },
      ],
      totalTracked: 3,
    })
    expect(db.aggregateReads()).toEqual([
      'visitor',
      'claim_started',
      'published',
      'activated',
      'blocked',
      undefined,
    ])
  })
  it('reads every finite operator control through one bounded take', async () => {
    const db = seededUnrelatedDb()
    db.seed('adminMemberships', {
      _id: 'adminMemberships:admin',
      _creationTime: 4,
      clerkUserId: 'clerk:admin',
      tokenIdentifier: 'token:admin',
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'bootstrap',
      grantedAt: 1,
    })

    const result = await readOperatorControlsHandler(
      {
        ...testCtx(db),
        auth: {
          getUserIdentity: async () => ({
            issuer: 'issuer:test',
            subject: 'clerk:admin',
            tokenIdentifier: 'token:admin',
          }),
        },
      },
      {},
    )

    expect(result).toMatchObject({ kind: 'allowed' })
    if (typeof result !== 'object' || result === null || !('controls' in result) || !Array.isArray(result.controls)) {
      throw new Error('Expected operator control readback.')
    }
    expect(result.controls).toHaveLength(OPERATOR_CONTROL_KEY_COUNT)
    expect(result.controls).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'claims_enabled', effectiveEnabled: true })])
    )
    expect(db.takeReads().filter((read) => read.tableName === 'operatorControls')).toEqual([
      expect.objectContaining({ limit: OPERATOR_CONTROL_KEY_COUNT }),
    ])
  })


  it('records a session-only funnel event without collecting or upserting unrelated domain tables', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedDb()

    const result = await recordOwnerActivationEventHandler(testCtx(db), eventArgs('corr:session-only'))

    expect(result).toEqual({ ok: true })
    expect(db.dump('funnelEvents')).toHaveLength(1)
    expect(db.dump('funnelEvents')[0]).toMatchObject({
      eventType: 'visitor_attributed',
      source: 'homepage',
      stage: 'visitor',
      pseudonymousSessionId: 'session:activation',
      correlationId: 'corr:session-only',
      consentFlag: true,
    })
    expect(db.dump('ownerActivationState')).toEqual([])
    expect(touchedUnexpectedTables(db, allowedNoBusinessTables)).toEqual([])
  })

  it('records a business funnel event by touching only funnelEvents and that business ownerActivationState row', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedDb()

    const result = await recordOwnerActivationEventHandler(
      testCtx(db),
      eventArgs('corr:business-event', { businessId: 'businesses:target' })
    )

    expect(result).toEqual({ ok: true })
    expect(db.dump('funnelEvents')).toHaveLength(1)
    expect(db.dump('funnelEvents')[0]).toMatchObject({
      eventType: 'claim_started',
      stage: 'claim_started',
      correlationId: 'corr:business-event',
      businessId: 'businesses:target',
    })
    expect(db.dump('ownerActivationState')).toHaveLength(1)
    expect(db.dump('ownerActivationState')[0]).toMatchObject({
      businessId: 'businesses:target',
      stage: 'claim_started',
      lastEventAt: 1_700_000_000_000,
    })
    expect(touchedUnexpectedTables(db, allowedBusinessTables)).toEqual([])
    expect(bareCollectReads(db)).toEqual([])
    expect(db.aggregateWrites()).toEqual([
      expect.objectContaining({ kind: 'insert', key: 'claim_started' }),
    ])
  })
  it('replaces the owner activation aggregate when the business row is patched', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedDb()

    await recordOwnerActivationEventHandler(
      testCtx(db),
      eventArgs('corr:business-event:first', { businessId: 'businesses:target' })
    )
    await recordOwnerActivationEventHandler(
      testCtx(db),
      eventArgs('corr:business-event:second', { businessId: 'businesses:target' })
    )

    expect(db.dump('ownerActivationState')).toHaveLength(1)
    expect(db.aggregateWrites()).toEqual([
      expect.objectContaining({ kind: 'insert', key: 'claim_started' }),
      expect.objectContaining({ kind: 'replace' }),
    ])
  })


  it('patches one legacy duplicate funnelEvents correlation row instead of throwing or inserting another row', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedDb()
    db.seed('funnelEvents', legacyFunnelEventRow('funnelEvents:legacy:first', 'legacy-source'))
    db.seed('funnelEvents', legacyFunnelEventRow('funnelEvents:legacy:second', 'legacy-source-two'))

    const result = await recordOwnerActivationEventHandler(testCtx(db), eventArgs('corr:duplicate-funnel-event'))

    expect(result).toEqual({ ok: true })
    expect(db.dump('funnelEvents')).toHaveLength(2)
    expect(db.writes()).toEqual([
      expect.objectContaining({
        kind: 'patch',
        tableName: 'funnelEvents',
        id: expect.stringMatching(/^funnelEvents:legacy:/),
        value: expect.objectContaining({
          eventType: 'visitor_attributed',
          source: 'homepage',
          correlationId: 'corr:duplicate-funnel-event',
          createdAt: 1_700_000_000_000,
        }),
      }),
    ])
    expect(db.dump('funnelEvents')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'visitor_attributed',
          source: 'homepage',
          correlationId: 'corr:duplicate-funnel-event',
          createdAt: 1_700_000_000_000,
        }),
      ])
    )
  })
})

function testCtx(db: FakeDb): Ctx {
  return {
    db,
    auth: { getUserIdentity: async () => null },
    runQuery: async (_query, args) => db.runAggregateCount(args),
    runMutation: async (_mutation, args) => {
      db.recordAggregateMutation(args)
      return { ok: true }
    },
  }
}

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
    private readonly indexName?: string
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.tableName, this.rows, this.reads, [...this.filters, ...builder.filters], indexName)
  }

  async collect(): Promise<Row[]> {
    this.recordRead('collect')
    return this.filteredRows()
  }
  async take(limit: number): Promise<Row[]> {
    this.recordRead('take', limit)
    return this.filteredRows().slice(0, limit)
  }

  async unique(): Promise<Row | null> {
    this.recordRead('unique')
    const matches = this.filteredRows()
    if (matches.length > 1) {
      throw new Error(`Convex unique() expected at most one row in ${this.tableName}, found ${matches.length}`)
    }
    return matches[0] ?? null
  }

  private filteredRows(): Row[] {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  private recordRead(operation: QueryOperation, limit?: number): void {
    this.reads.push({
      tableName: this.tableName,
      operation,
      filters: this.filters.map((filter) => ({ ...filter })),
      ...(this.indexName === undefined ? {} : { indexName: this.indexName }),
      ...(limit === undefined ? {} : { limit }),
    })
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}
  private readonly queryReads: QueryRead[] = []
  private readonly writeOperations: WriteOperation[] = []
  private readonly aggregateCountByStage = new Map<string, number>()
  private readonly aggregateQueryReads: Array<string | undefined> = []
  private readonly aggregateWriteOperations: Array<Record<string, unknown>> = []
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(tableName, this.table(tableName), this.queryReads)
  }

  normalizeId(tableName: string, value: string): string | null {
    return value.startsWith(`${tableName}:`) ? value : null
  }
  async get(id: string): Promise<Row | null> {
    const tableName = id.split(':')[0] ?? ''
    this.queryReads.push({
      tableName,
      operation: 'get',
      indexName: 'documentId',
      filters: [{ field: '_id', value: id }],
    })
    return Object.values(this.tables).flat().find((candidate) => candidate._id === id) ?? null
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:generated:${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...value })
    this.writeOperations.push({ kind: 'insert', tableName, id, value: { ...value } })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const tableName = id.split(':')[0] ?? ''
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) {
      throw new Error(`Missing row ${id}`)
    }
    Object.assign(row, value)
    this.writeOperations.push({ kind: 'patch', tableName, id, value: { ...value } })
  }

  seed(tableName: string, row: Row): void {
    this.table(tableName).push(row)
  }

  seedAggregate(rows: readonly Row[]): void {
    for (const row of rows) {
      const stage = row.stage
      if (typeof stage !== 'string') {
        throw new Error('Aggregate fixture requires stage.')
      }
      this.aggregateCountByStage.set(stage, (this.aggregateCountByStage.get(stage) ?? 0) + 1)
    }
  }

  async runAggregateCount(args: unknown): Promise<{ count: number }> {
    const record = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {}
    const key = record.k1
    const stage = Array.isArray(key) && typeof key[0] === 'string' ? key[0] : undefined
    this.aggregateQueryReads.push(stage)
    if (stage === undefined) {
      return { count: [...this.aggregateCountByStage.values()].reduce((total, count) => total + count, 0) }
    }
    return { count: this.aggregateCountByStage.get(stage) ?? 0 }
  }

  recordAggregateMutation(args: unknown): void {
    if (typeof args !== 'object' || args === null) return
    const record = args as Record<string, unknown>
    const insertKey = Array.isArray(record.key) && typeof record.key[0] === 'string' ? record.key[0] : undefined
    if (typeof record.value === 'string' && insertKey !== undefined && !('currentKey' in record)) {
      this.aggregateCountByStage.set(
        insertKey,
        (this.aggregateCountByStage.get(insertKey) ?? 0) + 1
      )
      this.aggregateWriteOperations.push({ kind: 'insert', key: insertKey, id: record.value })
      return
    }
    const currentKey = Array.isArray(record.currentKey) && typeof record.currentKey[0] === 'string' ? record.currentKey[0] : undefined
    const newKey = Array.isArray(record.newKey) && typeof record.newKey[0] === 'string' ? record.newKey[0] : undefined
    if (typeof record.value === 'string' && currentKey !== undefined && newKey !== undefined) {
      if (currentKey !== newKey) {
        this.aggregateCountByStage.set(currentKey, Math.max(0, (this.aggregateCountByStage.get(currentKey) ?? 0) - 1))
        this.aggregateCountByStage.set(newKey, (this.aggregateCountByStage.get(newKey) ?? 0) + 1)
      }
      this.aggregateWriteOperations.push({ kind: 'replace', id: record.value })
    }
  }

  dump(tableName: string): Row[] {
    return this.table(tableName).map((row) => ({ ...row }))
  }

  reads(): QueryRead[] {
    return this.queryReads.map((read) => ({ ...read, filters: read.filters.map((filter) => ({ ...filter })) }))
  }

  writes(): WriteOperation[] {
    return this.writeOperations.map((write) => ({ ...write, value: { ...write.value } }))
  }

  aggregateReads(): Array<string | undefined> {
    return [...this.aggregateQueryReads]
  }

  aggregateWrites(): Array<Record<string, unknown>> {
    return this.aggregateWriteOperations.map((operation) => ({ ...operation }))
  }

  takeReads(): QueryRead[] {
    return this.queryReads.filter((read) => read.operation === 'take')
  }

  private table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }
}


function eventArgs(
  correlationId: string,
  options: { businessId?: string } = {}
): RecordOwnerActivationEventArgs {
  if (options.businessId === undefined) {
    return {
      eventType: 'visitor_attributed',
      source: 'homepage',
      stage: 'visitor',
      pseudonymousSessionId: 'session:activation',
      correlationId,
      consentFlag: true,
      payload: { variant: 'owner-activation' },
    }
  }

  return {
    eventType: 'claim_started',
    source: 'claim-form',
    stage: 'claim_started',
    pseudonymousSessionId: 'session:activation',
    correlationId,
    consentFlag: true,
    businessId: options.businessId,
    payload: { variant: 'owner-activation' },
  }
}

function seededUnrelatedDb(): FakeDb {
  const db = new FakeDb()
  db.seed('businesses', {
    _id: 'businesses:unrelated',
    _creationTime: 1,
    ownerId: 'owners:unrelated',
    slug: 'unrelated-business',
    name: 'Unrelated Business',
    publicStatus: 'published',
  })
  db.seed('registryProjectionAttempts', {
    _id: 'registryProjectionAttempts:unrelated',
    _creationTime: 3,
    logicalKey: 'registry:unrelated',
    projectionKind: 'business_catalog',
    status: 'queued',
  })
  db.seed('operatorControls', {
    _id: 'operatorControls:unrelated',
    _creationTime: 4,
    key: 'claims_enabled',
    enabled: true,
    reasonCode: 'operator-default',
    evidenceRefs: ['evidence:operator'],
    changedByAdminRef: 'admin:unrelated',
    correlationId: 'corr:operator:unrelated',
    operationKey: 'op:operator:unrelated',
    updatedAt: 4,
  })
  return db
}

function legacyFunnelEventRow(id: string, source: string): Row {
  return {
    _id: id,
    _creationTime: 42,
    eventType: 'visitor_attributed',
    source,
    stage: 'visitor',
    pseudonymousSessionId: 'session:activation',
    correlationId: 'corr:duplicate-funnel-event',
    consentFlag: true,
    createdAt: 1_699_999_999_000,
    referrer: null,
    utmSource: null,
    utmCampaign: null,
    actorRef: null,
    businessId: null,
    claimId: null,
    redactedPayload: {},
  }
}


function touchedUnexpectedTables(db: FakeDb, allowedTables: Readonly<Record<string, true>>): string[] {
  const touchedTables = new Set<string>()
  for (const read of db.reads()) {
    if (allowedTables[read.tableName] !== true) {
      touchedTables.add(`${read.operation}:${read.tableName}`)
    }
  }
  for (const write of db.writes()) {
    if (allowedTables[write.tableName] !== true) {
      touchedTables.add(`${write.kind}:${write.tableName}`)
    }
  }
  return [...touchedTables].sort()
}

function bareCollectReads(db: FakeDb): QueryRead[] {
  return db.reads().filter((read) => read.operation === 'collect' && read.indexName === undefined)
}

function getMutationHandler<Args, Result>(value: unknown): Handler<Args, Result> {
  if (!hasHandlerProperty(value)) {
    throw new Error('Expected Convex registered mutation with _handler')
  }
  const handler = value._handler
  if (typeof handler !== 'function') {
    throw new Error('Expected Convex registered mutation _handler to be callable')
  }

  // Convex's registration object hides the public handler type; the runtime guard above proves it is callable for this bridge test.
  return handler as Handler<Args, Result>
}

function hasHandlerProperty(value: unknown): value is { _handler: unknown } {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && '_handler' in value
}


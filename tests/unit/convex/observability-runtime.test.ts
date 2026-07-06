import { afterEach, describe, expect, it, vi } from 'vitest'

import { recordOwnerActivationEvent } from '../../../convex/observability'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }
type QueryOperation = 'collect' | 'unique' | 'get'
type QueryRead = { tableName: string; operation: QueryOperation; indexName?: string; filters: EqFilter[] }
type WriteOperation =
  | { kind: 'insert'; tableName: string; id: string; value: Record<string, unknown> }
  | { kind: 'patch'; tableName: string; id: string; value: Record<string, unknown> }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  unique: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

type Ctx = { db: Db }

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

const allowedNoBusinessTables: Record<string, true> = { funnelEvents: true }
const allowedBusinessTables: Record<string, true> = { funnelEvents: true, ownerActivationState: true }

describe('Convex observability runtime bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records a session-only funnel event without collecting or upserting unrelated Phase 1 source tables', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedPhaseOneDb()

    const result = await recordOwnerActivationEventHandler({ db }, eventArgs('corr:session-only'))

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
    expect(bareCollectReads(db)).toEqual([])
  })

  it('records a business funnel event by touching only funnelEvents and that business ownerActivationState row', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedPhaseOneDb()

    const result = await recordOwnerActivationEventHandler(
      { db },
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
  })

  it('patches one legacy duplicate funnelEvents correlation row instead of throwing or inserting another row', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const db = seededUnrelatedPhaseOneDb()
    db.seed('funnelEvents', legacyFunnelEventRow('funnelEvents:legacy:first', 'legacy-source'))
    db.seed('funnelEvents', legacyFunnelEventRow('funnelEvents:legacy:second', 'legacy-source-two'))

    const result = await recordOwnerActivationEventHandler({ db }, eventArgs('corr:duplicate-funnel-event'))

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

  private recordRead(operation: QueryOperation): void {
    this.reads.push({
      tableName: this.tableName,
      operation,
      filters: this.filters.map((filter) => ({ ...filter })),
      ...(this.indexName === undefined ? {} : { indexName: this.indexName }),
    })
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}
  private readonly queryReads: QueryRead[] = []
  private readonly writeOperations: WriteOperation[] = []
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(tableName, this.table(tableName), this.queryReads)
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

  dump(tableName: string): Row[] {
    return this.table(tableName).map((row) => ({ ...row }))
  }

  reads(): QueryRead[] {
    return this.queryReads.map((read) => ({ ...read, filters: read.filters.map((filter) => ({ ...filter })) }))
  }

  writes(): WriteOperation[] {
    return this.writeOperations.map((write) => ({ ...write, value: { ...write.value } }))
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

function seededUnrelatedPhaseOneDb(): FakeDb {
  const db = new FakeDb()
  db.seed('businesses', {
    _id: 'businesses:unrelated',
    _creationTime: 1,
    ownerId: 'owners:unrelated',
    slug: 'unrelated-business',
    name: 'Unrelated Business',
    publicStatus: 'published',
  })
  db.seed('businessServices', {
    _id: 'businessServices:unrelated',
    _creationTime: 2,
    businessId: 'businesses:unrelated',
    serviceSlug: 'unrelated-service',
    name: 'Unrelated Service',
    status: 'published',
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
    updatedByAdminRef: 'admin:unrelated',
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


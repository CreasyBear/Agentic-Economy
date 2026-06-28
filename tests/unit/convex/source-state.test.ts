import { describe, expect, it } from 'vitest'

import { loadPhaseOneSourceState, persistPhaseOneSourceState } from '../../../convex/source_state'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

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
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

describe('Convex source-state adapters', () => {
  it('maps Convex source rows into module-shaped state without exposing raw document ids', async () => {
    const db = new FakeDb()
    seedPhaseOneRows(db)

    const state = await loadPhaseOneSourceState(db)

    expect(state.business.owners).toEqual([
      expect.objectContaining({
        ownerId: 'owners:1',
        clerkUserId: 'user_sam',
      }),
    ])
    expect(state.business.owners[0]).not.toHaveProperty('_id')
    expect(state.business.businesses[0]).toMatchObject({
      businessId: 'businesses:1',
      ownerId: 'owners:1',
      sourceHash: 'source:business:v1',
    })
    expect(state.catalog.businessServices[0]).toMatchObject({
      serviceId: 'businessServices:1',
      businessId: 'businesses:1',
      summary: 'Burst pipe triage and repair.',
      sourceHash: 'source:service:v1',
    })
    expect(state.observability.operationKeys[0]).toMatchObject({
      operationKey: 'publish-key',
      requestHash: 'request:publish:v1',
      sourceHash: 'source:business:v1',
    })
    expect(state.observability.auditEvents[0]).toMatchObject({
      eventId: 'audit:publish:1',
      payloadHash: 'payload:publish:v1',
      redactedPayload: {},
    })
    expect(state.observability.auditEvents[0]).not.toHaveProperty('redactedPayloadJson')
    expect(state.discovery.discoveryManifestAttempts[0]).toMatchObject({
      attemptId: 'discovery:attempt:1',
      sourceHash: 'source:business:v1',
      latestReadback: expect.objectContaining({ bodyHash: 'body:v1', urlHash: 'url:v1' }),
    })
  })

  it('upserts source-state writebacks idempotently while preserving hashes, operation keys, and audit ids', async () => {
    const db = new FakeDb()
    seedPhaseOneRows(db)
    const state = await loadPhaseOneSourceState(db)

    first(state.business.businesses).sourceHash = 'source:business:v2'
    first(state.catalog.businessServices).sourceHash = 'source:service:v2'
    first(state.observability.operationKeys).resultHash = 'result:publish:v2'
    first(state.observability.auditEvents).payloadHash = 'payload:publish:v2'
    first(state.observability.auditEvents).redactedPayload = { evidenceCount: 1 }
    first(state.registry.registryProjectionAttempts).sourceHash = 'source:business:v2'
    first(state.discovery.discoveryManifestAttempts).sourceHash = 'source:business:v2'

    await persistPhaseOneSourceState(db, state)
    await persistPhaseOneSourceState(db, state)

    expect(db.dump('businesses')).toHaveLength(1)
    expect(db.dump('businessServices')).toHaveLength(1)
    expect(db.dump('operationKeys')).toHaveLength(1)
    expect(db.dump('auditEvents')).toHaveLength(1)
    expect(db.dump('registryProjectionAttempts')).toHaveLength(1)
    expect(db.dump('discoveryManifestAttempts')).toHaveLength(1)
    expect(db.dump('businesses')[0]).toMatchObject({ sourceHash: 'source:business:v2' })
    expect(db.dump('businessServices')[0]).toMatchObject({ sourceHash: 'source:service:v2' })
    expect(db.dump('operationKeys')[0]).toMatchObject({ key: 'publish-key', resultHash: 'result:publish:v2' })
    expect(db.dump('operationKeys')[0]).not.toHaveProperty('operationKey')
    expect(db.dump('auditEvents')[0]).toMatchObject({
      eventId: 'audit:publish:1',
      payloadHash: 'payload:publish:v2',
      redactedPayloadJson: '{"evidenceCount":1}',
    })
    expect(db.dump('auditEvents')[0]).not.toHaveProperty('redactedPayload')
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
    private readonly rows: readonly Row[],
    private readonly filters: readonly EqFilter[] = []
  ) {}

  withIndex(_indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters])
  }

  async collect(): Promise<Row[]> {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  async unique(): Promise<Row | null> {
    return (await this.collect()).at(0) ?? null
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName))
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) {
      throw new Error(`Missing row ${id}`)
    }
    Object.assign(row, value)
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

function seedPhaseOneRows(db: FakeDb): void {
  db.seed('owners', {
    _id: 'owners:1',
    _creationTime: 1,
    clerkUserId: 'user_sam',
    displayName: 'Sam Owner',
    emailHash: 'email:user_sam',
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('businesses', {
    _id: 'businesses:1',
    _creationTime: 2,
    ownerId: 'owners:1',
    slug: 'sam-plumbing',
    name: 'Sam Plumbing',
    normalizedName: 'sam plumbing',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    publicStatus: 'published',
    trustTier: 'claimed',
    claimStatus: 'published',
    sourceHash: 'source:business:v1',
    createdAt: 2,
    updatedAt: 2,
  })
  db.seed('businessContexts', {
    _id: 'businessContexts:1',
    _creationTime: 3,
    businessId: 'businesses:1',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    sourceRefs: [{ label: 'Owner intake', evidenceRef: 'source:owner', sourceHash: 'source:owner:v1' }],
    sourceHash: 'source:business:v1',
    approvedAt: 3,
  })
  db.seed('claims', {
    _id: 'claims:1',
    _creationTime: 4,
    ownerId: 'owners:1',
    businessId: 'businesses:1',
    slug: 'sam-plumbing',
    status: 'published',
    submittedFactsHash: 'source:business:v1',
    createdAt: 4,
    updatedAt: 4,
  })
  db.seed('businessServices', {
    _id: 'businessServices:1',
    _creationTime: 5,
    businessId: 'businesses:1',
    serviceSlug: 'emergency-pipe-repair',
    name: 'Emergency pipe repair',
    category: 'Emergency plumbing',
    summary: 'Burst pipe triage and repair.',
    serviceArea: 'Parramatta and nearby suburbs',
    hoursOrUnknown: 'Owner supplied hours',
    status: 'published',
    sortOrder: 0,
    sourceHash: 'source:service:v1',
    createdAt: 5,
    updatedAt: 5,
  })
  db.seed('serviceCapabilities', {
    _id: 'serviceCapabilities:1',
    _creationTime: 6,
    businessId: 'businesses:1',
    serviceId: 'businessServices:1',
    kind: 'phone_inquiry',
    status: 'available',
    firstRequestMode: 'inquiry_available',
    publicDisclosure: 'Use the public business contact method listed by the owner.',
    publicChannel: 'public_business_contact',
    callable: false,
    paymentRequired: false,
    sourceHash: 'source:capability:v1',
    createdAt: 6,
    updatedAt: 6,
  })
  db.seed('operationKeys', {
    _id: 'operationKeys:1',
    _creationTime: 7,
    scope: 'catalog',
    actorKind: 'owner',
    actorRef: 'owners:1',
    operationName: 'publishBusinessCatalog',
    key: 'publish-key',
    requestHash: 'request:publish:v1',
    sourceHash: 'source:business:v1',
    status: 'succeeded',
    resultHash: 'result:publish:v1',
    effectRefs: ['audit:publish:1'],
    createdAt: 7,
    updatedAt: 7,
  })
  db.seed('registryProjectionAttempts', {
    _id: 'registryProjectionAttempts:1',
    _creationTime: 8,
    businessId: 'businesses:1',
    logicalKey: 'registry:business:1',
    projectionKind: 'business_catalog',
    sourceHash: 'source:business:v1',
    sourceVersion: 'public-catalog:v1',
    status: 'queued',
    retryCount: 0,
    startedAt: 8,
    repairAction: 'rebuild_projection',
    repairResult: 'not_run',
  })
  db.seed('discoveryManifestAttempts', {
    _id: 'discoveryManifestAttempts:1',
    _creationTime: 9,
    attemptId: 'discovery:attempt:1',
    businessId: 'businesses:1',
    ucpVersion: 'v1',
    pathKind: 'ae_hosted_fallback',
    sourceHash: 'source:business:v1',
    sourceVersion: 'public-catalog:v1',
    status: 'succeeded',
    retryCount: 0,
    startedAt: 9,
    finishedAt: 10,
    bodyHash: 'body:v1',
    urlHash: 'url:v1',
    latestReadback: {
      businessId: 'businesses:1',
      slug: 'sam-plumbing',
      manifestUrl: '/sam-plumbing/ucp',
      sourceVersion: 'public-catalog:v1',
      sourceHash: 'source:business:v1',
      generatedHash: 'generated:v1',
      bodyHash: 'body:v1',
      urlHash: 'url:v1',
      routeUrls: ['/sam-plumbing', '/sam-plumbing/ucp'],
      readAt: 10,
    },
    repairAction: 'no_repair',
    repairResult: 'succeeded',
  })
  db.seed('auditEvents', {
    _id: 'auditEvents:1',
    _creationTime: 10,
    eventId: 'audit:publish:1',
    eventType: 'claim.published',
    actorKind: 'owner',
    actorRef: 'owners:1',
    businessId: 'businesses:1',
    targetType: 'business',
    targetRef: 'businesses:1',
    idempotencyKey: 'publish-key',
    correlationId: 'corr:publish',
    evidenceRefs: [],
    redactedPayloadJson: '{}',
    payloadHash: 'payload:publish:v1',
    createdAt: 10,
  })
  db.seed('operatorControls', {
    _id: 'operatorControls:1',
    _creationTime: 11,
    key: 'claims_enabled',
    enabled: true,
    reasonCode: 'default',
    evidenceRefs: ['evidence:ops'],
    updatedByAdminRef: 'user_sam',
    updatedAt: 11,
  })
  db.seed('disputes', {
    _id: 'disputes:1',
    _creationTime: 12,
    businessId: 'businesses:1',
    status: 'opened',
    openedByContactHash: 'contact:hash',
    targetType: 'business',
    targetRef: 'businesses:1',
    reasonCode: 'privacy_removal_requested',
    evidenceHash: 'evidence:hash',
    evidenceRefs: ['evidence:dispute'],
    publicMessageHash: 'message:hash',
    operationKey: 'dispute-key',
    operationKeys: ['dispute-key'],
    correlationId: 'corr:dispute',
    requestCount: 1,
    createdAt: 12,
    updatedAt: 12,
  })
  db.seed('suppressionRules', {
    _id: 'suppressionRules:1',
    _creationTime: 13,
    targetType: 'business',
    targetRef: 'businesses:1',
    status: 'lifted',
    reasonCode: 'privacy_removal_requested',
    evidenceRefs: ['evidence:suppression'],
    createdByAdminRef: 'user_sam',
    createdAt: 13,
    beforePublicStatus: 'published',
    beforeClaimStatus: 'published',
  })
}

function first<T>(items: readonly T[]): T {
  const item = items[0]
  if (item === undefined) {
    throw new Error('Expected seeded item')
  }
  return item
}

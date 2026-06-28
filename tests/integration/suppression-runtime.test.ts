import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  suppressBusiness,
  unsuppressBusiness,
} from '../../convex/business'
import {
  closeRemovalDispute,
  openRemovalDispute,
} from '../../convex/security'
import { getPublicBusinessCatalogBySlug } from '../../convex/registry'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  unique: () => Promise<Row | null>
  first: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

type RuntimeCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type Handler<Args> = (ctx: RuntimeCtx, args: Args) => Promise<unknown>
type QueryHandler<Args> = (ctx: { db: Db }, args: Args) => Promise<unknown>

type SuppressionArgs = {
  businessId: string
  reasonCode: string
  evidenceRefs: string[]
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

type OpenDisputeArgs = {
  businessId: string
  targetType: 'business' | 'service' | 'capability'
  targetRef: string
  reasonCode: 'privacy_removal_requested' | 'ownership_contested' | 'duplicate_or_impersonation' | 'unsafe_or_inaccurate'
  contactEmail?: string
  contactPhone?: string
  contactName?: string
  evidence: { label: string; mediaType: 'text/plain' | 'image/jpeg' | 'image/png' | 'application/pdf'; byteLength: number; privateRef: string }[]
  publicMessage?: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

type CloseDisputeArgs = {
  disputeId: string
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
}

const suppressHandler = (suppressBusiness as unknown as { _handler: Handler<SuppressionArgs> })._handler
const unsuppressHandler = (unsuppressBusiness as unknown as { _handler: Handler<SuppressionArgs> })._handler
const openDisputeHandler = (openRemovalDispute as unknown as { _handler: Handler<OpenDisputeArgs> })._handler
const closeDisputeHandler = (closeRemovalDispute as unknown as { _handler: Handler<CloseDisputeArgs> })._handler
const detailHandler = (getPublicBusinessCatalogBySlug as unknown as { _handler: QueryHandler<{ slug: string }> })._handler

describe('suppression and removal Convex runtime controls', () => {
  it('suppresses and unsuppresses a published catalog through source-owned owner_admin authority', async () => {
    const db = seededPublishedDb()

    const before = await detailHandler(queryCtx(db), { slug: 'sam-plumbing' })
    expect(before).toMatchObject({ kind: 'found', business: { slug: 'sam-plumbing' } })

    const supportDenied = await suppressHandler(authCtx(db, support()), suppressionArgs('support-denied'))
    expect(supportDenied).toMatchObject({
      kind: 'error',
      code: 'business_suppress_admin_denied',
      reason: 'action_not_allowed',
    })
    expect(db.dump('auditEvents')).toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: 'admin.action_denied', actorRef: 'user_support' })])
    )

    const suppressed = await suppressHandler(authCtx(db, ownerAdmin()), suppressionArgs('owner-suppress'))
    expect(suppressed).toMatchObject({
      kind: 'ok',
      code: 'business_suppressed',
      business: { publicStatus: 'suppressed', claimStatus: 'suppressed' },
      auditEvent: { eventType: 'business.suppressed' },
    })
    expect(db.dump('businesses')[0]).toMatchObject({ publicStatus: 'suppressed', claimStatus: 'suppressed' })
    expect(db.dump('businessServices')[0]).toMatchObject({ status: 'suppressed' })
    expect(db.dump('suppressionRules')).toHaveLength(1)

    const hidden = await detailHandler(queryCtx(db), { slug: 'sam-plumbing' })
    expect(hidden).toMatchObject({ kind: 'not_found' })

    const unsuppressed = await unsuppressHandler(authCtx(db, ownerAdmin()), {
      ...suppressionArgs('owner-unsuppress'),
      reasonCode: 'removal_resolved',
    })
    expect(unsuppressed).toMatchObject({
      kind: 'ok',
      code: 'business_unsuppressed',
      business: { publicStatus: 'published', claimStatus: 'published' },
      auditEvent: { eventType: 'business.unsuppressed' },
    })
    expect(db.dump('suppressionRules')[0]).toMatchObject({ status: 'lifted', liftedByAdminRef: 'user_owner' })
  })

  it('opens public removal disputes with redacted receipt only and closes them through owner_admin', async () => {
    const db = seededPublishedDb()

    const opened = await openDisputeHandler(authCtx(db, null), openDisputeArgs('first'))
    expect(opened).toMatchObject({
      kind: 'ok',
      code: 'dispute_opened',
      receipt: { status: 'opened', targetType: 'business', reasonCode: 'privacy_removal_requested' },
    })
    expect(JSON.stringify(opened)).not.toMatch(/owner@example\.test|0412|private:evidence|Remove my private details/i)
    expect(JSON.stringify(db.dump('disputes'))).not.toMatch(/owner@example\.test|0412|Remove my private details/i)
    expect(db.dump('disputes')).toHaveLength(1)

    const supportClose = await closeDisputeHandler(authCtx(db, support()), closeDisputeArgs('support-close'))
    expect(supportClose).toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'action_not_allowed',
    })
    expect(db.dump('auditEvents')).toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: 'admin.action_denied', actorRef: 'user_support' })])
    )

    const disputeId = String(db.dump('disputes')[0]?._id)
    const closed = await closeDisputeHandler(authCtx(db, ownerAdmin()), {
      ...closeDisputeArgs('owner-close'),
      disputeId,
    })
    expect(closed).toMatchObject({
      kind: 'ok',
      code: 'dispute_closed',
      receipt: { status: 'closed' },
      auditEvent: { eventType: 'dispute.closed' },
    })
    expect(db.dump('disputes')[0]).toMatchObject({ status: 'closed' })
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

  async first(): Promise<Row | null> {
    return this.unique()
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName))
  }

  async get(id: string): Promise<Row | null> {
    return Object.values(this.tables).flat().find((row) => row._id === id) ?? null
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...value })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = await this.get(id)
    if (row === null) {
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

function seededPublishedDb(): FakeDb {
  const db = new FakeDb()
  db.seed('adminMemberships', {
    _id: 'adminMemberships:owner',
    _creationTime: 1,
    clerkUserId: 'user_owner',
    role: 'owner_admin',
    state: 'active',
    grantedBy: 'bootstrap:user_owner',
    grantedAt: 1,
    evidenceRef: 'private:evidence:bootstrap',
  })
  db.seed('adminMemberships', {
    _id: 'adminMemberships:support',
    _creationTime: 2,
    clerkUserId: 'user_support',
    role: 'support',
    state: 'active',
    grantedBy: 'user_owner',
    grantedAt: 2,
  })
  db.seed('businesses', {
    _id: 'businesses:1',
    _creationTime: 3,
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
    createdAt: 3,
    updatedAt: 3,
  })
  db.seed('businessContexts', {
    _id: 'businessContexts:1',
    _creationTime: 4,
    businessId: 'businesses:1',
    category: 'Emergency plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    sourceRefs: [{ label: 'Owner intake', evidenceRef: 'private:evidence:source', sourceHash: 'source:owner:v1' }],
    sourceHash: 'source:business:v1',
    approvedAt: 4,
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
  return db
}

function authCtx(db: Db, identity: UserIdentity | null): RuntimeCtx {
  return {
    db,
    auth: { getUserIdentity: async () => identity },
  }
}

function queryCtx(db: Db): { db: Db } {
  return { db }
}

function ownerAdmin(): UserIdentity {
  return { tokenIdentifier: 'clerk|user_owner', subject: 'user_owner', issuer: 'https://clerk.example.test' }
}

function support(): UserIdentity {
  return { tokenIdentifier: 'clerk|user_support', subject: 'user_support', issuer: 'https://clerk.example.test' }
}

function suppressionArgs(key: string): SuppressionArgs {
  return {
    businessId: 'businesses:1',
    reasonCode: 'privacy_removal_requested',
    evidenceRefs: ['private:evidence:suppression'],
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    operationKey: `op:suppression:${key}`,
    correlationId: `corr:suppression:${key}`,
  }
}

function openDisputeArgs(key: string): OpenDisputeArgs {
  return {
    businessId: 'businesses:1',
    targetType: 'business',
    targetRef: 'businesses:1',
    reasonCode: 'privacy_removal_requested',
    contactEmail: 'owner@example.test',
    contactPhone: '0412 000 000',
    contactName: 'Sam Owner',
    evidence: [
      {
        label: 'Owner evidence',
        mediaType: 'text/plain',
        byteLength: 2_000,
        privateRef: 'private:evidence:removal:1',
      },
    ],
    publicMessage: 'Remove my private details from the listing.',
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    operationKey: `op:dispute:${key}`,
    correlationId: `corr:dispute:${key}`,
  }
}

function closeDisputeArgs(key: string): CloseDisputeArgs {
  return {
    disputeId: 'disputes:1',
    reasonCode: 'removal_resolved',
    evidenceRefs: ['private:evidence:close-dispute'],
    operationKey: `op:dispute:close:${key}`,
    correlationId: `corr:dispute:close:${key}`,
  }
}

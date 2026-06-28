import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  bootstrapOwnerAdmin,
  grantAdminMembership,
  readAdminAuditEvents,
  readAdminClaims,
  readAdminIndexHealth,
} from '../../convex/security'
import {
  readOperatorControls,
  setOperatorControl,
} from '../../convex/observability'

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

const readClaimsHandler = (readAdminClaims as unknown as { _handler: Handler<Record<string, never>> })._handler
const readAuditHandler = (readAdminAuditEvents as unknown as { _handler: Handler<Record<string, never>> })._handler
const readIndexHealthHandler = (readAdminIndexHealth as unknown as { _handler: Handler<Record<string, never>> })._handler
const bootstrapHandler = (bootstrapOwnerAdmin as unknown as { _handler: Handler<AdminBootstrapArgs> })._handler
const grantHandler = (grantAdminMembership as unknown as { _handler: Handler<GrantArgs> })._handler
const setControlHandler = (setOperatorControl as unknown as { _handler: Handler<SetControlArgs> })._handler
const readControlsHandler = (readOperatorControls as unknown as { _handler: Handler<Record<string, never>> })._handler

type AdminBootstrapArgs = {
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
}

type GrantArgs = {
  targetClerkUserId: string
  role: 'owner_admin' | 'support' | 'reviewer'
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
}

type SetControlArgs = {
  key: 'claims_enabled' | 'publish_enabled' | 'registry_enabled' | 'discovery_enabled' | 'public_copy_safe_mode'
  enabled: boolean
  reasonCode: string
  evidenceRefs: string[]
  expiresAt?: number
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

describe('admin Convex runtime controls', () => {
  it('denies non-admin readbacks without private rows and allows owner_admin durable readbacks', async () => {
    const db = seededAdminDb()

    const denied = await readClaimsHandler(authCtx(db, null), {})
    expect(denied).toMatchObject({ kind: 'denied', httpStatus: 401, rows: [] })
    expect(JSON.stringify(denied)).not.toMatch(/private:evidence|owner@example|rawContact/i)

    const claims = await readClaimsHandler(authCtx(db, ownerAdmin()), {})
    const audit = await readAuditHandler(authCtx(db, ownerAdmin()), {})
    const indexHealth = await readIndexHealthHandler(authCtx(db, ownerAdmin()), {})

    expect(claims).toMatchObject({
      kind: 'allowed',
      httpStatus: 200,
      rows: [expect.objectContaining({ rowType: 'claim', readbackState: 'available' })],
    })
    expect(audit).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ rowType: 'audit_event', readbackState: 'available' })],
    })
    expect(indexHealth).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ rowType: 'index_surface', repairAction: 'regenerate_projection' })],
    })
    expect(JSON.stringify({ claims, audit, indexHealth })).not.toMatch(/private:evidence:raw|contactEmail|ownerId|adminId/i)
  })

  it('bootstraps only a preauthorized first owner_admin and stores audit rows', async () => {
    const db = new FakeDb()
    process.env.ADMIN_BOOTSTRAP_PRINCIPAL_IDS = 'user_owner'

    const arbitrary = await bootstrapHandler(authCtx(db, support()), bootstrapArgs('random'))
    expect(arbitrary).toMatchObject({ kind: 'error', code: 'admin_bootstrap_denied' })
    expect(db.dump('adminMemberships')).toHaveLength(0)

    const bootstrapped = await bootstrapHandler(authCtx(db, ownerAdmin()), bootstrapArgs('owner'))
    expect(bootstrapped).toMatchObject({
      kind: 'ok',
      code: 'admin_membership_bootstrapped',
      membership: { clerkUserId: 'user_owner', role: 'owner_admin', state: 'active' },
    })
    expect(db.dump('adminMemberships')).toHaveLength(1)
    expect(db.dump('adminMembershipAuditEvents')).toHaveLength(2)
    expect(db.dump('auditEvents').map((row) => row.eventType)).toEqual([
      'admin.action_denied',
      'admin.membership_bootstrapped',
    ])

    delete process.env.ADMIN_BOOTSTRAP_PRINCIPAL_IDS
  })

  it('lets owner_admin grant support while support is denied destructive controls with audit evidence', async () => {
    const db = seededAdminDb()

    const grant = await grantHandler(authCtx(db, ownerAdmin()), {
      targetClerkUserId: 'user_new_support',
      role: 'support',
      reasonCode: 'support_queue_access',
      evidenceRefs: ['private:evidence:grant'],
      operationKey: 'op:admin:grant:new-support',
      correlationId: 'corr:admin:grant:new-support',
    })
    expect(grant).toMatchObject({ kind: 'ok', code: 'admin_membership_granted' })

    const supportDenied = await setControlHandler(authCtx(db, support()), operatorArgs('support-denied'))
    expect(supportDenied).toMatchObject({
      kind: 'error',
      code: 'operator_control_admin_denied',
      reason: 'action_not_allowed',
    })
    expect(db.dump('auditEvents')).toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: 'admin.action_denied', actorRef: 'user_support' })])
    )

    const ownerChanged = await setControlHandler(authCtx(db, ownerAdmin()), operatorArgs('owner-changed'))
    expect(ownerChanged).toMatchObject({
      kind: 'ok',
      code: 'operator_control_changed',
      readback: { key: 'claims_enabled', configuredEnabled: false, effectiveEnabled: false },
      auditEvent: { eventType: 'operator_control.changed' },
    })
    expect(db.dump('operatorControls')).toHaveLength(1)

    const controls = await readControlsHandler(authCtx(db, ownerAdmin()), {})
    expect(controls).toMatchObject({
      kind: 'allowed',
      controls: [expect.objectContaining({ key: 'claims_enabled', effectiveEnabled: false })],
    })
    expect(JSON.stringify(controls)).not.toContain('private:evidence')
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

function seededAdminDb(): FakeDb {
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
    evidenceRef: 'private:evidence:support',
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
  db.seed('claims', {
    _id: 'claims:1',
    _creationTime: 4,
    ownerId: 'owners:1',
    businessId: 'businesses:1',
    slug: 'sam-plumbing',
    status: 'contested',
    submittedFactsHash: 'source:claim:v1',
    createdAt: 4,
    updatedAt: 4,
  })
  db.seed('auditEvents', {
    _id: 'auditEvents:1',
    _creationTime: 5,
    eventId: 'audit:claim:1',
    eventType: 'claim.duplicate_suspected',
    actorKind: 'owner',
    actorRef: 'owner:hash',
    targetType: 'claim',
    targetRef: 'claims:1',
    businessId: 'businesses:1',
    idempotencyKey: 'op:claim:duplicate',
    correlationId: 'corr:claim:duplicate',
    evidenceRefs: ['private:evidence:raw'],
    redactedPayload: { evidenceCount: 1 },
    payloadHash: 'payload:claim:1',
    createdAt: 5,
  })
  db.seed('registryProjectionAttempts', {
    _id: 'registryProjectionAttempts:1',
    _creationTime: 6,
    businessId: 'businesses:1',
    logicalKey: 'registry:businesses:1',
    status: 'failed',
    sourceHash: 'source:business:v1',
    targetSurface: 'registry',
    retryCount: 1,
    startedAt: 6,
    finishedAt: 7,
    failureCode: 'adapter_failed',
    redactedError: 'Projection adapter failed.',
  })
  db.seed('indexStatus', {
    _id: 'indexStatus:1',
    _creationTime: 8,
    targetType: 'business',
    targetRef: 'businesses:1',
    status: 'failed',
    latestAttemptRef: 'registry:businesses:1',
    latestReadback: { generatedHash: 'readback:registry:failed' },
    updatedAt: 8,
  })
  return db
}

function authCtx(db: Db, identity: UserIdentity | null): RuntimeCtx {
  return {
    db,
    auth: {
      getUserIdentity: async () => identity,
    },
  }
}

function ownerAdmin(): UserIdentity {
  return { tokenIdentifier: 'clerk|user_owner', subject: 'user_owner', issuer: 'https://clerk.example.test' }
}

function support(): UserIdentity {
  return { tokenIdentifier: 'clerk|user_support', subject: 'user_support', issuer: 'https://clerk.example.test' }
}

function bootstrapArgs(key: string): AdminBootstrapArgs {
  return {
    reasonCode: 'source_owned_setup',
    evidenceRefs: ['private:evidence:bootstrap'],
    operationKey: `op:admin:bootstrap:${key}`,
    correlationId: `corr:admin:bootstrap:${key}`,
  }
}

function operatorArgs(key: string): SetControlArgs {
  return {
    key: 'claims_enabled',
    enabled: false,
    reasonCode: 'abuse_spike',
    evidenceRefs: ['private:evidence:operator-control'],
    expiresAt: 100,
    csrfToken: `csrf-${key}`,
    csrfCookie: `csrf-${key}`,
    operationKey: `op:operator:${key}`,
    correlationId: `corr:operator:${key}`,
  }
}

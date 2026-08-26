import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  bootstrapOwnerAdmin,
  grantAdminMembership,
  readAdminAuditEvents,
  readAdminIndexHealth,
} from '../../convex/security'
import { interactiveCredentialExpiryNonce } from '../../convex/interactiveCredentialLifecycle'
import { withSourceWrite } from '../helpers/source-write-admission'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  order: (direction: 'asc' | 'desc') => Query
  take: (limit: number) => Promise<Row[]>
  collect: () => Promise<Row[]>
  unique: () => Promise<Row | null>
  first: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
  replace: (id: string, value: Record<string, unknown>) => Promise<void>
}

type TestCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type Handler<Args> = (ctx: TestCtx, args: Args) => Promise<unknown>

const readAuditHandler = (readAdminAuditEvents as unknown as { _handler: Handler<Record<string, never>> })._handler
const readIndexHealthHandler = (readAdminIndexHealth as unknown as { _handler: Handler<Record<string, never>> })._handler
const bootstrapHandler = (bootstrapOwnerAdmin as unknown as { _handler: Handler<AdminBootstrapArgs> })._handler
const grantHandler = (grantAdminMembership as unknown as { _handler: Handler<GrantArgs> })._handler

type AdminBootstrapArgs = {
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
  sourceWriteRequest: SourceWriteAdmissionRequest
  sourceWrite: SourceWriteAdmission
}

type GrantArgs = {
  targetClerkUserId: string
  targetTokenIdentifier: string
  role: 'owner_admin' | 'support' | 'reviewer'
  reasonCode: string
  evidenceRefs: string[]
  operationKey: string
  correlationId: string
  sourceWriteRequest: SourceWriteAdmissionRequest
  sourceWrite: SourceWriteAdmission
}

describe('admin Convex runtime controls', () => {
  it('denies non-admin readbacks without private rows and allows owner_admin durable readbacks', async () => {
    const db = seededAdminDb()

    const denied = await readAuditHandler(authCtx(db, null), {})
    expect(denied).toMatchObject({ kind: 'denied', httpStatus: 401, rows: [] })
    expect(JSON.stringify(denied)).not.toMatch(/private:evidence|owner@example|rawContact/i)

    const audit = await readAuditHandler(authCtx(db, ownerAdmin()), {})
    const indexHealth = await readIndexHealthHandler(authCtx(db, ownerAdmin()), {})
    const repeatedAudit = await readAuditHandler(authCtx(db, ownerAdmin()), {})
    const repeatedIndexHealth = await readIndexHealthHandler(authCtx(db, ownerAdmin()), {})

    expect(JSON.stringify(repeatedAudit)).toBe(JSON.stringify(audit))
    expect(JSON.stringify(repeatedIndexHealth)).toBe(JSON.stringify(indexHealth))

    expect(audit).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ rowType: 'audit_event', readbackState: 'available' })],
    })
    expect(indexHealth).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ rowType: 'index_surface', repairAction: 'regenerate_projection' })],
    })
    expect(JSON.stringify({ audit, indexHealth })).not.toMatch(/private:evidence:raw|contactEmail|ownerId|adminId/i)
  })

  it('bootstraps only a preauthorized first owner_admin and stores audit rows', async () => {
    const db = new FakeDb()
    process.env.ADMIN_BOOTSTRAP_PRINCIPAL_IDS = 'user_owner'

    const arbitrary = await bootstrapHandler(authCtx(db, support()), await bootstrapArgs('random'))
    expect(arbitrary).toMatchObject({ kind: 'error', code: 'admin_bootstrap_denied' })
    expect(db.dump('adminMemberships')).toHaveLength(0)

    const bootstrapped = await bootstrapHandler(authCtx(db, ownerAdmin()), await bootstrapArgs('owner'))
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

  it('lets owner_admin grant support', async () => {
    const db = seededAdminDb()

    const grant = await grantHandler(
      authCtx(db, ownerAdmin()),
      await withSourceWrite('admin_operator', {
        targetClerkUserId: 'user_new_support',
        targetTokenIdentifier: 'clerk|user_new_support',
        role: 'support',
        reasonCode: 'support_queue_access',
        evidenceRefs: ['private:evidence:grant'],
        operationKey: 'op:admin:grant:new-support',
        correlationId: 'corr:admin:grant:new-support',
      })
    )
    expect(grant).toMatchObject({ kind: 'ok', code: 'admin_membership_granted' })
  })

  it('replays an authorized grant without duplicating membership or audit effects', async () => {
    const db = seededAdminDb()
    const command = {
      targetClerkUserId: 'user_replayed_support',
      targetTokenIdentifier: 'clerk|user_replayed_support',
      role: 'support' as const,
      reasonCode: 'support_queue_access',
      evidenceRefs: ['private:evidence:replay'],
      operationKey: 'op:admin:grant:replay',
      correlationId: 'corr:admin:grant:replay',
    }

    const first = await grantHandler(authCtx(db, ownerAdmin()), await withSourceWrite('admin_operator', command))
    const second = await grantHandler(authCtx(db, ownerAdmin()), await withSourceWrite('admin_operator', command))

    expect(first).toMatchObject({
      kind: 'ok',
      code: 'admin_membership_granted',
      membership: {
        clerkUserId: command.targetClerkUserId,
        tokenIdentifier: command.targetTokenIdentifier,
        role: command.role,
        state: 'active',
      },
    })
    expect(second).toMatchObject({
      kind: 'ok',
      code: 'admin_membership_granted',
      membership: {
        clerkUserId: command.targetClerkUserId,
        tokenIdentifier: command.targetTokenIdentifier,
        role: command.role,
        state: 'active',
      },
    })
    expect(db.dump('adminMemberships').filter((row) => (
      row.clerkUserId === command.targetClerkUserId && row.state === 'active'
    ))).toHaveLength(1)
    expect(db.dump('auditEvents').filter((row) => (
      row.eventType === 'admin.membership_granted' && row.targetRef === command.targetClerkUserId
    ))).toHaveLength(1)
    expect(db.dump('adminMembershipAuditEvents').filter((row) => (
      row.eventType === 'membership_granted' && row.targetRef === command.targetClerkUserId
    ))).toHaveLength(1)
  })

  it('refuses grant when target is already bound to a different active token', async () => {
    const db = seededAdminDb()
    db.seed('adminMemberships', {
      _id: 'adminMemberships:other-support-token',
      _creationTime: 7,
      clerkUserId: 'target_support',
      tokenIdentifier: 'clerk|old-target-support',
      role: 'support',
      state: 'active',
      grantedBy: 'bootstrap',
      grantedAt: 1,
    })
    const before = db.dump('adminMemberships')

    const result = await grantHandler(
      authCtx(db, ownerAdmin()),
      await withSourceWrite('admin_operator', {
        targetClerkUserId: 'target_support',
        targetTokenIdentifier: 'clerk|target_support',
        role: 'support',
        reasonCode: 'support_queue_access',
        evidenceRefs: ['private:evidence:token-conflict'],
        operationKey: 'op:admin:grant:token-conflict',
        correlationId: 'corr:admin:grant:token-conflict',
      })
    )

    expect(result).toEqual({
      kind: 'error',
      code: 'admin_action_denied',
      retryable: false,
      reason: 'membership_conflict',
    })
    expect(db.dump('adminMemberships')).toEqual(before)
  })

  it('refuses bootstrap when a current target has a different active token', async () => {
    const db = new FakeDb()
    db.seed('adminMemberships', {
      _id: 'adminMemberships:target-owner',
      _creationTime: 1,
      clerkUserId: 'target_owner',
      tokenIdentifier: 'clerk|old-target-owner',
      role: 'support',
      state: 'active',
      grantedBy: 'bootstrap',
      grantedAt: 1,
    })
    const before = db.dump('adminMemberships')
    process.env.ADMIN_BOOTSTRAP_PRINCIPAL_IDS = 'target_owner'

    try {
      const result = await bootstrapHandler(
        authCtx(db, {
          subject: 'target_owner',
          tokenIdentifier: 'clerk|target_owner',
          issuer: 'https://clerk.example.test',
        }),
        await bootstrapArgs('owner-token-conflict')
      )
      expect(result).toEqual({
        kind: 'error',
        code: 'admin_bootstrap_denied',
        retryable: false,
        reason: 'membership_conflict',
      })
      expect(db.dump('adminMemberships')).toEqual(before)
    } finally {
      delete process.env.ADMIN_BOOTSTRAP_PRINCIPAL_IDS
    }
  })

  it('denies malformed grant token identifiers without creating membership rows', async () => {
    const db = seededAdminDb()
    const before = db.dump('adminMemberships')

    const result = await grantHandler(
      authCtx(db, ownerAdmin()),
      await withSourceWrite('admin_operator', {
        targetClerkUserId: 'malformed_target',
        targetTokenIdentifier: '   ',
        role: 'support',
        reasonCode: 'support_queue_access',
        evidenceRefs: ['private:evidence:malformed-token'],
        operationKey: 'op:admin:grant:malformed-token',
        correlationId: 'corr:admin:grant:malformed-token',
      })
    )

    expect(result).toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'malformed_token_identifier',
    })
    expect(db.dump('adminMemberships')).toEqual(before)
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
    private readonly filters: readonly EqFilter[] = [],
    private readonly direction: 'asc' | 'desc' = 'asc'
  ) {}

  withIndex(_indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters], this.direction)
  }

  order(direction: 'asc' | 'desc'): Query {
    return new FakeQuery(this.rows, this.filters, direction)
  }

  async take(limit: number): Promise<Row[]> {
    const rows = this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
    rows.sort((left, right) =>
      this.direction === 'desc'
        ? right._creationTime - left._creationTime
        : left._creationTime - right._creationTime
    )
    return rows.slice(0, limit)
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

  async replace(id: string, value: Record<string, unknown>): Promise<void> {
    const table = Object.values(this.tables).find((rows) => rows.some((row) => row._id === id))
    const index = table?.findIndex((row) => row._id === id) ?? -1
    if (table === undefined || index < 0) {
      throw new Error(`Missing row ${id}`)
    }
    const previous = table[index]
    if (previous === undefined) {
      throw new Error(`Missing row ${id}`)
    }
    table[index] = { _id: previous._id, _creationTime: previous._creationTime, ...value }
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
    tokenIdentifier: 'clerk|user_owner',
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
    tokenIdentifier: 'clerk|user_support',
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
    sourceHash: 'source:business:v1',
    createdAt: 3,
    updatedAt: 3,
  })
  db.seed('disputes', {
    _id: 'disputes:1',
    _creationTime: 4,
    businessId: 'businesses:1',
    status: 'contested',
    openedByContactHash: 'contact:owner',
    targetType: 'business',
    targetRef: 'businesses:1',
    reasonCode: 'ownership_contested',
    evidenceHash: 'evidence:dispute:1',
    evidenceRefs: ['private:evidence:raw'],
    publicMessageHash: 'message:dispute:1',
    operationKey: 'operation:dispute:1',
    operationKeys: ['operation:dispute:1'],
    correlationId: 'correlation:dispute:1',
    requestCount: 1,
    createdAt: 4,
    updatedAt: 4,
  })
  db.seed('auditEvents', {
    _id: 'auditEvents:1',
    _creationTime: 5,
    eventId: 'audit:dispute:1',
    eventType: 'dispute.opened',
    actorKind: 'owner',
    actorRef: 'owner:hash',
    targetType: 'dispute',
    targetRef: 'disputes:1',
    businessId: 'businesses:1',
    idempotencyKey: 'op:dispute:open',
    correlationId: 'corr:dispute:open',
    evidenceRefs: ['private:evidence:raw'],
    redactedPayloadJson: '{"evidenceCount":1}',
    payloadHash: 'payload:dispute:1',
    createdAt: 5,
  })
  return db
}

function authCtx(db: Db, identity: UserIdentity | null): TestCtx {
  const canonicalIdentity = identity === null
    ? null
    : { ...identity, exp: identity.exp ?? 8_000_000_000 }
  if (canonicalIdentity !== null && db instanceof FakeDb) {
    seedCanonicalIdentity(db, canonicalIdentity)
  }
  return {
    db,
    auth: {
      getUserIdentity: async () => canonicalIdentity,
    },
  }
}

function seedCanonicalIdentity(db: FakeDb, identity: UserIdentity): void {
  const tokenIdentifier = identity.tokenIdentifier
  if (db.dump('externalIdentityBindings').some((row) => row.providerIdentifier === tokenIdentifier)) return
  const suffix = canonicalDigest({ tokenIdentifier }).slice('sha256:'.length, 'sha256:'.length + 32)
  const principalRef = `prn_${suffix}`
  const accountRef = `acc_${suffix}`
  const ownershipRef = `own_${suffix}`
  const bindingRef = `eib_${suffix}`
  const credentialRef = `crd_${suffix}`
  const now = 1
  const expiresAt = 8_000_000_000_000
  db.seed('principals', {
    _id: `principals:${suffix}`,
    _creationTime: now,
    principalRef,
    kind: 'human',
    lifecycle: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('accounts', {
    _id: `accounts:${suffix}`,
    _creationTime: now,
    accountRef,
    displayName: `${identity.subject} account`,
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: principalRef,
    creationIdempotencyRef: `create:${accountRef}`,
    initialOwnershipRef: ownershipRef,
    currentOwnershipRef: ownershipRef,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    lastAction: {
      actorPrincipalRef: principalRef,
      activeAccountRef: accountRef,
      correlationRef: `create:${accountRef}`,
      idempotencyRef: `create:${accountRef}`,
    },
  })
  db.seed('accountOwnerships', {
    _id: `accountOwnerships:${suffix}`,
    _creationTime: now,
    ownershipRef,
    accountRef,
    ownerPrincipalRef: principalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: now,
    createdBy: {
      actorPrincipalRef: principalRef,
      activeAccountRef: accountRef,
      correlationRef: `create:${ownershipRef}`,
      idempotencyRef: `create:${ownershipRef}`,
    },
  })
  db.seed('externalIdentityBindings', {
    _id: `externalIdentityBindings:${suffix}`,
    _creationTime: now,
    bindingRef,
    principalRef,
    providerNamespace: 'clerk/user',
    providerIdentifier: tokenIdentifier,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
    bindIdempotencyRef: `bind:${bindingRef}`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  })
  const credential = {
    _id: `credentials:${suffix}`,
    _creationTime: now,
    credentialRef,
    bindingRef,
    principalRef,
    type: 'provider_token',
    lifecycle: 'active',
    generation: 1,
    issueIdempotencyRef: `issue:${credentialRef}`,
    revision: 1,
    issuedAt: now,
    expiresAt,
    updatedAt: now,
  }
  db.seed('credentials', {
    ...credential,
    expiryMaterialization: {
      state: 'scheduled',
      credentialGeneration: 1,
      credentialExpiresAt: expiresAt,
      scheduleNonce: interactiveCredentialExpiryNonce(credential),
      scheduleRef: `scheduled:${credentialRef}`,
      materializedAt: now,
    },
  })
  db.seed('owners', {
    _id: `owners:${suffix}`,
    _creationTime: now,
    clerkUserId: identity.subject,
    canonicalPrincipalRef: principalRef,
    canonicalAccountRef: accountRef,
    createdAt: now,
    updatedAt: now,
  })
}

function ownerAdmin(): UserIdentity {
  return { tokenIdentifier: 'clerk|user_owner', subject: 'user_owner', issuer: 'https://clerk.example.test' }
}

function support(): UserIdentity {
  return { tokenIdentifier: 'clerk|user_support', subject: 'user_support', issuer: 'https://clerk.example.test' }
}


async function bootstrapArgs(key: string): Promise<AdminBootstrapArgs> {
  return await withSourceWrite('admin_operator', {
    reasonCode: 'source_owned_setup',
    evidenceRefs: ['private:evidence:bootstrap'],
    operationKey: `op:admin:bootstrap:${key}`,
    correlationId: `corr:admin:bootstrap:${key}`,
  })
}

import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import {
  approveCurrentOwnerContactFollowUp,
  listCurrentOwnerContactFollowUpQueue,
  markCurrentOwnerContactFollowUpNoRepair,
  proposeCurrentOwnerContactFollowUp,
  readAdminContactFollowUpReconstruction,
  readCurrentOwnerContactFollowUpDetail,
  rejectCurrentOwnerContactFollowUp,
  retryCurrentOwnerContactFollowUp,
} from '../../../convex/protectedActions'
import { persistContactFollowUpSlice } from '../../../convex/protectedActionStore'
import { brandNonEmpty, type SourceHash } from '../../../src/modules/common/ids'
import { stableHash } from '../../../src/modules/common/stable-hash'
import {
  ContactFollowUpActionSlug,
  ContactFollowUpMaxAttemptCount,
  createContactFollowUpGatewayAdmission,
  createEmptyContactFollowUpSourceState,
  decideContactFollowUpProposal,
  evaluateContactFollowUpPolicy,
  proposeContactFollowUpRequest,
  recordContactFollowUpProviderAttempt,
} from '../../../src/modules/protected-action/public'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }
type QueryRead = { tableName: string; indexName?: string }

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

type AuthCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

type ProposeArgs = {
  businessId: string
  serviceId?: string
  sourceEvidenceRef: string
  parameters: {
    contactName: string
    contactChannel: 'email' | 'phone' | 'other'
    messageSummary: string
    sourceMessageRef: string
  }
  policyHints?: {
    sourceProof: 'present' | 'missing' | 'gap'
    requiresExternalAuthority: boolean
  }
  deadlineAt: number
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

type DecisionArgs = {
  proposalId: string
  reason: string
  evidenceRefs: string[]
  consequenceAccepted: boolean
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

type RetryArgs = {
  proposalId: string
  readbackKind: 'receipt' | 'proof_gap' | 'failed'
  reason: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

const proposeHandler = (proposeCurrentOwnerContactFollowUp as unknown as {
  _handler: (ctx: AuthCtx, args: ProposeArgs) => Promise<unknown>
})._handler
const listHandler = (listCurrentOwnerContactFollowUpQueue as unknown as {
  _handler: (ctx: AuthCtx, args: Record<string, never>) => Promise<unknown>
})._handler
const detailHandler = (readCurrentOwnerContactFollowUpDetail as unknown as {
  _handler: (ctx: AuthCtx, args: { proposalId: string }) => Promise<unknown>
})._handler
const approveHandler = (approveCurrentOwnerContactFollowUp as unknown as {
  _handler: (ctx: AuthCtx, args: DecisionArgs) => Promise<unknown>
})._handler
const rejectHandler = (rejectCurrentOwnerContactFollowUp as unknown as {
  _handler: (ctx: AuthCtx, args: DecisionArgs) => Promise<unknown>
})._handler
const retryHandler = (retryCurrentOwnerContactFollowUp as unknown as {
  _handler: (ctx: AuthCtx, args: RetryArgs) => Promise<unknown>
})._handler
const noRepairHandler = (markCurrentOwnerContactFollowUpNoRepair as unknown as {
  _handler: (ctx: AuthCtx, args: DecisionArgs & { attemptId?: string }) => Promise<unknown>
})._handler
const adminHandler = (readAdminContactFollowUpReconstruction as unknown as {
  _handler: (ctx: AuthCtx, args: { proposalId?: string }) => Promise<unknown>
})._handler

describe('Convex protected action runtime bridge', () => {
  it('persists proposal, policy, owner approval, one-use attempt, receipt, audit, and operation rows', async () => {
    const db = seededProtectedActionDb()
    const proposed = requireOk(await proposeHandler(authCtx(db, sam()), proposeArgs('approve')))
    const proposalId = proposed.reconstruction.proposal.id
    expectNoProtectedActionBareScans(db)

    expect(db.dump('protectedActionProposals')).toHaveLength(1)
    expect(db.dump('protectedActionPolicyDecisions')).toHaveLength(1)
    expect(db.dump('protectedActionGatewayAdmissions')).toHaveLength(0)
    expect(db.dump('protectedActionAttempts')).toHaveLength(0)
    expect(db.dump('operationKeys').map((row) => row.operationName)).toEqual(
      expect.arrayContaining(['proposeContactFollowUpRequest', 'evaluateContactFollowUpPolicy'])
    )

    db.clearReadLog()
    const wrongOwnerDetail = await detailHandler(authCtx(db, alex()), { proposalId })
    expect(wrongOwnerDetail).toMatchObject({ kind: 'error', code: 'contact_follow_up_not_found' })
    expect(JSON.stringify(wrongOwnerDetail)).not.toContain('Pat Customer')
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const approved = requireOk(
      await approveHandler(authCtx(db, sam()), decisionArgs(proposalId, 'approve', { consequenceAccepted: true }))
    )

    expect(approved.reconstruction).toMatchObject({
      readbackStatus: 'receipt_recorded',
      gatewayAdmission: { status: 'consumed' },
      receipt: { providerBoundary: 'source_owned_follow_up_outbox' },
      privateEvidenceRefs: [expect.objectContaining({ accessPolicy: 'owner_admin_operator_only' })],
    })
    expect(db.dump('protectedActionOwnerDecisions')).toHaveLength(1)
    expect(db.dump('protectedActionGatewayAdmissions')).toHaveLength(1)
    expect(db.dump('protectedActionAttempts')).toHaveLength(1)
    expect(db.dump('protectedActionReceipts')).toHaveLength(1)
    expect(db.dump('protectedActionPrivateEvidenceRefs')).toHaveLength(1)
    expect(db.dump('auditEvents').map((row) => row.eventType)).toEqual(
      expect.arrayContaining([
        'protected_action.proposed',
        'protected_action.policy_evaluated',
        'protected_action.approved',
        'protected_action.gateway_admitted',
        'protected_action.gateway_consumed',
        'protected_action.receipt_recorded',
      ])
    )
    expect(JSON.stringify(db.dump('auditEvents'))).not.toContain('customer@example.test')
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const alexArgs = proposeArgs('alex-unrelated')
    alexArgs.businessId = 'businesses:2'
    delete alexArgs.serviceId
    const alexProposed = requireOk(await proposeHandler(authCtx(db, alex()), alexArgs))
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const queue = await listHandler(authCtx(db, sam()), {})
    expect(queue).toMatchObject({
      kind: 'allowed',
      queue: [
        expect.objectContaining({
          proposal: expect.objectContaining({ id: proposalId, selectedActionSlug: 'contact-follow-up' }),
        }),
      ],
    })
    expect(JSON.stringify(queue)).not.toContain(alexProposed.reconstruction.proposal.id)
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const adminReadback = await adminHandler(authCtx(db, admin()), { proposalId })
    expect(adminReadback).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ readbackStatus: 'receipt_recorded' })],
    })
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const missingAdminReadback = await adminHandler(authCtx(db, admin()), { proposalId: 'contact-follow-up:missing-convex-row' })
    expect(missingAdminReadback).toMatchObject({ kind: 'allowed', rows: [] })
    expectNoProtectedActionBareScans(db)
  })

  it('persists owner rejection without creating gateway or attempt rows', async () => {
    const db = seededProtectedActionDb()
    const proposed = requireOk(await proposeHandler(authCtx(db, sam()), proposeArgs('reject')))
    const proposalId = proposed.reconstruction.proposal.id

    const rejected = requireOk(
      await rejectHandler(authCtx(db, sam()), decisionArgs(proposalId, 'reject', { reason: 'Owner declined this follow-up.' }))
    )

    expect(rejected.reconstruction).toMatchObject({ readbackStatus: 'owner_rejected' })
    expect(db.dump('protectedActionOwnerDecisions')).toHaveLength(1)
    expect(db.dump('protectedActionGatewayAdmissions')).toHaveLength(0)
    expect(db.dump('protectedActionAttempts')).toHaveLength(0)
    expect(db.dump('protectedActionReceipts')).toHaveLength(0)
    expectNoProtectedActionBareScans(db)
  })

  it('rejects concurrent owner decisions without duplicate durable effects', async () => {
    const db = seededProtectedActionDb()
    const proposed = requireOk(await proposeHandler(authCtx(db, sam()), proposeArgs('race')))
    const proposalId = proposed.reconstruction.proposal.id
    const approved = requireOk(
      await approveHandler(authCtx(db, sam()), decisionArgs(proposalId, 'race-approve', { consequenceAccepted: true }))
    )

    const concurrentReject = await rejectHandler(
      authCtx(db, sam()),
      decisionArgs(proposalId, 'race-reject', { reason: 'Concurrent rejection should not replace approval.' })
    )

    expect(approved.reconstruction).toMatchObject({ readbackStatus: 'receipt_recorded' })
    expect(concurrentReject).toMatchObject({
      kind: 'error',
      code: 'contact_follow_up_idempotency_conflict',
      reason: 'proposal_already_decided',
    })
    expect(db.dump('protectedActionOwnerDecisions')).toHaveLength(1)
    expect(db.dump('protectedActionGatewayAdmissions')).toHaveLength(1)
    expect(db.dump('protectedActionAttempts')).toHaveLength(1)
    expect(db.dump('protectedActionReceipts')).toHaveLength(1)
  })

  it('returns typed denial for missing auth and records no-repair source state', async () => {
    const db = seededProtectedActionDb()
    const denied = await listHandler(authCtx(db, null), {})
    expect(denied).toMatchObject({ kind: 'denied', reason: 'missing_auth' })

    const proposed = requireOk(await proposeHandler(authCtx(db, sam()), proposeArgs('no-repair')))
    const proposalId = proposed.reconstruction.proposal.id
    await approveHandler(authCtx(db, sam()), decisionArgs(proposalId, 'no-repair-approve', { consequenceAccepted: true }))
    const attemptId = String(db.dump('protectedActionAttempts')[0]?.attemptId)

    db.clearReadLog()
    const noRepair = requireOk(
      await noRepairHandler(authCtx(db, sam()), {
        ...decisionArgs(proposalId, 'no-repair', { reason: 'No source evidence remains to repair.' }),
        attemptId,
      })
    )
    expect(noRepair.reconstruction).toMatchObject({ readbackStatus: 'no_repair' })
    expect(db.dump('protectedActionNoRepairRecords')).toHaveLength(1)
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const retry = await retryHandler(authCtx(db, sam()), retryArgs(proposalId, 'not-retryable'))
    expect(retry).toMatchObject({ kind: 'error', code: 'contact_follow_up_retry_exhausted' })
    expect(db.dump('auditEvents').map((row) => row.eventType)).toContain('protected_action.retry_exhausted')

    const adminReadback = await adminHandler(authCtx(db, admin()), { proposalId })
    expect(adminReadback).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ readbackStatus: 'no_repair', repairAction: 'none' })],
    })
    expectNoProtectedActionBareScans(db)
  })

  it('persists durable retry exhaustion after bounded retry attempts', async () => {
    const db = seededProtectedActionDb()
    const proposalId = await seedRetryableProofGapProposal(db, 'retry-exhausted')

    db.clearReadLog()
    const finalAllowedRetry = requireOk(
      await retryHandler(authCtx(db, sam()), retryArgs(proposalId, 'retry-exhausted-final-gap', 'proof_gap'))
    )
    expect(finalAllowedRetry.reconstruction).toMatchObject({
      readbackStatus: 'retry_exhausted',
      repairAction: 'operator_review_required',
    })
    expect(db.dump('protectedActionAttempts')).toHaveLength(ContactFollowUpMaxAttemptCount)
    expectNoProtectedActionBareScans(db)

    db.clearReadLog()
    const exhaustedRetry = await retryHandler(
      authCtx(db, sam()),
      retryArgs(proposalId, 'retry-exhausted-after-max', 'proof_gap')
    )
    expect(exhaustedRetry).toMatchObject({ kind: 'error', code: 'contact_follow_up_retry_exhausted' })
    expect(db.dump('auditEvents').map((row) => row.eventType)).toContain('protected_action.retry_exhausted')

    const adminReadback = await adminHandler(authCtx(db, admin()), { proposalId })
    expect(adminReadback).toMatchObject({
      kind: 'allowed',
      rows: [expect.objectContaining({ readbackStatus: 'retry_exhausted', repairAction: 'operator_review_required' })],
    })
    expectNoProtectedActionBareScans(db)
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
    this.reads.push({ tableName: this.tableName, ...(this.indexName === undefined ? {} : { indexName: this.indexName }) })
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
  private readonly tables = new Map<string, Row[]>()
  private readonly queryReads: QueryRead[] = []

  constructor(seed: Record<string, Array<Record<string, unknown> & { _id: string }>>) {
    for (const [tableName, rows] of Object.entries(seed)) {
      this.tables.set(
        tableName,
        rows.map((row, index) => ({ _creationTime: index + 1, ...row }))
      )
    }
  }

  query(tableName: string): Query {
    return new FakeQuery(tableName, this.table(tableName), this.queryReads)
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) {
        return row
      }
    }
    return null
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
      if (index >= 0) {
        const existing = rows[index]
        if (existing !== undefined) {
          rows[index] = { ...existing, ...value }
        }
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

function expectNoProtectedActionBareScans(db: FakeDb): void {
  const bareScans = db.reads().filter(
    (read) =>
      read.indexName === undefined &&
      (read.tableName === 'auditEvents' ||
        read.tableName === 'operationKeys' ||
        (read.tableName.startsWith('protectedAction') && read.tableName !== 'protectedActionProposals'))
  )
  expect(bareScans).toEqual([])
}

function seededProtectedActionDb(): FakeDb {
  return new FakeDb({
    owners: [
      { _id: 'owners:1', clerkUserId: 'user_sam', createdAt: 1, updatedAt: 1 },
      { _id: 'owners:2', clerkUserId: 'user_alex', createdAt: 1, updatedAt: 1 },
    ],
    businesses: [
      {
        _id: 'businesses:1',
        ownerId: 'owners:1',
        slug: 'sam-plumbing',
        name: 'Sam Plumbing',
        normalizedName: 'sam plumbing',
        category: 'Plumbing',
        suburb: 'Parramatta',
        stateTerritory: 'NSW',
        publicStatus: 'published',
        trustTier: 'contact_confirmed',
        claimStatus: 'published',
        sourceHash: 'hash:business',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: 'businesses:2',
        ownerId: 'owners:2',
        slug: 'alex-electrical',
        name: 'Alex Electrical',
        normalizedName: 'alex electrical',
        category: 'Electrical',
        suburb: 'Perth',
        stateTerritory: 'WA',
        publicStatus: 'published',
        trustTier: 'contact_confirmed',
        claimStatus: 'published',
        sourceHash: 'hash:business-2',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    businessServices: [{ _id: 'services:1', businessId: 'businesses:1', status: 'published' }],
    adminMemberships: [
      {
        _id: 'adminMemberships:1',
        clerkUserId: 'user_admin',
        role: 'owner_admin',
        state: 'active',
        grantedBy: 'system',
        grantedAt: 1,
      },
    ],
  })
}

function authCtx(db: Db, identity: UserIdentity | null): AuthCtx {
  return {
    db,
    auth: { getUserIdentity: async () => identity },
  }
}

function sam(): UserIdentity {
  return identity('user_sam')
}

function alex(): UserIdentity {
  return identity('user_alex')
}

function admin(): UserIdentity {
  return identity('user_admin')
}

function identity(subject: string): UserIdentity {
  return {
    subject,
    tokenIdentifier: `token:${subject}`,
    issuer: 'https://clerk.test',
  } as UserIdentity
}

function proposeArgs(suffix: string): ProposeArgs {
  return {
    businessId: 'businesses:1',
    serviceId: 'services:1',
    sourceEvidenceRef: `source-message:${suffix}`,
    parameters: {
      contactName: 'Pat Customer',
      contactChannel: 'email',
      messageSummary: `Follow up about ${suffix}.`,
      sourceMessageRef: `source-message:${suffix}`,
    },
    deadlineAt: Date.now() + 60_000,
    ...csrf(),
    operationKey: `contact-follow-up:proposal:${suffix}`,
    correlationId: `correlation:contact-follow-up:proposal:${suffix}`,
  }
}

function decisionArgs(
  proposalId: string,
  suffix: string,
  overrides: Partial<DecisionArgs> = {}
): DecisionArgs {
  return {
    proposalId,
    reason: `Owner reviewed ${suffix}.`,
    evidenceRefs: [`owner-review:${suffix}`],
    consequenceAccepted: false,
    ...csrf(),
    operationKey: `contact-follow-up:decision:${suffix}`,
    correlationId: `correlation:contact-follow-up:decision:${suffix}`,
    ...overrides,
  }
}

function retryArgs(proposalId: string, suffix: string, readbackKind: RetryArgs['readbackKind'] = 'receipt'): RetryArgs {
  return {
    proposalId,
    readbackKind,
    reason: `Retry reviewed ${suffix}.`,
    ...csrf(),
    operationKey: `contact-follow-up:retry:${suffix}`,
    correlationId: `correlation:contact-follow-up:retry:${suffix}`,
  }
}

async function seedRetryableProofGapProposal(db: Db, suffix: string): Promise<string> {
  const args = proposeArgs(suffix)
  const now = Date.now()
  const authority = {
    ownerId: brandNonEmpty('owners:1', 'OwnerId'),
    actorRef: 'user_sam',
    businessIds: [brandNonEmpty('businesses:1', 'BusinessId')],
  }
  const proposed = requireDomainOk(
    proposeContactFollowUpRequest(createEmptyContactFollowUpSourceState(), {
      authority,
      selectedActionSlug: ContactFollowUpActionSlug,
      target: {
        businessId: brandNonEmpty(args.businessId, 'BusinessId'),
        ownerId: authority.ownerId,
        ...(args.serviceId === undefined ? {} : { serviceId: brandNonEmpty(args.serviceId, 'ServiceId') }),
        sourceEvidenceRef: args.sourceEvidenceRef,
      },
      parameters: args.parameters,
      idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
      correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
      deadlineAt: args.deadlineAt,
      now,
    })
  )
  const policy = requireDomainOk(evaluateContactFollowUpPolicy(proposed.state, { proposalId: proposed.proposal.id, now }))
  const approved = requireDomainOk(
    decideContactFollowUpProposal(policy.state, {
      authority,
      proposalId: proposed.proposal.id,
      decision: 'approved',
      reason: `Owner approved ${suffix}.`,
      evidenceRefs: [`owner-review:${suffix}:approve`],
      consequenceAccepted: true,
      idempotencyKey: brandNonEmpty(`contact-follow-up:decision:${suffix}:approve`, 'OperationKey'),
      correlationId: brandNonEmpty(`correlation:contact-follow-up:decision:${suffix}:approve`, 'CorrelationId'),
      now,
    })
  )
  const gateway = requireDomainOk(
    createContactFollowUpGatewayAdmission(approved.state, {
      authority,
      proposalId: proposed.proposal.id,
      idempotencyKey: brandNonEmpty(`contact-follow-up:decision:${suffix}:gateway`, 'OperationKey'),
      correlationId: brandNonEmpty(`correlation:contact-follow-up:decision:${suffix}:approve`, 'CorrelationId'),
      expiresAt: now + 5 * 60_000,
      now,
    })
  )
  const attempted = requireDomainOk(
    recordContactFollowUpProviderAttempt(gateway.state, {
      authority,
      selectedActionSlug: ContactFollowUpActionSlug,
      proposalId: proposed.proposal.id,
      gatewayAdmissionId: gateway.gatewayAdmission.id,
      idempotencyKey: brandNonEmpty(`contact-follow-up:decision:${suffix}:attempt`, 'OperationKey'),
      correlationId: brandNonEmpty(`correlation:contact-follow-up:decision:${suffix}:approve`, 'CorrelationId'),
      now,
      readback: {
        kind: 'proof_gap',
        gapReason: 'timeout',
        payloadHash: stableHash({ proposalId: proposed.proposal.id, suffix, proofGap: 1 }) as SourceHash,
      },
    })
  )

  await persistContactFollowUpSlice(db as Parameters<typeof persistContactFollowUpSlice>[0], attempted.state)
  return proposed.proposal.id
}

function csrf() {
  return {
    csrfToken: 'csrf-protected-action',
    csrfCookie: 'csrf-protected-action',
    origin: 'https://ae.example',
  }
}

function requireOk(value: unknown): { kind: 'ok'; reconstruction: { proposal: { id: string }; [key: string]: unknown } } {
  if (!isRecord(value) || value.kind !== 'ok') {
    throw new Error(`Expected ok result, received ${JSON.stringify(value)}`)
  }
  return value as { kind: 'ok'; reconstruction: { proposal: { id: string }; [key: string]: unknown } }
}

function requireDomainOk<T extends { kind: string }>(value: T): Extract<T, { kind: 'ok' }> {
  if (value.kind !== 'ok') {
    throw new Error(`Expected ok domain result, received ${JSON.stringify(value)}`)
  }
  return value as Extract<T, { kind: 'ok' }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

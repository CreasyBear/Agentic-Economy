import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import {
  createBusinessActionCapabilityRequest,
  readCurrentOwnerBusinessActionReceipt,
  recordBusinessActionOwnerCheckpoint,
  recordBusinessActionReceipt,
} from '../../../convex/businessActions'
import {
  exportBusinessActionPrivateEvidenceRefs,
  loadBusinessActionRequestSlice,
  persistBusinessActionSlice,
  tombstoneBusinessActionPrivateEvidenceRef,
} from '../../../convex/businessActionStore'
import { businessActionSourceFunctionRefs } from '../../../src/modules/business-action/business-action.functions'
import type {
  ActionReceipt,
  BusinessActionCard,
  BusinessActionNoRepairRecord,
  BusinessActionPrivateEvidenceRef,
  BusinessActionSourceState,
  BusinessActionSupportRecord,
  BuyerMandate,
} from '../../../src/modules/business-action/public'
import {
  BusinessActionSlug,
  createCapabilityRequest,
  createEmptyBusinessActionSourceState,
  recordActionReceipt,
  recordAuthorizationCheckpoint,
  recordBusinessActionResultArtifact,
  recordGuardrailDecisionEvidence,
  recordHermesEvidenceEvent,
  verifyActionReceipt,
} from '../../../src/modules/business-action/public'
import type {
  AuthorizationCheckpointId,
  BusinessActionCardId,
  BusinessActionNoRepairId,
  BusinessActionPrivateEvidenceRefId,
  BusinessActionSupportRecordId,
  BusinessId,
  BuyerMandateId,
  CapabilityRequestId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '../../../src/modules/common/ids'
import type { SourceWriteAdmission } from '../../../src/modules/security/source-write-admission'
import { withSourceWrite, withoutSourceWrite } from '../../helpers/source-write-admission'

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

type CreateRequestArgs = {
  cardId: string
  mandateId: string
  businessId: string
  requestedBy: 'buyer' | 'hermes' | 'operator'
  expiresAt: number
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}

type CheckpointArgs = {
  requestId: string
  decision: 'accepted' | 'refused' | 'clarification_required' | 'proof_gap' | 'expired'
  ownerDecisionRef: string
  reasonCode: string
  expiresAt: number
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}

type ReceiptArgs = {
  requestId: string
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}

const createRequestHandler = (createBusinessActionCapabilityRequest as unknown as {
  _handler: (ctx: AuthCtx, args: CreateRequestArgs) => Promise<unknown>
})._handler
const checkpointHandler = (recordBusinessActionOwnerCheckpoint as unknown as {
  _handler: (ctx: AuthCtx, args: CheckpointArgs) => Promise<unknown>
})._handler
const receiptHandler = (recordBusinessActionReceipt as unknown as {
  _handler: (ctx: AuthCtx, args: ReceiptArgs) => Promise<unknown>
})._handler
const ownerReceiptHandler = (readCurrentOwnerBusinessActionReceipt as unknown as {
  _handler: (ctx: AuthCtx, args: { requestId: string }) => Promise<unknown>
})._handler

const now = 6_000
const businessId = 'businesses:1' as BusinessId
const ownerId = 'owners:1' as OwnerId
const request = 'capability_request:operation:request' as CapabilityRequestId
const checkpoint =
  'authorization_checkpoint:capability_request:operation:request:operation:checkpoint' as AuthorizationCheckpointId
const privateEvidenceRefId = 'business_action_private_evidence:trace' as BusinessActionPrivateEvidenceRefId

describe('Convex business action source persistence', () => {
  it('composes business-action tables with private evidence retention/access indexes', () => {
    const exportSchema = Reflect.get(schema, 'export')
    if (typeof exportSchema !== 'function') {
      throw new Error('Convex schema export function is unavailable')
    }

    const exported = JSON.parse(String(exportSchema.call(schema))) as {
      tables: Array<{ tableName: string; indexes: Array<{ indexDescriptor: string; fields: string[] }> }>
    }
    const tableIndexes = Object.fromEntries(
      exported.tables.map((table) => [table.tableName, table.indexes.map((index) => index.indexDescriptor)])
    )

    expect(exported.tables.map((table) => table.tableName)).toEqual(
      expect.arrayContaining([
        'businessActionCards',
        'businessActionBuyerMandates',
        'businessActionCapabilityRequests',
        'businessActionAuthorizationCheckpoints',
        'businessActionGuardrailDecisionEvidence',
        'businessActionExternalEvidenceEvents',
        'businessActionResultArtifacts',
        'businessActionReceipts',
        'businessActionPrivateEvidenceRefs',
        'businessActionSupportRecords',
        'businessActionNoRepairRecords',
      ])
    )
    expect(tableIndexes.businessActionPrivateEvidenceRefs).toEqual(
      expect.arrayContaining(['by_privateEvidenceRefId', 'by_request', 'by_ttlExpiresAt'])
    )
  })

  it('persists and replays the source slice without duplicate durable rows', async () => {
    const db = new FakeDb({
      owners: [{ _id: ownerId, clerkUserId: 'user_owner' }],
      businesses: [{ _id: businessId, ownerId }],
    })
    const state = completeSourceState()

    await persistBusinessActionSlice(db, state)
    await persistBusinessActionSlice(db, state)

    expect(db.dump('businessActionCards')).toHaveLength(1)
    expect(db.dump('businessActionBuyerMandates')).toHaveLength(1)
    expect(db.dump('businessActionCapabilityRequests')).toHaveLength(1)
    expect(db.dump('businessActionAuthorizationCheckpoints')).toHaveLength(1)
    expect(db.dump('businessActionGuardrailDecisionEvidence')).toHaveLength(1)
    expect(db.dump('businessActionExternalEvidenceEvents')).toHaveLength(1)
    expect(db.dump('businessActionResultArtifacts')).toHaveLength(1)
    expect(db.dump('businessActionReceipts')).toHaveLength(1)
    expect(db.dump('businessActionPrivateEvidenceRefs')).toHaveLength(1)
    expect(db.dump('businessActionSupportRecords')).toHaveLength(1)
    expect(db.dump('businessActionNoRepairRecords')).toHaveLength(1)
    expect(db.dump('operationKeys').map((row) => row.scope)).toEqual(expect.arrayContaining(['business_action']))

    db.clearReadLog()
    const reloaded = await loadBusinessActionRequestSlice(db, request)
    expect(reloaded.requests).toHaveLength(1)
    expect(reloaded.checkpoints[0]?.decision).toBe('accepted')
    expect(reloaded.hermesEvidenceEvents).toHaveLength(1)
    expect(reloaded.receipts).toHaveLength(1)
    expectNoBusinessActionBareScans(db)

    const receipt = reloaded.receipts[0]
    if (receipt === undefined) {
      throw new Error('expected receipt')
    }
    const verification = verifyActionReceipt(reloaded, receipt)
    expect(verification.reconstructionStatus).toBe('complete')
    expect(JSON.stringify(verification.publicReadback)).not.toContain('privatePayloadRef')
    expect(JSON.stringify(verification.publicReadback)).not.toContain('private-endpoint://')
  })

  it('exports private evidence as redacted hashes and tombstones raw refs on delete', async () => {
    const db = new FakeDb({})
    await persistBusinessActionSlice(db, completeSourceState())

    const exported = await exportBusinessActionPrivateEvidenceRefs(db, request)
    expect(exported).toEqual([
      expect.objectContaining({
        id: privateEvidenceRefId,
        requestId: request,
        retentionClass: 'business_action_private_evidence',
        accessPolicy: 'owner_admin_operator_only',
        payloadHash: 'hash:private-payload',
        exportBehavior: 'redacted_hash_only',
        deleteBehavior: 'raw_private_payload_ref_tombstoned',
        tombstoneBehavior: 'lawful_audit_hashes_retained',
      }),
    ])
    expect(JSON.stringify(exported)).not.toContain('privatePayloadRef')
    expect(JSON.stringify(exported)).not.toContain('private-endpoint://')

    await tombstoneBusinessActionPrivateEvidenceRef(db, privateEvidenceRefId, now + 500)
    const reloaded = await loadBusinessActionRequestSlice(db, request)
    expect(reloaded.privateEvidenceRefs).toEqual([
      expect.objectContaining({
        id: privateEvidenceRefId,
        payloadHash: 'hash:private-payload',
        redactedAt: now + 500,
      }),
    ])
    expect(JSON.stringify(reloaded.privateEvidenceRefs)).not.toContain('private-endpoint://')
  })
})

describe('Convex business action runtime bridge', () => {
  it('rejects missing source-write admission and caller-supplied authority money provider or receipt fields', async () => {
    const db = new FakeDb({
      owners: [{ _id: ownerId, clerkUserId: 'user_owner' }],
      businesses: [{ _id: businessId, ownerId }],
    })
    await persistBusinessActionSlice(db, adapterSeedState())

    const missingAdmission = await createRequestHandler(authCtx(db, sam()), withoutSourceWrite(createRequestArgs('missing')))
    expect(missingAdmission).toMatchObject({ kind: 'error', code: 'business_action_source_write_rejected' })
    expect(db.dump('businessActionCapabilityRequests')).toHaveLength(0)

    const forgedFields = await createRequestHandler(authCtx(db, sam()), {
      ...createRequestArgs('forged'),
      ownerId,
      adminId: 'admin:forged',
      amountCents: 1,
      currency: 'usd',
      providerId: 'stripe-session-forged',
      receiptStatus: 'success',
      checkpointResult: 'accepted',
    } as CreateRequestArgs)

    expect(forgedFields).toMatchObject({
      kind: 'error',
      code: 'business_action_untrusted_client_field',
    })
    expect(db.dump('businessActionCapabilityRequests')).toHaveLength(0)
  })

  it('derives owner authority server-side for checkpoints and redacted owner receipt readbacks', async () => {
    const db = new FakeDb({
      owners: [
        { _id: ownerId, clerkUserId: 'user_owner' },
        { _id: 'owners:2', clerkUserId: 'user_other' },
      ],
      businesses: [{ _id: businessId, ownerId }],
    })
    await persistBusinessActionSlice(db, adapterSeedState())

    const created = requireRuntimeOk(await createRequestHandler(authCtx(db, sam()), createRequestArgs('accepted')))
    const requestId = created.request.id

    const wrongOwner = await checkpointHandler(authCtx(db, otherOwner()), checkpointArgs(requestId, 'wrong-owner'))
    expect(wrongOwner).toMatchObject({ kind: 'error', code: 'business_action_owner_denied' })
    expect(db.dump('businessActionAuthorizationCheckpoints')).toHaveLength(0)

    const forgedCheckpoint = await checkpointHandler(authCtx(db, sam()), {
      ...checkpointArgs(requestId, 'forged-checkpoint'),
      ownerId: 'owners:2',
      provider: 'hermes',
      checkpointHash: 'hash:forged',
      requestHash: 'hash:forged-request',
    } as CheckpointArgs)
    expect(forgedCheckpoint).toMatchObject({ kind: 'error', code: 'business_action_untrusted_client_field' })

    const accepted = requireRuntimeOk(await checkpointHandler(authCtx(db, sam()), checkpointArgs(requestId, 'accepted')))
    expect(accepted.checkpoint).toMatchObject({ decision: 'accepted', ownerId })
    expect(db.dump('businessActionAuthorizationCheckpoints')).toHaveLength(1)

    const receipt = requireRuntimeOk(await receiptHandler(authCtx(db, sam()), receiptArgs(requestId, 'receipt')))
    expect(receipt.publicReadback.labels).toEqual(['source/local proof only', 'production proof not claimed'])
    expect(JSON.stringify(receipt.publicReadback)).not.toContain('private-endpoint://')

    const ownerReadback = requireRuntimeOk(await ownerReceiptHandler(authCtx(db, sam()), { requestId }))
    expect(ownerReadback.publicReadback).toMatchObject({ receiptId: receipt.receipt.id })
    expect(JSON.stringify(ownerReadback)).not.toContain('privatePayloadRef')
  })

  it('exposes server function refs without importing business-action internals into routes', () => {
    expect(Object.keys(businessActionSourceFunctionRefs).sort()).toEqual([
      'createCapabilityRequest',
      'readCurrentOwnerReceipt',
      'recordOwnerCheckpoint',
      'recordReceipt',
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
    private readonly indexName?: string
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.tableName, this.rows, this.reads, [...this.filters, ...builder.filters], indexName)
  }

  async collect(): Promise<Row[]> {
    this.reads.push({
      tableName: this.tableName,
      ...(this.indexName === undefined ? {} : { indexName: this.indexName }),
    })
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  async unique(): Promise<Row | null> {
    return (await this.collect()).at(0) ?? null
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

function completeSourceState(): BusinessActionSourceState {
  const created = createCapabilityRequest(createEmptyBusinessActionSourceState({ cards: [card()], mandates: [mandate()] }), {
    actionSlug: BusinessActionSlug,
    cardId: card().id as BusinessActionCardId,
    mandateId: mandate().id,
    businessId,
    amountCents: 4_500,
    currency: 'aud',
    requestedBy: 'hermes',
    idempotencyKey: 'operation:request' as OperationKey,
    correlationId: 'correlation:request' as CorrelationId,
    now,
    expiresAt: now + 1_000,
  })
  const guarded = requireOk(recordGuardrailDecisionEvidence(requireOk(created).state, guardrailCommand()))
  const accepted = requireOk(recordAuthorizationCheckpoint(guarded.state, checkpointCommand()))
  const hermes = requireOk(recordHermesEvidenceEvent(accepted.state, hermesCommand()))
  const artifact = requireOk(recordBusinessActionResultArtifact(hermes.state, artifactCommand()))
  const receipted = requireOk(recordActionReceipt(artifact.state, receiptCommand()))

  return {
    ...receipted.state,
    privateEvidenceRefs: [privateEvidenceRef()],
    supportRecords: [supportRecord()],
    noRepairRecords: [noRepairRecord()],
  }
}

function card(overrides: Partial<BusinessActionCard> = {}): BusinessActionCard {
  return {
    id: 'business_action_card:paid-intake' as BusinessActionCardId,
    actionSlug: BusinessActionSlug,
    version: 1,
    ownerId,
    sourceHash: 'hash:card' as SourceHash,
    status: 'active',
    publicLabel: 'Provision paid intake endpoint',
    posture: 'proposal_only',
    callable: false,
    paymentRequired: false,
    ownerApprovalRequired: true,
    receiptRequired: true,
    updatedAt: now - 10,
    ...overrides,
  }
}

function mandate(overrides: Partial<BuyerMandate> = {}): BuyerMandate {
  return {
    id: 'buyer_mandate:paid-intake' as BuyerMandateId,
    buyerRef: 'buyer:hash',
    allowedBusinessId: businessId,
    allowedActionSlug: BusinessActionSlug,
    maxAmountCents: 5_000,
    currency: 'aud',
    status: 'active',
    mandateHash: 'hash:mandate' as SourceHash,
    idempotencyKey: 'operation:mandate' as OperationKey,
    correlationId: 'correlation:mandate' as CorrelationId,
    createdAt: now - 100,
    expiresAt: now + 2_000,
    ...overrides,
  }
}

function guardrailCommand(overrides: Partial<Parameters<typeof recordGuardrailDecisionEvidence>[1]> = {}) {
  return {
    requestId: request,
    provider: 'nemo_guardrails',
    modelName: 'nemotron',
    modelVersion: 'local-test',
    decision: 'allow',
    policyHash: 'hash:policy' as SourceHash,
    privateTraceRefHash: 'hash:trace' as SourceHash,
    payloadHash: 'hash:guardrail' as SourceHash,
    idempotencyKey: 'operation:guardrail' as OperationKey,
    correlationId: 'correlation:guardrail' as CorrelationId,
    recordedAt: now + 5,
    ...overrides,
  } as const
}

function checkpointCommand(overrides: Partial<Parameters<typeof recordAuthorizationCheckpoint>[1]> = {}) {
  return {
    requestId: request,
    decision: 'accepted',
    authority: {
      ownerId,
      actorRef: 'user_owner',
      businessIds: [businessId],
      status: 'active',
    },
    ownerDecisionRef: 'owner-decision:approval',
    reasonCode: 'owner_approved',
    idempotencyKey: 'operation:checkpoint' as OperationKey,
    correlationId: 'correlation:checkpoint' as CorrelationId,
    now: now + 10,
    expiresAt: now + 900,
    ...overrides,
  } as const
}

function hermesCommand(overrides: Partial<Parameters<typeof recordHermesEvidenceEvent>[1]> = {}) {
  return {
    requestId: request,
    checkpointId: checkpoint,
    evidenceKind: 'execute',
    providerRefHash: 'hash:hermes-ref' as SourceHash,
    payloadHash: 'hash:hermes' as SourceHash,
    idempotencyKey: 'operation:hermes' as OperationKey,
    correlationId: 'correlation:hermes' as CorrelationId,
    receivedAt: now + 20,
    ...overrides,
  } as const
}

function artifactCommand(overrides: Partial<Parameters<typeof recordBusinessActionResultArtifact>[1]> = {}) {
  return {
    requestId: request,
    checkpointId: checkpoint,
    endpointDescriptorHash: 'hash:endpoint-descriptor' as SourceHash,
    jsonSchemaHash: 'hash:json-schema' as SourceHash,
    privateEndpointProvisioningPaymentGateRefHash: 'hash:private-artifact' as SourceHash,
    supportingEvidenceLabels: ['hermes_execute'],
    idempotencyKey: 'operation:artifact' as OperationKey,
    correlationId: 'correlation:artifact' as CorrelationId,
    recordedAt: now + 30,
    ...overrides,
  } as const
}

function receiptCommand(overrides: Partial<Parameters<typeof recordActionReceipt>[1]> = {}) {
  return {
    requestId: request,
    idempotencyKey: 'operation:receipt' as OperationKey,
    correlationId: 'correlation:receipt' as CorrelationId,
    recordedAt: now + 40,
    ...overrides,
  } as const
}

function createRequestArgs(suffix: string): CreateRequestArgs {
  return withSourceWrite('protected_action', {
    cardId: card().id,
    mandateId: mandate().id,
    businessId,
    requestedBy: 'hermes',
    expiresAt: Date.now() + 60_000,
    operationKey: `business-action:request:${suffix}`,
    correlationId: `correlation:business-action:request:${suffix}`,
  })
}

function checkpointArgs(requestId: string, suffix: string, decision: CheckpointArgs['decision'] = 'accepted'): CheckpointArgs {
  return withSourceWrite('protected_action', {
    requestId,
    decision,
    ownerDecisionRef: `owner-decision:${suffix}`,
    reasonCode: `owner_reviewed_${suffix}`,
    expiresAt: Date.now() + 60_000,
    operationKey: `business-action:checkpoint:${suffix}`,
    correlationId: `correlation:business-action:checkpoint:${suffix}`,
  })
}

function receiptArgs(requestId: string, suffix: string): ReceiptArgs {
  return withSourceWrite('protected_action', {
    requestId,
    operationKey: `business-action:receipt:${suffix}`,
    correlationId: `correlation:business-action:receipt:${suffix}`,
  })
}

function authCtx(db: Db, identity: UserIdentity | null): AuthCtx {
  return {
    db,
    auth: { getUserIdentity: async () => identity },
  }
}

function sam(): UserIdentity {
  return identity('user_owner')
}

function otherOwner(): UserIdentity {
  return identity('user_other')
}

function identity(subject: string): UserIdentity {
  return {
    subject,
    tokenIdentifier: `token:${subject}`,
    issuer: 'https://clerk.test',
  } as UserIdentity
}

function adapterSeedState(): BusinessActionSourceState {
  return createEmptyBusinessActionSourceState({
    cards: [card()],
    mandates: [mandate({ expiresAt: Date.now() + 120_000 })],
  })
}

function privateEvidenceRef(): BusinessActionPrivateEvidenceRef {
  return {
    id: privateEvidenceRefId,
    requestId: request,
    retentionClass: 'business_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: 'hash:private-payload' as SourceHash,
    privatePayloadRef: 'private-endpoint://trace/paid-intake',
    ttlExpiresAt: now + 86_400_000,
  }
}

function supportRecord(): BusinessActionSupportRecord {
  return {
    id: 'business_action_support:paid-intake' as BusinessActionSupportRecordId,
    actionSlug: BusinessActionSlug,
    businessId,
    status: 'open',
    reason: 'hackathon source-local support record',
    evidenceRefs: ['support:phase6'],
    claimDisablePath: 'business_actions_enabled',
    operatorNextAction: 'operator_review_required',
    sourceHash: 'hash:support' as SourceHash,
    correlationId: 'correlation:support' as CorrelationId,
    createdAt: now,
    updatedAt: now,
  }
}

function noRepairRecord(): BusinessActionNoRepairRecord {
  return {
    id: 'business_action_no_repair:paid-intake' as BusinessActionNoRepairId,
    requestId: request,
    reason: 'No private endpoint artifact can be reconstructed.',
    evidenceRefs: ['private-evidence:trace'],
    noRepairHash: 'hash:no-repair' as SourceHash,
    idempotencyKey: 'operation:no-repair' as OperationKey,
    correlationId: 'correlation:no-repair' as CorrelationId,
    markedBy: 'operator:phase6',
    markedAt: now + 50,
  }
}

function expectNoBusinessActionBareScans(db: FakeDb): void {
  const bareScans = db.reads().filter((read) => read.tableName.startsWith('businessAction') && read.indexName === undefined)
  expect(bareScans).toEqual([])
}

function requireOk<T extends { kind: string }>(value: T): Extract<T, { kind: 'ok' }> {
  if (value.kind !== 'ok') {
    throw new Error(`Expected ok result, received ${JSON.stringify(value)}`)
  }
  return value as Extract<T, { kind: 'ok' }>
}

function requireRuntimeOk(value: unknown): {
  kind: 'ok'
  request: { id: string }
  checkpoint: { id: string; decision: string; ownerId?: string }
  receipt: { id: string }
  publicReadback: { receiptId: string; labels: string[] }
} {
  if (typeof value !== 'object' || value === null || !('kind' in value) || value.kind !== 'ok') {
    throw new Error(`Expected runtime ok result, received ${JSON.stringify(value)}`)
  }
  return value as ReturnType<typeof requireRuntimeOk>
}

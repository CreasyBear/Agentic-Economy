import { RateLimiter } from '@convex-dev/rate-limiter'
import { describe, expect, it, vi } from 'vitest'

import { completeWork } from '../../../convex/capabilityOperationInvocations'
import { recordQualifiedUse } from '../../../convex/qualifiedUse'
import {
  authorizeInvocationCharge,
  readOperatorAccountVersion,
  markChargeOutcomeUnknown,
  reconcileInvocationCharge,
  reverseDisputedQualifiedUse,
} from '../../../convex/moneyLedger'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
} from '@/modules/money/public'
import { LIVE_MONEY_GATE_POLICY } from '@/modules/money/internal/live-money-gate'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  gte: (field: string, value: unknown) => QueryBuilder
  lt: (field: string, value: unknown) => QueryBuilder
}
type Query = {
  withIndex: (
    name: string,
    build: (query: QueryBuilder) => QueryBuilder,
  ) => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  seed(table: string, row: Row): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), row])
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  remove(table: string, predicate: (row: Row) => boolean): void {
    this.tables.set(
      table,
      (this.tables.get(table) ?? []).filter((row) => !predicate(row)),
    )
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const matches = () =>
      (this.tables.get(table) ?? []).filter((row) =>
        filters.every((filter) => filter(row)),
      )
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
          gte: (field, value) => {
            filters.push((row) =>
              typeof row[field] === 'number' &&
              typeof value === 'number' &&
              row[field] >= value,
            )
            return builder
          },
          lt: (field, value) => {
            filters.push((row) =>
              typeof row[field] === 'number' &&
              typeof value === 'number' &&
              row[field] < value,
            )
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const rows = matches()
        if (rows.length > 1) throw new Error('expected_unique')
        return rows[0] ?? null
      },
      take: async (limit) => matches().slice(0, limit),
    }
    return query
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    this.seed(table, { ...value, _id: id })
    return id
  }
  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
  }

  async patch(
    idOrTable: string,
    valueOrId: Record<string, unknown> | string,
    maybeValue?: Record<string, unknown>,
  ): Promise<void> {
    const id = maybeValue === undefined ? idOrTable : valueOrId
    const value = maybeValue === undefined ? valueOrId : maybeValue
    if (typeof id !== 'string' || typeof value !== 'object' || value === null)
      throw new Error('invalid_patch')
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row === undefined) continue
      for (const [key, next] of Object.entries(value)) {
        if (next === undefined) delete row[key]
        else row[key] = next
      }
      return
    }
    throw new Error(`missing_row:${id}`)
  }
}

type HandlerContext = {
  db: MemoryDb
  auth?: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
}
type Handler = (
  ctx: HandlerContext,
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }
const authorizeExport = authorizeInvocationCharge as unknown as HandlerExport
const reconcileExport = reconcileInvocationCharge as unknown as HandlerExport
const markerExport = markChargeOutcomeUnknown as unknown as HandlerExport
const disputeExport = reverseDisputedQualifiedUse as unknown as HandlerExport
const qualifiedUseExport = recordQualifiedUse as unknown as HandlerExport
const completionExport = completeWork as unknown as HandlerExport
const accountVersionExport = readOperatorAccountVersion as unknown as HandlerExport
const authorizeHandler = authorizeExport._handler
const markerHandler = markerExport._handler
const accountVersionHandler = accountVersionExport._handler
const reconcileHandler = reconcileExport._handler
const disputeHandler = disputeExport._handler
const qualifiedUseHandler = qualifiedUseExport._handler
const completionHandler = completionExport._handler
const invocationRef = 'operation-invocation:test-money'
const principalId = 'principal:test-money'
const ownerId = 'owner:test-money'
const credentialId = 'credential:test-money'
const attemptRef = `operation-attempt:${invocationRef}:1`
const transactionRef = `operation-money:${invocationRef}:${attemptRef}:1`
const refundTransactionRef = `operation-money-refund:${invocationRef}:${attemptRef}:1`
const input = { symbol: 'BTC', convert: 'USD' }
const inputDigest = canonicalDigest(input)
const sourceDigest = 'sha256:source-money'
const now = 1_000

function reconciliationArgs(
  outcome: 'not_released' | 'released' = 'not_released',
  identity: Readonly<{
    invocationRef: string
    attemptRef: string
    transactionRef: string
  }> = { invocationRef, attemptRef, transactionRef },
): Record<string, unknown> {
  const nextRefundTransactionRef =
    `operation-money-refund:${identity.invocationRef}:${identity.attemptRef}:1`
  return {
    invocationRef: identity.invocationRef,
    principalId,
    credentialId,
    attemptRef: identity.attemptRef,
    transactionRef: identity.transactionRef,
    inputDigest,
    outcome,
    refundTransactionRef: nextRefundTransactionRef,
    refundIdempotencyKey: nextRefundTransactionRef,
    refundInputDigest: canonicalDigest({
      format: 'operation-money-refund:v1',
      invocationRef: identity.invocationRef,
      attemptRef: identity.attemptRef,
      inputDigest,
      transactionRef: identity.transactionRef,
      outcome,
    }),
    sourceDigest,
    evidenceRefs: ['operation-money-reconciliation:sha256:evidence-money'],
    observedAt: now,
  }
}

function seedInvocation(db: MemoryDb): void {
  db.seed('capabilityOperationInvocations', {
    _id: 'invocation:money',
    invocationRef,
    principalId,
    ownerId: 'owner:test-money',
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    state: 'pending',
    operationRef: 'operation:money',
    idempotencyKey: 'idempotency:money',
    inputDigest,
    requestDigest: 'sha256:request-money',
    grantRef: 'grant:money',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    grantExpiresAt: now + 60_000,
    createdAt: now,
    updatedAt: now,
  })
}

function seedBudget(db: MemoryDb): void {
  const base = {
    principalId,
    credentialId,
    budgetPolicyRef: 'budget:test-money',
    environment: 'sandbox',
    generation: 1,
    currency: 'USD',
    exponent: 2,
    settledUnits: '0',
    reservedUnits: '100',
    reservedCount: 0,
    version: 1,
    updatedAt: now,
  }
  db.seed('moneyCredentialBudgetStates', {
    ...base,
    _id: 'budget:day',
    windowKind: 'day',
    windowStart: '1970-01-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...base,
    _id: 'budget:month',
    windowKind: 'month',
    windowStart: '1970-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...base,
    _id: 'budget:concurrency',
    windowKind: 'concurrency',
    windowStart: 'all',
    reservedUnits: '0',
    reservedCount: 1,
  })
}
const authorizationAmount = { currency: 'USD', units: '0', exponent: 2 }
const authorizationMaximumSpend = { currency: 'USD', units: '0', exponent: 2 }
const authorizationPriceDigest = canonicalDigest({
  version: 'pricing:v2',
  unit: 'call',
  paidAmount: authorizationAmount,
})
const authorizationOperation: PublishedOperation = (() => {
  const original = buildDevelopmentPublishedOperationEvidence().operation
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: authorizationAmount,
  }
  const identity = {
    ...original.identity,
    businessId: 'business:money',
    offeringId: 'offering:money',
    price: { kind: 'fixed' as const, amount: authorizationAmount },
    priceDigest: authorizationPriceDigest,
    pricingConfig,
  }
  return {
    ...original,
    operationId: 'operation:money',
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest: authorizationPriceDigest,
    pricingConfig,
    offering: {
      ...original.offering,
      businessId: 'business:money',
      offeringId: 'offering:money',
      presentation: {
        ...original.offering.presentation,
        price: { kind: 'fixed' as const, amount: authorizationAmount },
      },
    },
    readiness: {
      ...original.readiness,
      evidenceRefs: ['evidence:money'],
    },
  } as PublishedOperation
})()
const authorizationOperationRef = createPublicOperationRef({
  operationId: authorizationOperation.operationId,
  publicationRef: authorizationOperation.identity.publicationRef,
  publicationRevision: authorizationOperation.identity.publicationRevision,
  contractRef: authorizationOperation.contract.ref,
})
const authorizationDescriptor = materializeRuntimePublishedOperation(
  authorizationOperation,
)
const authorizationBasis = {
  kind: 'approve_each' as const,
  authorityRef: 'authority:money',
}
const authorizationExpiresAt = new Date(now + 60_000).toISOString()
const authorizationAuthorityMaterial = {
  format: 'operation-invoke-authority:v1' as const,
  invocationRef,
  operationRef: authorizationOperationRef,
  inputDigest,
  grantRef: 'grant:money',
  grantGeneration: 1,
  grantDigest: 'sha256:policy-money',
  reference: authorizationBasis.authorityRef,
  targetDigest: canonicalDigest(authorizationOperation.identity as never),
  consequence: authorizationDescriptor.consequenceClass,
  limits: { amount: authorizationAmount },
  expiresAt: authorizationExpiresAt,
  acceptedBasis: authorizationBasis,
}
const authorizationAuthority = {
  ...authorizationAuthorityMaterial,
  decisionDigest: canonicalDigest(authorizationAuthorityMaterial as never),
}

function seedAuthorizationFixture(db: MemoryDb): void {
  db.seed('capabilityOperationInvocations', {
    _id: 'authorization:invocation',
    invocationRef,
    principalId,
    ownerId: 'owner:test-money',
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    state: 'pending',
    operationRef: authorizationOperationRef,
    idempotencyKey: 'idempotency:money',
    inputDigest,
    requestDigest: canonicalDigest({
      operationRef: authorizationOperationRef,
      input,
    } as never),
    grantRef: 'grant:money',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    grantExpiresAt: now + 60_000,
    operationJson: JSON.stringify(authorizationOperation),
    inputJson: JSON.stringify(input),
    authority: authorizationAuthority,
    attemptRef,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('agentAccessPrincipals', {
    _id: 'authorization:principal',
    principalId,
    ownerId: 'owner:test-money',
    credentialId,
    applicationRef: 'application:test-money',
    environment: 'sandbox',
    scopes: ['market.operations.invoke'],
    authorityMode: 'approve_each',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-money',
    lifecycle: 'active',
    expiresAt: now + 60_000,
    recordedAt: now,
    lastSeenAt: now,
  })
  db.seed('capabilityOfferings', {
    _id: 'offering:money',
    offeringId: 'offering:money',
    businessId: 'business:money',
    status: 'active',
    presentation: { price: { kind: 'fixed', amount: authorizationAmount } },
  })
  db.seed('agentAccessGrants', {
    _id: 'grant:money',
    grantRef: 'grant:money',
    principalId,
    ownerId: 'owner:test-money',
    applicationRef: 'application:test-money',
    credentialId,
    lifecycle: 'active',
    environment: 'sandbox',
    authorityMode: 'approve_each',
    generation: 1,
    policyDigest: 'sha256:policy-money',
    budgetPolicyRef: 'budget:test-money',
    expiresAt: now + 60_000,
    policy: {
      format: 'ae.agent-access-policy:v1',
      operationAccess: 'all_admitted',
      rate: {
        ratePolicyRef: 'rate:test-money',
        generation: 1,
        maximumCallsPerMinute: 10,
        maximumCallsPerHour: 100,
      },
      budget: {
        budgetPolicyRef: 'budget:test-money',
        currency: 'USD',
        exponent: 2,
        generation: 1,
        maximumSpendPerInvocation: authorizationMaximumSpend,
        maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
        maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
        maximumConcurrentInvocations: 2,
      },
    },
  })
  const leaseOwner = `operation-worker:${invocationRef}`
  const canonicalAuthorityBinding = {
    reference: authorizationAuthority.reference,
    invocationRef,
    actor: { callerRef: credentialId, principalRef: principalId },
    origin: { kind: 'standalone' as const, callerRef: credentialId, principalRef: principalId },
    invocationVersion: 1,
    actionId: authorizationOperation.operationId,
    contractVersion: authorizationDescriptor.version,
    digest: authorizationAuthority.decisionDigest,
    targetDigest: authorizationAuthority.targetDigest,
    consequence: authorizationAuthority.consequence,
    limits: authorizationAuthority.limits,
    expiresAt: authorizationAuthority.expiresAt,
    acceptedBasis: authorizationBasis,
  }
  db.seed('actionInvocationControls', {
    _id: 'authorization:control',
    invocationRef,
    invocationVersion: 1,
    sourceRef: `operation-invocation-source:${invocationRef}`,
    preparedMaterialDigest: inputDigest,
    preparedTargetDigest: authorizationAuthority.targetDigest,
    consequence: authorizationAuthority.consequence,
    dataLimitSummary: authorizationAuthority.limits,
    authorityReference: authorizationAuthority.reference,
    authorityBinding: canonicalAuthorityBinding,
    authorityDecisionAt: authorizationExpiresAt,
    currentAttemptRef: attemptRef,
    currentEffectGeneration: 1,
    currentLeaseOwner: leaseOwner,
    currentLeaseExpiresAt: authorizationExpiresAt,
    updatedAt: authorizationExpiresAt,
    control: {
      invocationRef,
      invocationVersion: 1,
      origin: { kind: 'standalone' as const, callerRef: credentialId, principalRef: principalId },
      owner: { callerRef: credentialId, principalRef: principalId },
      action: {
        id: authorizationOperation.operationId,
        contractVersion: authorizationDescriptor.version,
      },
      desired: { state: 'invoke' as const },
      authority: {
        reference: authorizationAuthority.reference,
        expiresAt: authorizationAuthority.expiresAt,
      },
      acceptedAuthority: authorizationBasis,
      freshness: { state: 'current' as const, observedAt: authorizationExpiresAt },
      control: {
        state: 'leased' as const,
        attemptRef,
        leaseOwner,
        effectGeneration: 1,
        leaseExpiresAt: authorizationExpiresAt,
        release: 'not_started' as const,
      },
    },
  })
  db.seed('actionInvocationAttempts', {
    _id: 'authorization:attempt',
    invocationRef,
    attemptRef,
    attemptNumber: 1,
    effectGeneration: 1,
    actor: { callerRef: credentialId, principalRef: principalId },
    idempotency: {
      operationKey: authorizationOperationRef,
      materialInputDigest: inputDigest,
      effectIdentity: canonicalDigest({
        actionId: authorizationOperation.operationId,
        operationKey: authorizationOperationRef,
        materialInputDigest: inputDigest,
      } as never),
    },
    lease: { owner: leaseOwner, expiresAt: authorizationExpiresAt },
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
    recordedAt: authorizationExpiresAt,
  })
  const account = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyAccounts', {
      state: 'active',
      currency: 'USD',
      exponent: 2,
      version: 1,
      createdAt: now,
      recoveryDueUnits: '0',
      updatedAt: now,
      ...row,
    })
  account({
    _id: 'authorization:operator',
    accountRef: accountRefForOwner(ownerId, 'USD'),
    accountKind: 'operator_credit',
    accountId: ownerId,
    balanceUnits: '1000',
  })
  account({
    _id: 'authorization:provider',
    accountRef: accountRefForProvider('business:money', 'USD'),
    accountKind: 'provider_earnings',
    businessId: 'business:money',
    balanceUnits: '0',
  })
  account({
    _id: 'authorization:rake',
    accountRef: accountRefForRake('USD'),
    accountKind: 'ae_rake',
    balanceUnits: '0',
  })
  const state = {
    principalId,
    credentialId,
    budgetPolicyRef: 'budget:test-money',
    environment: 'sandbox',
    generation: 1,
    currency: 'USD',
    exponent: 2,
    settledUnits: '0',
    reservedUnits: '0',
    reservedCount: 0,
    version: 1,
    updatedAt: now,
  }
  db.seed('moneyCredentialBudgetStates', {
    ...state,
    _id: 'authorization:day',
    windowKind: 'day',
    windowStart: '1970-01-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...state,
    _id: 'authorization:month',
    windowKind: 'month',
    windowStart: '1970-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...state,
    _id: 'authorization:concurrency',
    windowKind: 'concurrency',
    windowStart: 'all',
  })
}

function authorizationArgs(): Record<string, unknown> {
  return {
    principalId,
    amount: authorizationAmount,
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business:money', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    transactionRef,
    idempotencyKey: transactionRef,
    inputDigest,
    expectedAccountVersion: 1,
    rakeBps: 1_000,
    priceDigest: authorizationPriceDigest,
    priceSourceDigest: authorizationPriceDigest,
    authorityMaximumSpend: authorizationMaximumSpend,
    credentialId,
    applicationRef: 'application:test-money',
    serviceRef: authorizationOperation.operationId,
    offeringRef: authorizationOperation.identity.offeringId,
    businessId: authorizationOperation.identity.businessId,
    invocationRef,
    attemptRef,
    operationKey: authorizationOperationRef,
    sourceDigest: authorizationOperation.materialDigest,
    evidenceRefs: [...authorizationOperation.readiness.evidenceRefs],
    observedAt: now,
    freeTier: false,
    credentialBudgetGrantRef: 'grant:money',
    credentialBudgetGeneration: 1,
  }
}
function seedPaidAuthorizationFixture(db: MemoryDb): Record<string, unknown> {
  seedAuthorizationFixture(db)
  const amount = { currency: 'USD', units: '100', exponent: 2 }
  const priceDigest = canonicalDigest({
    version: 'pricing:v2',
    unit: 'call',
    paidAmount: amount,
  })
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: amount,
  }
  const identity = {
    ...authorizationOperation.identity,
    price: { kind: 'fixed' as const, amount },
    priceDigest,
    pricingConfig,
  }
  const operation = {
    ...authorizationOperation,
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest,
    pricingConfig,
    offering: {
      ...authorizationOperation.offering,
      presentation: {
        ...authorizationOperation.offering.presentation,
        price: { kind: 'fixed' as const, amount },
      },
    },
  } as PublishedOperation
  const descriptor = materializeRuntimePublishedOperation(operation)
  const authorityMaterial = {
    ...authorizationAuthorityMaterial,
    targetDigest: canonicalDigest(operation.identity as never),
    consequence: descriptor.consequenceClass,
    limits: { amount },
  }
  const authority = {
    ...authorityMaterial,
    decisionDigest: canonicalDigest(authorityMaterial as never),
  }
  const invocation = db.rows('capabilityOperationInvocations').find(
    (row) => row._id === 'authorization:invocation',
  )
  const offering = db.rows('capabilityOfferings').find(
    (row) => row._id === 'offering:money',
  )
  const grant = db.rows('agentAccessGrants').find(
    (row) => row._id === 'grant:money',
  )
  const control = db.rows('actionInvocationControls').find(
    (row) => row._id === 'authorization:control',
  )
  if (invocation === undefined || offering === undefined || grant === undefined || control === undefined)
    throw new Error('paid_authorization_fixture_missing')
  invocation.operationJson = JSON.stringify(operation)
  invocation.authority = authority
  const offeringPresentation = offering.presentation as Record<string, unknown>
  offeringPresentation.price = { kind: 'fixed', amount }
  const policy = grant.policy as Record<string, unknown>
  const budget = policy.budget as Record<string, unknown>
  budget.maximumSpendPerInvocation = amount
  const authorityBinding = control.authorityBinding as Record<string, unknown>
  Object.assign(authorityBinding, {
    contractVersion: descriptor.version,
    digest: authority.decisionDigest,
    targetDigest: authority.targetDigest,
    consequence: authority.consequence,
    limits: authority.limits,
  })
  const controlValue = control.control as Record<string, unknown>
  controlValue.action = {
    id: authorizationOperation.operationId,
    contractVersion: descriptor.version,
  }
  controlValue.acceptedAuthority = authority.acceptedBasis
  controlValue.authority = {
    reference: authority.reference,
    expiresAt: authority.expiresAt,
  }
  control.preparedTargetDigest = authority.targetDigest
  return {
    ...authorizationArgs(),
    amount,
    authorityMaximumSpend: amount,
    priceDigest,
    priceSourceDigest: priceDigest,
    sourceDigest: operation.materialDigest,
    expectedAccountVersion: 1,
  }
}


function seedPaidCharge(
  db: MemoryDb,
  state: 'applied' | 'outcome_unknown' = 'applied',
): void {
  db.seed('moneyUsageEvents', {
    _id: 'usage:money',
    usageRef: `${invocationRef}:usage`,
    principalId,
    accountId: ownerId,
    credentialId,
    currency: 'USD',
    exponent: 2,
    serviceRef: 'service:money',
    offeringRef: 'offering:money',
    businessId: 'business:money',
    invocationRef,
    attemptRef,
    operationKey: 'operation:money',
    priceDigest: sourceDigest,
    chargeState: 'paid',
    amountUnits: '100',
    transactionRef,
    observedAt: now,
  })
  db.seed('moneyTransactions', {
    _id: 'transaction:charge',
    transactionRef,
    kind: 'charge',
    idempotencyKey: transactionRef,
    inputDigest,
    principalId,
    accountId: ownerId,
    currency: 'USD',
    credentialId,
    budgetPolicyRef: 'budget:test-money',
    budgetGeneration: 1,
    budgetEnvironment: 'sandbox',
    budgetDayStart: '1970-01-01',
    budgetMonthStart: '1970-01',
    budgetState: 'reserved',
    amountUnits: '100',
    exponent: 2,
    state,
    expectedAccountVersion: 1,
    createdAt: now,
    updatedAt: now,
  })
  const account = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyAccounts', {
      state: 'active',
      currency: 'USD',
      exponent: 2,
      version: 1,
      createdAt: now,
      recoveryDueUnits: '0',
      updatedAt: now,
      ...row,
    })
  account({
    _id: 'account:operator',
    accountRef: accountRefForOwner(ownerId, 'USD'),
    accountKind: 'operator_credit',
    accountId: ownerId,
    balanceUnits: '0',
  })
  account({
    _id: 'account:provider',
    accountRef: accountRefForProvider('business:money', 'USD'),
    accountKind: 'provider_earnings',
    businessId: 'business:money',
    balanceUnits: '99',
  })
  account({
    _id: 'account:rake',
    accountRef: accountRefForRake('USD'),
    accountKind: 'ae_rake',
    balanceUnits: '1',
  })
  const entry = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyLedgerEntries', {
      transactionRef,
      idempotencyKey: transactionRef,
      sourceDigest,
      evidenceRefs: ['evidence:money'],
      createdAt: now,
      ...row,
    })
  entry({
    _id: 'entry:charge',
    entryRef: `${transactionRef}:charge`,
    accountRef: accountRefForOwner(ownerId, 'USD'),
    entryType: 'charge',
    direction: 'debit',
    amountUnits: '100',
    currency: 'USD',
    exponent: 2,
    principalId,
    invocationRef,
    attemptRef,
  })
  entry({
    _id: 'entry:provider',
    entryRef: `${transactionRef}:provider`,
    accountRef: accountRefForProvider('business:money', 'USD'),
    entryType: 'payout_accrual',
    direction: 'credit',
    amountUnits: '99',
    currency: 'USD',
    exponent: 2,
    businessId: 'business:money',
    invocationRef,
    attemptRef,
  })
  entry({
    _id: 'entry:rake',
    entryRef: `${transactionRef}:rake`,
    accountRef: accountRefForRake('USD'),
    entryType: 'rake',
    direction: 'credit',
    amountUnits: '1',
    currency: 'USD',
    exponent: 2,
    businessId: 'business:money',
  })
}
function settleSeededChargeBudget(
  db: MemoryDb,
  originalCredentialId = credentialId,
  usageCredentialId = originalCredentialId,
  withSettledAt = false,
): void {
  const transaction = db
    .rows('moneyTransactions')
    .find((row) => row._id === 'transaction:charge')
  if (transaction === undefined) throw new Error('charge_fixture_missing')
  transaction.credentialId = originalCredentialId
  transaction.budgetState = 'settled'
  transaction.budgetEnvironment = 'production'
  if (withSettledAt) transaction.settledAt = now
  transaction.state = 'applied'
  for (const row of db.rows('moneyCredentialBudgetStates')) {
    row.environment = 'production'
    row.credentialId = originalCredentialId
    row.settledUnits = row.windowKind === 'concurrency' ? '0' : '100'
    row.reservedUnits = '0'
    row.reservedCount = 0
  }
  const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
  if (usage === undefined) throw new Error('usage_fixture_missing')
  usage.credentialId = usageCredentialId
}
function qualifiedUseArgs(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    invocationRef,
    attemptRef,
    effectGeneration: 1,
    businessId: 'business:money',
    operationRef: 'operation:money',
    publicationRef: 'publication:money',
    publicationRevision: 1,
    contractDigest: 'sha256:contract-qualified',
    bindingDigest: 'sha256:binding-qualified',
    principalClass: 'agent_key',
    requestDigest: 'sha256:request-qualified',
    responseDigest: 'sha256:response-qualified',
    evidenceRefs: ['evidence:qualified'],
    principalId,
    environment: 'production',
    qualifiedAt: now,
    usageRef: `${invocationRef}:usage`,
    transactionRef,
    ...overrides,
  }
}
type FreeTierFixture = Readonly<{
  invocationRef: string
  attemptRef: string
  transactionRef: string
  usageRef: string
  principalId: string
  businessId: string
  operationRef: string
}>
function seedCanonicalFreeTierCharge(db: MemoryDb): FreeTierFixture {
  const fixture = {
    invocationRef: 'operation-invocation:free-tier',
    attemptRef: 'operation-attempt:free-tier:1',
    transactionRef: 'operation-money:free-tier:1',
    usageRef: 'operation-invocation:free-tier:usage',
    principalId: 'principal:free-tier',
    businessId: 'business:free-tier',
    operationRef: 'operation:free-tier',
  }
  db.seed('moneyTransactions', {
    _id: 'transaction:free-tier',
    transactionRef: fixture.transactionRef,
    kind: 'charge',
    idempotencyKey: fixture.transactionRef,
    inputDigest: 'sha256:free-tier-input',
    principalId: fixture.principalId,
    accountId: 'owner:free-tier',
    currency: 'USD',
    credentialId: 'credential:free-tier',
    budgetPolicyRef: 'budget:free-tier',
    budgetGeneration: 1,
    budgetEnvironment: 'production',
    budgetDayStart: '1970-01-01',
    budgetMonthStart: '1970-01',
    budgetState: 'settled',
    amountUnits: '0',
    exponent: 2,
    state: 'applied',
    expectedAccountVersion: 1,
    createdAt: now,
    updatedAt: now,
  })
  db.seed('moneyUsageEvents', {
    _id: 'usage:free-tier',
    usageRef: fixture.usageRef,
    principalId: fixture.principalId,
    accountId: 'owner:free-tier',
    credentialId: 'credential:free-tier',
    currency: 'USD',
    exponent: 2,
    serviceRef: 'service:free-tier',
    offeringRef: 'offering:free-tier',
    businessId: fixture.businessId,
    invocationRef: fixture.invocationRef,
    attemptRef: fixture.attemptRef,
    operationKey: fixture.operationRef,
    priceDigest: 'sha256:free-tier-price',
    chargeState: 'free_tier',
    amountUnits: '0',
    transactionRef: fixture.transactionRef,
    observedAt: now,
  })
  return fixture
}

function freeTierQualifiedUseArgs(
  fixture: FreeTierFixture,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return qualifiedUseArgs({
    invocationRef: fixture.invocationRef,
    attemptRef: fixture.attemptRef,
    principalId: fixture.principalId,
    businessId: fixture.businessId,
    operationRef: fixture.operationRef,
    usageRef: fixture.usageRef,
    transactionRef: fixture.transactionRef,
    ...overrides,
  })
}

function seedDailyAllocationComposition(
  db: MemoryDb,
  count = 1_000,
): string {
  const periodStart = '1970-01-01T00:00:00.000Z'
  const periodEnd = '1970-01-02T00:00:00.000Z'
  const payoutRef = canonicalDigest({
    format: 'money-daily-payout:v1',
    businessId: 'business:money',
    currency: 'USD',
    periodStart,
    periodEnd,
  })
  db.seed('moneyPayouts', {
    _id: 'payout:allocation-limit',
    payoutRef,
    businessId: 'business:money',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: String(count * 100),
    rakeUnits: String(count),
    providerNetUnits: String(count * 99),
    minimumPayoutUnits: '0',
    cadence: 'daily',
    state: 'held_threshold',
    periodStart,
    periodEnd,
    providerAccountRef: accountRefForProvider('business:money', 'USD'),
    idempotencyKey: payoutRef,
    createdAt: now,
    updatedAt: now,
  })
  for (let index = 0; index < count; index += 1) {
    const qualifiedUseRef = `qualified-use:allocation-limit:${index}`
    const materialDigest = `sha256:allocation-limit-material:${index}`
    db.seed('moneyPayoutAllocations', {
      _id: `allocation:limit:${index}`,
      allocationRef: canonicalDigest({
        format: 'money-qualified-use-allocation:v1',
        qualifiedUseRef,
        materialDigest,
      }),
      payoutRef,
      qualifiedUseRef,
      transactionRef: `transaction:allocation-limit:${index}`,
      usageRef: `usage:allocation-limit:${index}`,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      qualifiedAt: now,
      sourceDigest: 'sha256:allocation-limit-source',
      materialDigest,
      createdAt: now,
    })
  }
  return payoutRef
}

function seedSecondPaidCharge(
  db: MemoryDb,
  nextInvocationRef: string,
  nextAttemptRef: string,
  nextTransactionRef: string,
  observedAt: number,
): void {
  const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
  const transaction = db.rows('moneyTransactions').find(
    (row) => row._id === 'transaction:charge',
  )
  if (usage === undefined || transaction === undefined)
    throw new Error('charge_fixture_missing')
  const currentTransactionRef = String(transaction.transactionRef)
  const currentInvocationRef = String(usage.invocationRef)
  const currentAttemptRef = String(usage.attemptRef)
  const entries = db.rows('moneyLedgerEntries').filter(
    (row) => row.transactionRef === currentTransactionRef,
  )
  db.seed('moneyTransactions', {
    ...transaction,
    _id: 'transaction:charge-second',
    transactionRef: nextTransactionRef,
    idempotencyKey: nextTransactionRef,
    state: 'applied',
    budgetState: 'settled',
    settledAt: observedAt,
    createdAt: observedAt,
    updatedAt: observedAt,
  })
  db.seed('moneyUsageEvents', {
    ...usage,
    _id: 'usage:money-second',
    usageRef: `${nextInvocationRef}:usage`,
    invocationRef: nextInvocationRef,
    attemptRef: nextAttemptRef,
    transactionRef: nextTransactionRef,
    observedAt,
  })
  for (const entry of entries) {
    db.seed('moneyLedgerEntries', {
      ...entry,
      _id: `${String(entry._id)}:second`,
      entryRef: String(entry.entryRef).replace(
        currentTransactionRef,
        nextTransactionRef,
      ),
      transactionRef: nextTransactionRef,
      idempotencyKey: nextTransactionRef,
      invocationRef:
        entry.invocationRef === currentInvocationRef
          ? nextInvocationRef
          : entry.invocationRef,
      attemptRef:
        entry.attemptRef === currentAttemptRef
          ? nextAttemptRef
          : entry.attemptRef,
      createdAt: observedAt,
    })
  }
}
function seedProviderRefundCorrection(
  db: MemoryDb,
  allocation: Row,
  overrides: Record<string, unknown> = {},
  linked = true,
  suffix = 'one',
): void {
  db.seed('moneyLedgerEntries', {
    _id: `entry:provider-refund-correction:${suffix}`,
    entryRef: `transaction:provider-refund-correction:${suffix}:provider`,
    accountRef: accountRefForProvider('business:money', 'USD'),
    entryType: 'refund',
    direction: 'debit',
    amountUnits: allocation.providerNetUnits,
    currency: 'USD',
    exponent: 2,
    transactionRef: `transaction:provider-refund-correction:${suffix}`,
    idempotencyKey: `transaction:provider-refund-correction:${suffix}`,
    businessId: 'business:money',
    sourceDigest: 'sha256:provider-refund-correction',
    evidenceRefs: ['evidence:provider-refund-correction'],
    reversalOf: allocation.transactionRef,
    createdAt: now + 1,
    ...(linked
      ? {
          payoutRef: allocation.payoutRef,
          allocationRef: allocation.allocationRef,
          allocationCorrectionUnits: allocation.providerNetUnits,
        }
      : {}),
    ...overrides,
  })
}
function rebindSeededCharge(
  db: MemoryDb,
  nextInvocationRef: string,
  nextAttemptRef: string,
  nextTransactionRef: string,
  observedAt: number,
): void {
  seedSecondPaidCharge(
    db,
    nextInvocationRef,
    nextAttemptRef,
    nextTransactionRef,
    observedAt,
  )
}

function seedDisputeFixture(
  db: MemoryDb,
  originalCredentialId: string,
  usageCredentialId: string,
): void {
  seedBudget(db)
  seedPaidCharge(db)
  settleSeededChargeBudget(db, originalCredentialId, usageCredentialId, true)
  const qualifiedIdentity = {
    invocationRef,
    attemptRef,
    effectGeneration: 1,
  }
  const qualifiedMaterial = {
    ...qualifiedIdentity,
    businessId: 'business:money',
    operationRef: 'operation:money',
    publicationRef: 'publication:money',
    publicationRevision: 1,
    contractDigest: 'sha256:contract',
    bindingDigest: 'sha256:binding',
    principalClass: 'agent_key',
    requestDigest: 'sha256:request',
    responseDigest: 'sha256:response',
    evidenceRefs: ['evidence:qualified'],
  } as const
  const qualifiedRef = qualifiedUseRef(qualifiedIdentity)
  db.seed('qualifiedUseReceipts', {
    _id: 'receipt:money',
    qualifiedUseRef: qualifiedRef,
    materialDigest: qualifiedUseMaterialDigest(qualifiedMaterial),
    ...qualifiedMaterial,
    environment: 'production',
    qualifiedAt: now,
    usageRef: `${invocationRef}:usage`,
    transactionRef,
  })
  const payoutRef = canonicalDigest({
    format: 'money-payout-period:v1',
    businessId: 'business:money',
    currency: 'USD',
    periodStart: '1970-01-01',
    periodEnd: '1970-01-31',
  })
  db.seed('moneyPayouts', {
    _id: 'payout:dispute',
    payoutRef,
    businessId: 'business:money',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '100',
    rakeUnits: '1',
    providerNetUnits: '99',
    minimumPayoutUnits: '0',
    state: 'held_threshold',
    periodStart: '1970-01-01',
    periodEnd: '1970-01-31',
    providerAccountRef: accountRefForProvider('business:money', 'USD'),
    idempotencyKey: payoutRef,
    createdAt: now,
    updatedAt: now,
  })
}

function completionContext(db: MemoryDb): {
  db: MemoryDb
  runMutation: (
    reference: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>
} {
  return {
    db,
    runMutation: async (_reference, args) =>
      await reconcileHandler({ db }, args),
  }
}
function markerContext(db: MemoryDb): HandlerContext {
  return {
    db,
    auth: {
      getUserIdentity: async () => ({ tokenIdentifier: principalId }),
    },
  }
}

const exhausted = { context: { invocationRef }, result: { kind: 'failed' } }

describe('money authorization rate ownership', () => {
  it('does not consume the agent-access limiter while reserving a free budget admission', async () => {
    const db = new MemoryDb()
    seedAuthorizationFixture(db)
    const limit = vi
      .spyOn(RateLimiter.prototype, 'limit')
      .mockResolvedValue({ ok: true })
    try {
      await expect(
        authorizeHandler({ db }, authorizationArgs()),
      ).resolves.toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })
      expect(limit).not.toHaveBeenCalled()
      expect(
        db
          .rows('moneyCredentialBudgetStates')
          .find((row) => row.windowKind === 'concurrency'),
      ).toMatchObject({ reservedCount: 1 })
    } finally {
      limit.mockRestore()
    }
  })
})

describe('money authorization account version', () => {
  it('reads the operator version advanced by a prior top-up', async () => {
    const db = new MemoryDb()
    db.seed('moneyAccounts', {
      _id: 'account:operator-version',
      accountRef: accountRefForOwner('owner:version', 'USD'),
      accountKind: 'operator_credit',
      accountId: 'owner:version',
      currency: 'USD',
      exponent: 2,
      balanceUnits: '1000',
      version: 1,
      recoveryDueUnits: '0',
      state: 'active',
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      accountVersionHandler(
        { db },
        { ownerId: 'owner:version', currency: 'USD' },
      ),
    ).resolves.toBe(1)
    await expect(
      accountVersionHandler(
        { db },
        { ownerId: 'owner:other', currency: 'USD' },
      ),
    ).resolves.toBeNull()
  })
  it('materializes canonical provider and rake accounts for a first authorization', async () => {
    const db = new MemoryDb()
    seedAuthorizationFixture(db)
    db.remove('moneyAccounts', (row) => row.accountKind !== 'operator_credit')

    await expect(
      authorizeHandler({ db }, authorizationArgs()),
    ).resolves.toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })

    expect(db.rows('moneyAccounts')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountRef: accountRefForProvider('business:money', 'USD'),
          accountKind: 'provider_earnings',
          businessId: 'business:money',
          balanceUnits: '0',
        }),
        expect.objectContaining({
          accountRef: accountRefForRake('USD'),

          accountKind: 'ae_rake',
          balanceUnits: '0',
        }),
      ]),
    )
  })
  it('does not persist insufficient usage and accepts the identical charge after top-up', async () => {
    const mutablePolicy = LIVE_MONEY_GATE_POLICY as unknown as {
      counselSignoffs: Array<Record<string, unknown>>
      stripe: Record<string, unknown>
    }
    const previousPolicy = structuredClone(mutablePolicy)
    for (const signoff of mutablePolicy.counselSignoffs) {
      signoff.status = 'accepted'
      signoff.artifactRef = 'test:counsel'
    }
    mutablePolicy.stripe = { mode: 'live', readiness: 'ready' }
    try {
      const db = new MemoryDb()
      const args = seedPaidAuthorizationFixture(db)
      const operator = db.rows('moneyAccounts').find(
        (row) => row._id === 'authorization:operator',
      )
      if (operator === undefined) throw new Error('operator_fixture_missing')
      operator.balanceUnits = '0'
      const before = {
        accounts: structuredClone(db.rows('moneyAccounts')),
        budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
        usage: structuredClone(db.rows('moneyUsageEvents')),
        summaries: structuredClone(db.rows('moneyCredentialUsageSummaries')),
        entries: structuredClone(db.rows('moneyLedgerEntries')),
        transactions: structuredClone(db.rows('moneyTransactions')),
      }
      await expect(authorizeHandler({ db }, args)).resolves.toMatchObject({
        kind: 'refused',
        code: 'insufficient_credit',
      })
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        usage: db.rows('moneyUsageEvents'),
        summaries: db.rows('moneyCredentialUsageSummaries'),
        entries: db.rows('moneyLedgerEntries'),
        transactions: db.rows('moneyTransactions'),
      }).toEqual(before)
      operator.balanceUnits = '10000'
      operator.version = 2
      const accepted = await authorizeHandler({
        db,
      }, {
        ...args,
        expectedAccountVersion: 2,
      })
      expect(accepted).toMatchObject({ kind: 'accepted', chargeState: 'paid' })
      expect(db.rows('moneyUsageEvents')).toHaveLength(1)
      expect(db.rows('moneyUsageEvents')[0]).toMatchObject({ chargeState: 'paid' })
      expect(db.rows('moneyTransactions')).toHaveLength(1)
      expect(db.rows('moneyLedgerEntries')).toHaveLength(3)
    } finally {
      Object.assign(mutablePolicy, previousPolicy)
    }
  })
})
describe('charge outcome marker atomicity', () => {
  it('marks only a live reserved charge and replays idempotently', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    const args = { transactionRef, principalId, now }

    await expect(markerHandler(markerContext(db), args)).resolves.toEqual({
      kind: 'outcome_unknown',
      transactionRef,
    })
    expect(db.rows('moneyTransactions').find((row) => row._id === 'transaction:charge')).toMatchObject({
      state: 'outcome_unknown',
      budgetState: 'unknown',
    })
    const before = structuredClone(db.rows('moneyTransactions'))
    await expect(markerHandler(markerContext(db), args)).resolves.toEqual({
      kind: 'outcome_unknown',
      transactionRef,
    })
    expect(db.rows('moneyTransactions')).toEqual(before)
  })
  it('does not reopen a reversed charge and preserves exact refund replay', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(reconcileHandler({ db }, reconciliationArgs())).resolves.toEqual({
      kind: 'settled',
    })
    const beforeMarker = {
      transactions: structuredClone(db.rows('moneyTransactions')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    await expect(markerHandler(markerContext(db), {
      transactionRef,
      principalId,
      now,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'charge_reconciliation_required',
    })
    expect({
      transactions: db.rows('moneyTransactions'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(beforeMarker)
    await expect(reconcileHandler({ db }, reconciliationArgs('released'))).resolves.toEqual({
      kind: 'reconciliation_required',
    })
    await expect(reconcileHandler({ db }, reconciliationArgs())).resolves.toEqual({
      kind: 'settled',
    })
    expect(db.rows('moneyTransactions').filter((row) => row.kind === 'refund')).toHaveLength(1)
  })
})

describe('exact invocation money reconciliation', () => {
  it('refunds an accepted charge, releases budget, and replays without a second refund', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .every((row) => row.reservedUnits === '0' && row.reservedCount === 0),
    ).toBe(true)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
  })

  it.each([
    {
      name: 'source digest',
      mutate: (args: Record<string, unknown>) => ({
        ...args,
        sourceDigest: 'sha256:changed-source',
      }),
    },
    {
      name: 'evidence refs',
      mutate: (args: Record<string, unknown>) => ({
        ...args,
        evidenceRefs: ['operation-money-reconciliation:changed'],
      }),
    },
  ])('refuses changed replay $name without writes', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, mutate(reconciliationArgs())),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect(
        db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
      ).toHaveLength(1)
      expect(
        db
          .rows('moneyLedgerEntries')
          .filter((row) => row.transactionRef === refundTransactionRef),
      ).toHaveLength(3)
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
        entries: db.rows('moneyLedgerEntries'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('refuses a fourth refund-journal row before replay writes', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const refundEntry = db
      .rows('moneyLedgerEntries')
      .find((row) => row.transactionRef === refundTransactionRef)
    if (refundEntry === undefined) throw new Error('refund_entry_fixture_missing')
    db.seed('moneyLedgerEntries', {
      ...refundEntry,
      _id: 'entry:refund-fourth',
      entryRef: `${refundTransactionRef}:fourth`,
      accountRef: 'forged:refund-fourth',
    })
    expect(
      db
        .rows('moneyLedgerEntries')
        .filter((row) => row.transactionRef === refundTransactionRef),
    ).toHaveLength(4)
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect(
        db
          .rows('moneyLedgerEntries')
          .filter((row) => row.transactionRef === refundTransactionRef),
      ).toHaveLength(4)
      expect(
        db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
      ).toHaveLength(1)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it.each(
    (['operator', 'provider', 'rake'] as const).flatMap((role) =>
      (
        [
          'entryRef',
          'accountRef',
          'direction',
          'amountUnits',
          'allocationCorrectionUnits',
          'currency',
          'exponent',
          'principalId',
          'businessId',
          'invocationRef',
          'attemptRef',
          'createdAt',
          'sourceDigest',
          'evidenceRefs',
        ] as const
      ).map((field) => ({ name: `${role} ${field}`, role, field })),
    ),
  )('refuses replay with changed $name without writes', async ({ role, field }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const entry = db
      .rows('moneyLedgerEntries')
      .find((row) => row.entryRef === `${refundTransactionRef}:${role}`)
    if (entry === undefined) throw new Error('refund_entry_fixture_missing')
    if (field === 'entryRef') entry.entryRef = 'forged:refund-entry'
    else if (field === 'accountRef') entry.accountRef = 'forged:refund-account'
    else if (field === 'direction') entry.direction = entry.direction === 'credit' ? 'debit' : 'credit'
    else if (field === 'amountUnits') entry.amountUnits = '101'
    else if (field === 'allocationCorrectionUnits') entry.allocationCorrectionUnits = '98'
    else if (field === 'currency') entry.currency = 'EUR'
    else if (field === 'exponent') entry.exponent = 3
    else if (field === 'principalId') entry.principalId = 'forged:principal'
    else if (field === 'businessId') entry.businessId = 'forged:business'
    else if (field === 'invocationRef') entry.invocationRef = 'forged:invocation'
    else if (field === 'attemptRef') entry.attemptRef = 'forged:attempt'
    else if (field === 'createdAt') entry.createdAt = now + 1
    else if (field === 'sourceDigest') entry.sourceDigest = 'sha256:changed-source'
    else entry.evidenceRefs = ['evidence:changed']
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
        entries: db.rows('moneyLedgerEntries'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('refuses replay when a second by_reversalOf transaction exists', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const refund = db
      .rows('moneyTransactions')
      .find((row) => row.transactionRef === refundTransactionRef)
    if (refund === undefined) throw new Error('refund_transaction_fixture_missing')
    db.seed('moneyTransactions', {
      ...refund,
      _id: 'transaction:forged-refund',
      transactionRef: 'forged-refund',
      idempotencyKey: 'forged-refund-key',
      inputDigest: 'sha256:forged-refund',
      createdAt: now + 1,
      updatedAt: now + 1,
    })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
        entries: db.rows('moneyLedgerEntries'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('accepts a recovery-adjusted journal and refunds full provider credit once', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    const provider = db
      .rows('moneyAccounts')
      .find((row) => row._id === 'account:provider')
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '89'
    db.seed('moneyLedgerEntries', {
      _id: 'entry:provider-recovery',
      entryRef: `${transactionRef}:provider-recovery`,
      accountRef: accountRefForProvider('business:money', 'USD'),
      entryType: 'payout_accrual',
      direction: 'debit',
      amountUnits: '10',
      currency: 'USD',
      exponent: 2,
      transactionRef,
      idempotencyKey: transactionRef,
      invocationRef,
      attemptRef,
      businessId: 'business:money',
      sourceDigest,
      evidenceRefs: ['evidence:money'],
      createdAt: now,
    })

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyLedgerEntries')
        .filter(
          (row) =>
            row.transactionRef === transactionRef &&
            row.entryType === 'payout_accrual' &&
            row.direction === 'debit',
        ),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyTransactions')
        .filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed' })
    expect(
      db
        .rows('moneyLedgerEntries')
        .find(
          (row) =>
            row.transactionRef === refundTransactionRef &&
            row.accountRef === accountRefForProvider('business:money', 'USD'),
        ),
    ).toMatchObject({ entryType: 'refund', amountUnits: '99' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .every((row) => row.reservedUnits === '0' && row.reservedCount === 0),
    ).toBe(true)
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(provider).toMatchObject({ balanceUnits: '0', recoveryDueUnits: '10' })
  })
  it.each([
    {
      name: "recovery row principalId differs from the provider row's optional principalId",
      mutate: (recovery: Row, _provider: Row) => {
        recovery.principalId = 'principal:forged'
      },
    },
    {
      name: 'recovery row createdAt differs from provider and transaction',
      mutate: (recovery: Row, _provider: Row) => {
        recovery.createdAt = now + 1
      },
    },
    {
      name: 'provider and recovery createdAt differ from the transaction',
      mutate: (recovery: Row, provider: Row) => {
        recovery.createdAt = now + 1
        provider.createdAt = now + 1
      },
    },
  ])('refuses recovery adjustment when $name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    const providerAccount = db
      .rows('moneyAccounts')
      .find((row) => row._id === 'account:provider')
    const providerEntry = db
      .rows('moneyLedgerEntries')
      .find((row) => row._id === 'entry:provider')
    if (providerAccount === undefined || providerEntry === undefined)
      throw new Error('provider_fixture_missing')
    providerAccount.balanceUnits = '89'
    const recovery: Row = {
      _id: 'entry:provider-recovery',
      entryRef: `${transactionRef}:provider-recovery`,
      accountRef: accountRefForProvider('business:money', 'USD'),
      entryType: 'payout_accrual',
      direction: 'debit',
      amountUnits: '10',
      currency: 'USD',
      exponent: 2,
      transactionRef,
      idempotencyKey: transactionRef,
      invocationRef,
      attemptRef,
      businessId: 'business:money',
      sourceDigest,
      evidenceRefs: ['evidence:money'],
      createdAt: now,
    }
    mutate(recovery, providerEntry)
    db.seed('moneyLedgerEntries', recovery)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })



  it('reverses settled credential budget spend once and replays without underflow', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db)

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .filter((row) => row.windowKind !== 'concurrency'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ settledUnits: '0', reservedUnits: '0' }),
        expect.objectContaining({ settledUnits: '0', reservedUnits: '0' }),
      ]),
    )
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .find((row) => row.windowKind === 'concurrency'),
    ).toMatchObject({ settledUnits: '0', reservedUnits: '0', reservedCount: 0 })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed', budgetState: 'released' })
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .filter((row) => row.windowKind !== 'concurrency')
        .every((row) => row.settledUnits === '0'),
    ).toBe(true)
  })

  it('refuses settled budget reversal underflow before refund writes', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db)
    const day = db
      .rows('moneyCredentialBudgetStates')
      .find((row) => row.windowKind === 'day')
    if (day === undefined) throw new Error('budget_fixture_missing')
    day.settledUnits = '99'

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .filter((row) => row.windowKind !== 'concurrency'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ windowKind: 'day', settledUnits: '99' }),
        expect.objectContaining({ windowKind: 'month', settledUnits: '100' }),
      ]),
    )
  })

  it('rejects disputed use when pooled owner credentials differ', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-b')
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:credential-mismatch',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect(
      db
        .rows('moneyCredentialBudgetStates')
        .every((row) => row.settledUnits === (row.windowKind === 'concurrency' ? '0' : '100')),
    ).toBe(true)
    expect(
      db
        .rows('moneyAccounts')
        .find((row) => row._id === 'account:provider'),
    ).toMatchObject({ balanceUnits: '99', recoveryDueUnits: '0' })
  })
  it.each([
    {
      name: 'stored account identity mismatch',
      mutate: (usage: Row) => {
        usage.accountId = 'owner:other'
      },
    },
    {
      name: 'stored business identity mismatch',
      mutate: (usage: Row) => {
        usage.businessId = 'business:other'
      },
    },
  ])('$name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const usage = db
      .rows('moneyUsageEvents')
      .find((row) => row._id === 'usage:money')
    if (usage === undefined) throw new Error('usage_fixture_missing')
    mutate(usage)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })

    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:stored-identity-mismatch',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it.each([
    {
      name: 'charge account substitution',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:charge')
        if (entry === undefined) throw new Error('charge_entry_fixture_missing')
        db.seed('moneyAccounts', {
          _id: 'account:other-owner',
          accountRef: accountRefForOwner('owner:other', 'USD'),
          accountKind: 'operator_credit',
          accountId: 'owner:other',
          currency: 'USD',
          exponent: 2,
          balanceUnits: '0',
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: now,
          updatedAt: now,
        })
        entry.accountRef = accountRefForOwner('owner:other', 'USD')
      },
    },
    {
      name: 'provider account substitution',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        if (entry === undefined) throw new Error('provider_entry_fixture_missing')
        db.seed('moneyAccounts', {
          _id: 'account:other-business',
          accountRef: accountRefForProvider('business:other', 'USD'),
          accountKind: 'provider_earnings',
          businessId: 'business:other',
          currency: 'USD',
          exponent: 2,
          balanceUnits: '99',
          recoveryDueUnits: '0',
          version: 1,
          state: 'active',
          createdAt: now,
          updatedAt: now,
        })
        entry.accountRef = accountRefForProvider('business:other', 'USD')
      },
    },
    {
      name: 'rake account substitution',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:rake')
        if (entry === undefined) throw new Error('rake_entry_fixture_missing')
        entry.accountRef = accountRefForOwner(ownerId, 'USD')
      },
    },
    {
      name: 'canonical row metadata drift',
      mutate: (db: MemoryDb) => {
        const entry = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:charge')
        if (entry === undefined) throw new Error('charge_entry_fixture_missing')
        entry.createdAt = now + 1
      },
    },
    {
      name: 'balanced charge amount inflation',
      mutate: (db: MemoryDb) => {
        const charge = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:charge')
        const provider = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        const rake = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:rake')
        if (charge === undefined || provider === undefined || rake === undefined)
          throw new Error('charge_entry_fixture_missing')
        charge.amountUnits = '200'
        provider.amountUnits = '199'
        rake.amountUnits = '1'
      },
    },
  ])('refuses disputed use with $name without writes', async ({ mutate }) => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    mutate(db)
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:canonical-journal-drift',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toMatchObject({ kind: 'refused', retryable: false })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })

  it('refuses a fifth charge-journal row instead of accepting a canonical four-row prefix', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const provider = db
      .rows('moneyLedgerEntries')
      .find((row) => row._id === 'entry:provider')
    const rake = db
      .rows('moneyLedgerEntries')
      .find((row) => row._id === 'entry:rake')
    if (provider === undefined || rake === undefined)
      throw new Error('entry_fixture_missing')
    db.seed('moneyLedgerEntries', {
      ...provider,
      _id: 'entry:provider-recovery',
      entryRef: `${transactionRef}:provider-recovery`,
      direction: 'debit',
      amountUnits: '10',
    })
    db.seed('moneyLedgerEntries', {
      ...rake,
      _id: 'entry:fifth',
      entryRef: `${transactionRef}:fifth`,
    })
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })

    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:fifth-charge-row',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })

  it('refuses transfer-pending dispute reversal without mutating settled credential budget', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const receipt = db
      .rows('qualifiedUseReceipts')
      .find((row) => row._id === 'receipt:money')
    if (receipt === undefined) throw new Error('receipt_fixture_missing')
    const periodStart = '1970-01-01T00:00:00.000Z'
    const periodEnd = '1970-01-02T00:00:00.000Z'
    const payoutRef = canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId: 'business:money',
      currency: 'USD',
      periodStart,
      periodEnd,
    })
    db.seed('moneyPayoutAllocations', {
      _id: 'allocation:dispute-transfer-pending',
      allocationRef: canonicalDigest({
        format: 'money-qualified-use-allocation:v1',
        qualifiedUseRef: receipt.qualifiedUseRef,
        materialDigest: receipt.materialDigest,
      }),
      payoutRef,
      qualifiedUseRef: receipt.qualifiedUseRef,
      materialDigest: receipt.materialDigest,
      qualifiedAt: receipt.qualifiedAt,
      usageRef: receipt.usageRef,
      transactionRef: receipt.transactionRef,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      sourceDigest,
      createdAt: now,
    })
    db.seed('moneyPayouts', {
      _id: 'payout:dispute-transfer-pending',
      payoutRef,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      minimumPayoutUnits: '0',
      cadence: 'daily',
      state: 'transfer_pending',
      periodStart,
      periodEnd,
      providerAccountRef: accountRefForProvider('business:money', 'USD'),
      idempotencyKey: payoutRef,
      createdAt: now,
      updatedAt: now,
    })
    const payout = db
      .rows('moneyPayouts')
      .find((row) => row._id === 'payout:dispute-transfer-pending')
    if (payout === undefined) throw new Error('payout_fixture_missing')
    const before = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
    }
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })

    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:transfer-pending',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'charge_reconciliation_required',
      retryable: false,
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
    expect({
      accounts: db.rows('moneyAccounts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      entries: db.rows('moneyLedgerEntries'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
    }).toEqual(before)
  })


  it('accepts disputed use when pooled owner credentials match', async () => {
    const db = new MemoryDb()
    seedDisputeFixture(db, 'key-a', 'key-a')
    const qualifiedUse = qualifiedUseRef({
      invocationRef,
      attemptRef,
      effectGeneration: 1,
    })
    await expect(
      disputeHandler(
        { db },
        {
          qualifiedUseRef: qualifiedUse,
          disputeRef: 'dispute:credential-match',
          sourceDigest: 'sha256:dispute-source',
          evidenceRefs: ['evidence:dispute'],
          observedAt: now,
        },
      ),
    ).resolves.toEqual({
      kind: 'accepted',
      transactionRef: `qualified-use-dispute-refund:${qualifiedUse}`,
      currency: 'USD',
    })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)
    expect(
      db
        .rows('moneyLedgerEntries')
        .filter(
          (row) =>
            row.transactionRef ===
            `qualified-use-dispute-refund:${qualifiedUse}`,
        ),
    ).toHaveLength(3)
  })

  it('settles after release proof without creating a refund', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')

    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })
  it('refuses released reconciliation before payout write when budget settlement is invalid', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')
    const concurrency = db.rows('moneyCredentialBudgetStates').find(
      (row) => row.windowKind === 'concurrency',
    )
    if (concurrency === undefined) throw new Error('budget_fixture_missing')
    concurrency.reservedCount = 0
    const before = {
      payouts: structuredClone(db.rows('moneyPayouts')),
      budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
      transaction: structuredClone(db.rows('moneyTransactions')),
    }
    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect({
      payouts: db.rows('moneyPayouts'),
      budgets: db.rows('moneyCredentialBudgetStates'),
      transaction: db.rows('moneyTransactions'),
    }).toEqual(before)
  })
  it('settles a released paid charge without creating a payout period', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')

    await expect(
      reconcileHandler({ db }, reconciliationArgs('released')),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({
      state: 'applied',
      budgetState: 'settled',
      settledAt: now,
    })
    expect(db.rows('moneyPayouts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
  })
  it('allocates matching production Qualified Use into one daily payout', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({
      kind: 'recorded',
    })
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(1)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      cadence: 'daily',
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      periodStart: '1970-01-01T00:00:00.000Z',
      periodEnd: '1970-01-02T00:00:00.000Z',
      state: 'held_threshold',
      minimumPayoutUnits: '0',
    })
    expect(db.rows('moneyPayoutAllocations')[0]).toMatchObject({
      qualifiedUseRef: `qualified-use:v1:${invocationRef}:${attemptRef}:1`,
      transactionRef,
      usageRef: `${invocationRef}:usage`,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      qualifiedAt: now,
      sourceDigest,
      materialDigest: qualifiedUseMaterialDigest({
        invocationRef,
        attemptRef,
        effectGeneration: 1,
        businessId: 'business:money',
        operationRef: 'operation:money',
        publicationRef: 'publication:money',
        publicationRevision: 1,
        contractDigest: 'sha256:contract-qualified',
        bindingDigest: 'sha256:binding-qualified',
        principalClass: 'agent_key',
        requestDigest: 'sha256:request-qualified',
        responseDigest: 'sha256:response-qualified',
        evidenceRefs: ['evidence:qualified'],
      }),
    })
  })

  it('replays exactly and pools a second event by UTC day', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const firstArgs = qualifiedUseArgs()

    await expect(
      qualifiedUseHandler({ db }, firstArgs),
    ).resolves.toMatchObject({ kind: 'recorded' })
    await expect(
      qualifiedUseHandler({ db }, firstArgs),
    ).resolves.toMatchObject({ kind: 'replayed' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(1)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })

    const secondInvocationRef = 'operation-invocation:test-money:second'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef = `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    const secondQualifiedAt = now + 1
    rebindSeededCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      secondQualifiedAt,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          qualifiedAt: secondQualifiedAt,
          responseDigest: 'sha256:response-qualified-second',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(2)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '200',
      rakeUnits: '2',
      providerNetUnits: '198',
    })

    const thirdInvocationRef = 'operation-invocation:test-money:third'
    const thirdAttemptRef = `${thirdInvocationRef}:attempt:1`
    const thirdTransactionRef = `operation-money:${thirdInvocationRef}:${thirdAttemptRef}:1`
    const thirdQualifiedAt = Date.UTC(1970, 0, 2)
    rebindSeededCharge(
      db,
      thirdInvocationRef,
      thirdAttemptRef,
      thirdTransactionRef,
      thirdQualifiedAt,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: thirdInvocationRef,
          attemptRef: thirdAttemptRef,
          transactionRef: thirdTransactionRef,
          usageRef: `${thirdInvocationRef}:usage`,
          qualifiedAt: thirdQualifiedAt,
          responseDigest: 'sha256:response-qualified-third',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(3)
    expect(db.rows('moneyPayouts')).toHaveLength(2)
    expect(
      new Set(db.rows('moneyPayouts').map((row) => row.payoutRef)).size,
    ).toBe(2)
    expect(
      db.rows('moneyPayouts').find(
        (row) => row.periodStart === '1970-01-02T00:00:00.000Z',
      ),
    ).toMatchObject({
      periodEnd: '1970-01-03T00:00:00.000Z',
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })
  })
  it.each([
    { name: 'transfer_pending', payoutState: 'transfer_pending' },
    { name: 'outcome_unknown', payoutState: 'outcome_unknown' },
    { name: 'paid', payoutState: 'paid' },
    { name: 'reversed', payoutState: 'reversed' },
  ])('replays an exact allocation after $name', async ({ payoutState }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const payout = db.rows('moneyPayouts')[0]
    if (payout === undefined) throw new Error('allocation_fixture_missing')
    payout.state = payoutState
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'replayed' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        allocations: db.rows('moneyPayoutAllocations'),
        payouts: db.rows('moneyPayouts'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })
  it('replays an exact allocation after a canonical refund without re-accrual', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'replayed' })
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect({
        allocations: db.rows('moneyPayoutAllocations'),
        payouts: db.rows('moneyPayouts'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('rejects a substituted eligibility principal before any allocation write', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({ principalId: 'principal:substitute' }),
      ),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('rejects a sandbox source behind a production Qualified Use receipt atomically', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const transaction = db.rows('moneyTransactions').find(
      (row) => row._id === 'transaction:charge',
    )
    if (transaction === undefined) throw new Error('charge_fixture_missing')
    transaction.budgetEnvironment = 'sandbox'
    for (const row of db.rows('moneyCredentialBudgetStates'))
      row.environment = 'sandbox'
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('rejects replay when the recorded payout is missing or drifted', async () => {
    const missing = new MemoryDb()
    seedBudget(missing)
    seedPaidCharge(missing)
    settleSeededChargeBudget(missing, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db: missing }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    missing.remove('moneyPayouts', () => true)
    await expect(
      qualifiedUseHandler({ db: missing }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(missing.rows('moneyPayoutAllocations')).toHaveLength(1)

    const drifted = new MemoryDb()
    seedBudget(drifted)
    seedPaidCharge(drifted)
    settleSeededChargeBudget(drifted, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db: drifted }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const payout = drifted.rows('moneyPayouts')[0]
    if (payout === undefined) throw new Error('payout_fixture_missing')
    payout.periodEnd = '1970-01-03T00:00:00.000Z'
    await expect(
      qualifiedUseHandler({ db: drifted }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
  })

  it.each([
    {
      name: 'noncanonical source reversal',
      mutate: (db: MemoryDb) => {
        const transaction = db.rows('moneyTransactions').find(
          (row) => row._id === 'transaction:charge',
        )
        if (transaction === undefined) throw new Error('charge_fixture_missing')
        transaction.state = 'reversed'
      },
    },
    {
      name: 'journal source digest drift',
      mutate: (db: MemoryDb) => {
        const provider = db.rows('moneyLedgerEntries').find(
          (row) => row._id === 'entry:provider',
        )
        if (provider === undefined) throw new Error('provider_entry_missing')
        provider.sourceDigest = 'sha256:replay-drift'
      },
    },
  ])('rejects replay after $name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    mutate(db)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect({
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it('records the 1000th daily allocation with bounded source reads', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    seedDailyAllocationComposition(db, 999)
    const query = vi.spyOn(db, 'query')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'recorded' })
      expect(db.rows('moneyPayoutAllocations')).toHaveLength(1_000)
      expect(
        query.mock.calls.filter(([table]) => table === 'moneyPayoutAllocations'),
      ).toHaveLength(4)
    } finally {
      query.mockRestore()
    }
  })

  it('refuses the 1001st daily allocation before any write', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    seedDailyAllocationComposition(db)
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const insert = vi.spyOn(db, 'insert')
    const patch = vi.spyOn(db, 'patch')
    try {
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).rejects.toThrow('qualified_use_payout_allocation_invalid')
      expect(insert).not.toHaveBeenCalled()
      expect(patch).not.toHaveBeenCalled()
      expect(db.rows('moneyPayoutAllocations')).toHaveLength(1_000)
      expect({
        allocations: db.rows('moneyPayoutAllocations'),
        payouts: db.rows('moneyPayouts'),
      }).toEqual(before)
    } finally {
      insert.mockRestore()
      patch.mockRestore()
    }
  })

  it('replays reversed canonical free-tier use without payout rows', async () => {
    const db = new MemoryDb()
    const fixture = seedCanonicalFreeTierCharge(db)
    const args = freeTierQualifiedUseArgs(fixture)
    await expect(
      qualifiedUseHandler({ db }, args),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const transaction = db.rows('moneyTransactions').find(
      (row) => row._id === 'transaction:free-tier',
    )
    if (transaction === undefined) throw new Error('free_tier_transaction_missing')
    transaction.state = 'reversed'
    await expect(
      qualifiedUseHandler({ db }, args),
    ).resolves.toMatchObject({ kind: 'replayed' })
    await expect(
      qualifiedUseHandler(
        { db },
        freeTierQualifiedUseArgs(fixture, {
          responseDigest: 'sha256:free-tier-changed',
        }),
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'qualified_use_identity_conflict',
    })
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('refuses paid replay when its allocation is missing', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const args = qualifiedUseArgs()
    await expect(
      qualifiedUseHandler({ db }, args),
    ).resolves.toMatchObject({ kind: 'recorded' })
    db.remove('moneyPayoutAllocations', () => true)
    await expect(
      qualifiedUseHandler({ db }, args),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(1)
  })

  it('refuses malformed free-tier linkage atomically', async () => {
    const db = new MemoryDb()
    const fixture = seedCanonicalFreeTierCharge(db)
    const usage = db.rows('moneyUsageEvents').find(
      (row) => row._id === 'usage:free-tier',
    )
    if (usage === undefined) throw new Error('free_tier_usage_missing')
    usage.amountUnits = '1'
    const insert = vi.spyOn(db, 'insert')
    try {
      await expect(
        qualifiedUseHandler({ db }, freeTierQualifiedUseArgs(fixture)),
      ).rejects.toThrow('qualified_use_payout_allocation_invalid')
      expect(insert).not.toHaveBeenCalled()
      expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
      expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
      expect(db.rows('moneyPayouts')).toHaveLength(0)
    } finally {
      insert.mockRestore()
    }
  })

  it('excludes a refunded-before-delivery Qualified Use without writing evidence', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const before = {
      receipts: structuredClone(db.rows('qualifiedUseReceipts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toEqual({
      kind: 'excluded',
      reason: 'refunded_before_delivery',
    })
    expect({
      receipts: db.rows('qualifiedUseReceipts'),
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })

  it('decrements a held daily payout once and replays refund without subtracting twice', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '0',
      rakeUnits: '0',
      providerNetUnits: '0',
    })
    const entriesBeforeReplay = structuredClone(
      db.rows('moneyLedgerEntries'),
    )
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyLedgerEntries')).toEqual(entriesBeforeReplay)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '0',
      rakeUnits: '0',
      providerNetUnits: '0',
    })
  })

  it.each([
    {
      name: 'orphaned allocation reference',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationRef: 'allocation:missing',
        }),
    },
    {
      name: 'duplicate allocation correction',
      mutate: (db: MemoryDb, allocation: Row) => {
        seedProviderRefundCorrection(db, allocation, {}, true, 'one')
        seedProviderRefundCorrection(db, allocation, {}, true, 'two')
      },
    },
    {
      name: 'missing allocation correction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationCorrectionUnits: undefined,
        }),
    },
    {
      name: 'wrong allocation correction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationCorrectionUnits: '98',
        }),
    },
    {
      name: 'allocation correction greater than full provider refund',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          allocationCorrectionUnits: '100',
        }),
    },
    {
      name: 'full provider refund below allocation correction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, { amountUnits: '98' }),
    },
    {
      name: 'mismatched source transaction',
      mutate: (db: MemoryDb, allocation: Row) =>
        seedProviderRefundCorrection(db, allocation, {
          reversalOf: 'transaction:other',
        }),
    },
  ])('refuses a $name payout correction before any allocation write', async ({ mutate }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    mutate(db, allocation)
    const before = {
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      payouts: structuredClone(db.rows('moneyPayouts')),
    }
    const secondInvocationRef = 'operation-invocation:test-money:correction'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-correction',
          qualifiedAt: now + 1,
        }),
      ),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect({
      allocations: db.rows('moneyPayoutAllocations'),
      payouts: db.rows('moneyPayouts'),
    }).toEqual(before)
  })
  it('does not let an unlinked provider refund exclude an allocation', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    seedProviderRefundCorrection(db, allocation, {}, false)
    const secondInvocationRef = 'operation-invocation:test-money:unlinked-refund'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-unlinked-refund',
          qualifiedAt: now + 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '200',
      rakeUnits: '2',
      providerNetUnits: '198',
    })
  })


  it('refunds a held pooled allocation and composes a later same-day allocation', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocationAfterA = structuredClone(db.rows('moneyPayoutAllocations'))
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '0',
      rakeUnits: '0',
      providerNetUnits: '0',
    })
    expect(db.rows('moneyPayoutAllocations')).toEqual(allocationAfterA)
    const refundEntries = db
      .rows('moneyLedgerEntries')
      .filter((row) => row.transactionRef === refundTransactionRef)
    expect(refundEntries).toHaveLength(3)
    const operatorRefund = refundEntries.find(
      (row) => row.entryRef === `${refundTransactionRef}:operator`,
    )
    const providerRefund = refundEntries.find(
      (row) => row.entryRef === `${refundTransactionRef}:provider`,
    )
    const rakeRefund = refundEntries.find(
      (row) => row.entryRef === `${refundTransactionRef}:rake`,
    )
    if (
      operatorRefund === undefined ||
      providerRefund === undefined ||
      rakeRefund === undefined ||
      allocationAfterA[0] === undefined
    )
      throw new Error('refund_entry_fixture_missing')
    expect(operatorRefund).not.toHaveProperty('payoutRef')
    expect(operatorRefund).not.toHaveProperty('allocationRef')
    expect(operatorRefund).not.toHaveProperty('allocationCorrectionUnits')
    expect(rakeRefund).not.toHaveProperty('payoutRef')
    expect(rakeRefund).not.toHaveProperty('allocationRef')
    expect(rakeRefund).not.toHaveProperty('allocationCorrectionUnits')
    expect(providerRefund).toMatchObject({
      payoutRef: allocationAfterA[0].payoutRef,
      allocationRef: allocationAfterA[0].allocationRef,
      allocationCorrectionUnits: allocationAfterA[0].providerNetUnits,
    })

    const secondInvocationRef = 'operation-invocation:test-money:refund-second'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-refund-second',
          qualifiedAt: now + 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocationsAfterB = structuredClone(
      db.rows('moneyPayoutAllocations'),
    )
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })
    expect(
      db
        .rows('moneyPayoutAllocations')
        .find((row) => row.qualifiedUseRef === allocationAfterA[0]?.qualifiedUseRef),
    ).toEqual(allocationAfterA[0])

    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'replayed' })
    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({
          invocationRef: secondInvocationRef,
          attemptRef: secondAttemptRef,
          transactionRef: secondTransactionRef,
          usageRef: `${secondInvocationRef}:usage`,
          responseDigest: 'sha256:response-refund-second',
          qualifiedAt: now + 1,
        }),
      ),
    ).resolves.toMatchObject({ kind: 'replayed' })
    expect(db.rows('moneyPayoutAllocations')).toEqual(allocationsAfterB)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
    })
  })
  it('replays a recovery-adjusted full refund and composes a later same-day allocation', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    const provider = db
      .rows('moneyAccounts')
      .find((row) => row._id === 'account:provider')
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '89'
    db.seed('moneyLedgerEntries', {
      _id: 'entry:provider-recovery',
      entryRef: `${transactionRef}:provider-recovery`,
      accountRef: accountRefForProvider('business:money', 'USD'),
      entryType: 'payout_accrual',
      direction: 'debit',
      amountUnits: '10',
      currency: 'USD',
      exponent: 2,
      transactionRef,
      idempotencyKey: transactionRef,
      invocationRef,
      attemptRef,
      businessId: 'business:money',
      sourceDigest,
      evidenceRefs: ['evidence:money'],
      createdAt: now,
    })
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const allocationAfterA = structuredClone(
      db.rows('moneyPayoutAllocations'),
    )
    expect(allocationAfterA[0]).toMatchObject({
      grossAccrualUnits: '90',
      rakeUnits: '1',
      providerNetUnits: '89',
    })

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    const providerRefund = db
      .rows('moneyLedgerEntries')
      .find((row) => row.entryRef === `${refundTransactionRef}:provider`)
    if (providerRefund === undefined || allocationAfterA[0] === undefined)
      throw new Error('refund_entry_fixture_missing')
    expect(providerRefund).toMatchObject({
      amountUnits: '99',
      allocationCorrectionUnits: '89',
      payoutRef: allocationAfterA[0].payoutRef,
      allocationRef: allocationAfterA[0].allocationRef,
    })
    expect(provider).toMatchObject({
      balanceUnits: '0',
      recoveryDueUnits: '10',
    })
    providerRefund.allocationCorrectionUnits = '88'
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    providerRefund.allocationCorrectionUnits = '89'
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(1)

    const secondInvocationRef = 'operation-invocation:test-money:recovery-second'
    const secondAttemptRef = `${secondInvocationRef}:attempt:1`
    const secondTransactionRef =
      `operation-money:${secondInvocationRef}:${secondAttemptRef}:1`
    seedSecondPaidCharge(
      db,
      secondInvocationRef,
      secondAttemptRef,
      secondTransactionRef,
      now + 1,
    )
    const secondArgs = qualifiedUseArgs({
      invocationRef: secondInvocationRef,
      attemptRef: secondAttemptRef,
      transactionRef: secondTransactionRef,
      usageRef: `${secondInvocationRef}:usage`,
      responseDigest: 'sha256:response-recovery-second',
      qualifiedAt: now + 1,
    })
    await expect(
      qualifiedUseHandler({ db }, secondArgs),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(2)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      grossAccrualUnits: '90',
      rakeUnits: '1',
      providerNetUnits: '89',
    })
    expect(
      db
        .rows('moneyPayoutAllocations')
        .find((row) => row.qualifiedUseRef === allocationAfterA[0]?.qualifiedUseRef),
    ).toEqual(allocationAfterA[0])
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'replayed' })
    await expect(
      qualifiedUseHandler({ db }, secondArgs),
    ).resolves.toMatchObject({ kind: 'replayed' })
  })

  it.each(['transfer_pending', 'outcome_unknown'] as const)(
    'refuses a %s payout refund before any write',
    async (state) => {
      const db = new MemoryDb()
      seedBudget(db)
      seedPaidCharge(db)
      settleSeededChargeBudget(db, credentialId, credentialId, true)
      await expect(
        qualifiedUseHandler({ db }, qualifiedUseArgs()),
      ).resolves.toMatchObject({ kind: 'recorded' })
      const payout = db.rows('moneyPayouts')[0]
      if (payout === undefined) throw new Error('payout_fixture_missing')
      payout.state = state
      const before = {
        accounts: structuredClone(db.rows('moneyAccounts')),
        budgets: structuredClone(db.rows('moneyCredentialBudgetStates')),
        entries: structuredClone(db.rows('moneyLedgerEntries')),
        payouts: structuredClone(db.rows('moneyPayouts')),
        transactions: structuredClone(db.rows('moneyTransactions')),
      }
      await expect(
        reconcileHandler({ db }, reconciliationArgs()),
      ).resolves.toEqual({ kind: 'reconciliation_required' })
      expect({
        accounts: db.rows('moneyAccounts'),
        budgets: db.rows('moneyCredentialBudgetStates'),
        entries: db.rows('moneyLedgerEntries'),
        payouts: db.rows('moneyPayouts'),
        transactions: db.rows('moneyTransactions'),
      }).toEqual(before)
    },
  )

  it('preserves a paid historical payout and creates recoveryDue on refund', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs()),
    ).resolves.toMatchObject({ kind: 'recorded' })
    const payout = db.rows('moneyPayouts')[0]
    const provider = db.rows('moneyAccounts').find(
      (row) => row._id === 'account:provider',
    )
    if (payout === undefined || provider === undefined)
      throw new Error('paid_payout_fixture_missing')
    payout.state = 'paid'
    payout.providerHeldBeforeUnits = '99'
    payout.providerHeldAfterUnits = '99'
    payout.providerPaidBeforeUnits = '0'
    payout.providerPaidAfterUnits = '99'
    provider.balanceUnits = '0'
    const before = structuredClone(db.rows('moneyPayouts'))
    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'settled' })
    expect(db.rows('moneyPayouts')).toEqual(before)
    expect(provider).toMatchObject({ balanceUnits: '0', recoveryDueUnits: '99' })
  })

  it('keeps provider-direct Qualified Use evidence without allocating payout', async () => {
    const db = new MemoryDb()

    await expect(
      qualifiedUseHandler(
        { db },
        qualifiedUseArgs({ transactionRef: undefined }),
      ),
    ).resolves.toMatchObject({ kind: 'recorded' })
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(1)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it.each([
    {
      name: 'business',
      mutate: (_db: MemoryDb) => undefined,
      args: { businessId: 'business:other' },
    },
    {
      name: 'currency',
      mutate: (db: MemoryDb) => {
        const provider = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        if (provider === undefined) throw new Error('provider_entry_missing')
        provider.currency = 'EUR'
      },
      args: {},
    },
    {
      name: 'amount',
      mutate: (db: MemoryDb) => {
        const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
        if (usage === undefined) throw new Error('usage_fixture_missing')
        usage.amountUnits = '101'
      },
      args: {},
    },
    {
      name: 'journal provenance',
      mutate: (db: MemoryDb) => {
        const provider = db.rows('moneyLedgerEntries').find((row) => row._id === 'entry:provider')
        if (provider === undefined) throw new Error('provider_entry_missing')
        provider.sourceDigest = 'sha256:other-source'
      },
      args: {},
    },
    {
      name: 'reversed source',
      mutate: (db: MemoryDb) => {
        const transaction = db.rows('moneyTransactions').find((row) => row._id === 'transaction:charge')
        if (transaction === undefined) throw new Error('transaction_fixture_missing')
        transaction.state = 'reversed'
      },
      args: {},
    },
    {
      name: 'refunded source',
      mutate: (db: MemoryDb) => {
        const usage = db.rows('moneyUsageEvents').find((row) => row._id === 'usage:money')
        if (usage === undefined) throw new Error('usage_fixture_missing')
        usage.chargeState = 'refunded'
      },
      args: {},
    },
  ])('fails closed on $name journal identity drift', async ({ mutate, args }) => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    settleSeededChargeBudget(db, credentialId, credentialId, true)
    mutate(db)
    await expect(
      qualifiedUseHandler({ db }, qualifiedUseArgs(args)),
    ).rejects.toThrow('qualified_use_payout_allocation_invalid')
    expect(db.rows('qualifiedUseReceipts')).toHaveLength(0)
    expect(db.rows('moneyPayoutAllocations')).toHaveLength(0)
    expect(db.rows('moneyPayouts')).toHaveLength(0)
  })

  it('returns none when no accepted charge exists', async () => {
    await expect(
      reconcileHandler({ db: new MemoryDb() }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'none' })
  })

  it('keeps reconciliation required when refund proof fails', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    db.remove('moneyAccounts', (row) => row._id === 'account:provider')

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied', budgetState: 'reserved' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })
  it('refuses a charge whose usage principal or attempt does not match', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db)
    db.remove('moneyUsageEvents', () => true)
    db.seed('moneyUsageEvents', {
      _id: 'usage:mismatch',
      invocationRef,
      attemptRef: 'operation-attempt:other:1',
      principalId: 'principal:other',
      credentialId,
      transactionRef,
      chargeState: 'paid',
    })

    await expect(
      reconcileHandler({ db }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })
})

it.each([
  { name: 'empty dispute ref', override: { disputeRef: '' } },
  { name: 'whitespace dispute ref', override: { disputeRef: '   ' } },
  { name: 'empty source digest', override: { sourceDigest: '' } },
  { name: 'whitespace source digest', override: { sourceDigest: '\t' } },
  { name: 'empty evidence refs', override: { evidenceRefs: [] } },
  { name: 'blank evidence ref', override: { evidenceRefs: [' '] } },
])('rejects $name before refund writes', async ({ override }) => {
  const db = new MemoryDb()
  seedDisputeFixture(db, 'key-a', 'key-a')
  const qualifiedUse = qualifiedUseRef({
    invocationRef,
    attemptRef,
    effectGeneration: 1,
  })
  const args = {
    qualifiedUseRef: qualifiedUse,
    disputeRef: 'dispute:test',
    sourceDigest: 'sha256:dispute-source',
    evidenceRefs: ['dispute:evidence:1'],
    observedAt: now,
    ...override,
  }
  const insert = vi.spyOn(db, 'insert')
  const patch = vi.spyOn(db, 'patch')
  try {
    await expect(
      disputeHandler({ db }, args),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'charge_reconciliation_required',
      retryable: false,
    })
    expect(insert).not.toHaveBeenCalled()
    expect(patch).not.toHaveBeenCalled()
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
    expect(
      db.rows('moneyLedgerEntries').filter((row) => row.entryType === 'refund'),
    ).toHaveLength(0)
  } finally {
    insert.mockRestore()
    patch.mockRestore()
  }
})


describe('exhausted Workpool completion money fence', () => {
  it('settles an accepted charge before projecting refusal', async () => {
    const db = new MemoryDb()
    seedInvocation(db)
    seedBudget(db)
    seedPaidCharge(db)

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'pre_release_failed' },
    })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'reversed' })
  })

  it('cleanly refuses exhausted work with no charge', async () => {
    const db = new MemoryDb()
    seedInvocation(db)

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'pre_release_failed' },
    })
  })

  it('never refunds when canonical control proves release possible', async () => {
    const db = new MemoryDb()
    seedInvocation(db)
    seedBudget(db)
    seedPaidCharge(db)
    db.seed('actionInvocationControls', {
      _id: 'control:money',
      invocationRef,
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      control: { control: { state: 'leased', release: 'possibly_released' } },
    })

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({ state: 'reconciliation_required' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied' })
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'refund'),
    ).toHaveLength(0)
  })

  it('projects reconciliation_required when an accepted charge cannot be refunded', async () => {
    const db = new MemoryDb()
    seedInvocation(db)
    seedBudget(db)
    seedPaidCharge(db)
    db.remove('moneyAccounts', (row) => row._id === 'account:provider')

    await expect(
      completionHandler(completionContext(db), exhausted),
    ).resolves.toBeNull()
    expect(
      db
        .rows('capabilityOperationInvocations')
        .find((row) => row._id === 'invocation:money'),
    ).toMatchObject({ state: 'reconciliation_required' })
    expect(
      db
        .rows('moneyTransactions')
        .find((row) => row._id === 'transaction:charge'),
    ).toMatchObject({ state: 'applied' })
  })
})

import { RateLimiter } from '@convex-dev/rate-limiter'
import { describe, expect, it, vi } from 'vitest'

import { completeWork } from '../../../convex/capabilityOperationInvocations'
import {
  authorizeInvocationCharge,
  readOperatorAccountVersion,
  reconcileInvocationCharge,
} from '../../../convex/moneyLedger'
import {
  accountRefForOperator,
  accountRefForProvider,
  accountRefForRake,
} from '@/modules/money/public'
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
type QueryBuilder = { eq: (field: string, value: unknown) => QueryBuilder }
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
const completionExport = completeWork as unknown as HandlerExport
const accountVersionExport = readOperatorAccountVersion as unknown as HandlerExport
const authorizeHandler = authorizeExport._handler
const accountVersionHandler = accountVersionExport._handler
const reconcileHandler = reconcileExport._handler
const completionHandler = completionExport._handler
const invocationRef = 'operation-invocation:test-money'
const principalId = 'principal:test-money'
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
): Record<string, unknown> {
  return {
    invocationRef,
    principalId,
    credentialId,
    attemptRef,
    transactionRef,
    inputDigest,
    outcome,
    refundTransactionRef,
    refundIdempotencyKey: refundTransactionRef,
    refundInputDigest: canonicalDigest({
      format: 'operation-money-refund:v1',
      invocationRef,
      attemptRef,
      inputDigest,
      transactionRef,
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
      updatedAt: now,
      ...row,
    })
  account({
    _id: 'authorization:operator',
    accountRef: accountRefForOperator(principalId, 'USD'),
    accountKind: 'operator_credit',
    principalId,
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
    operatorAccountRef: accountRefForOperator(principalId, 'USD'),
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

function seedPaidCharge(
  db: MemoryDb,
  state: 'applied' | 'outcome_unknown' = 'applied',
): void {
  db.seed('moneyUsageEvents', {
    _id: 'usage:money',
    usageRef: `${invocationRef}:usage`,
    principalId,
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
      updatedAt: now,
      ...row,
    })
  account({
    _id: 'account:operator',
    accountRef: accountRefForOperator(principalId, 'USD'),
    accountKind: 'operator_credit',
    principalId,
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
    accountRef: accountRefForOperator(principalId, 'USD'),
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
      accountRef: accountRefForOperator('principal:version', 'USD'),
      accountKind: 'operator_credit',
      principalId: 'principal:version',
      currency: 'USD',
      exponent: 2,
      balanceUnits: '1000',
      version: 1,
      state: 'active',
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      accountVersionHandler(
        { db },
        { principalId: 'principal:version', currency: 'USD' },
      ),
    ).resolves.toBe(1)
    await expect(
      accountVersionHandler(
        { db },
        { principalId: 'principal:other', currency: 'USD' },
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
  it('accrues a released charge into the current period after the prior period is paid', async () => {
    const db = new MemoryDb()
    seedBudget(db)
    seedPaidCharge(db, 'outcome_unknown')
    const payoutRef = canonicalDigest({
      format: 'money-payout-period:v1',
      businessId: 'business:money',
      currency: 'USD',
      periodStart: '1969-12-01',
      periodEnd: '1969-12-31',
    })
    db.seed('moneyPayouts', {
      _id: 'payout:paid',
      payoutRef,
      businessId: 'business:money',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '100',
      rakeUnits: '1',
      providerNetUnits: '99',
      minimumPayoutUnits: '0',
      state: 'paid',
      periodStart: '1969-12-01',
      periodEnd: '1969-12-31',
      idempotencyKey: payoutRef,
      providerHeldBeforeUnits: '99',
      providerHeldAfterUnits: '0',
      providerPaidBeforeUnits: '0',
      providerPaidAfterUnits: '99',
      createdAt: now,
      updatedAt: now,
    })

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
    expect(db.rows('moneyPayouts')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: 'payout:paid',
          state: 'paid',
          grossAccrualUnits: '100',
        }),
        expect.objectContaining({
          state: 'held_threshold',
          periodStart: '1970-01-01',
          periodEnd: '1970-01-31',
          grossAccrualUnits: '100',
          providerNetUnits: '99',
        }),
      ]),
    )
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

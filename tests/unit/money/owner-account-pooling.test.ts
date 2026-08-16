import { describe, expect, it, vi } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  applyTopup,
  authorizePaidCharge,
  createLedgerState,
  legacyPerKeyAccountRef,
  type BeginTransactionInput,
  type MoneyAccount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))
vi.mock('../../../src/modules/money/public', async () => {
  const actual = await vi.importActual<typeof import('@/modules/money/public')>('@/modules/money/public')
  return {
    ...actual,
    evaluateLiveMoneyGate: () => ({
      kind: 'accepted' as const,
      policyId: 'test-money-policy',
    }),
  }
})

import { authorizeInvocationCharge, reserveCreditTopup } from '../../../convex/moneyLedger'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '@/modules/capability-supply/development-published-operation-evidence'
import {
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'

const ownerId = 'owner_pool_1'
const keyOnePrincipal = 'clerk_api_key:key-a'
const keyTwoPrincipal = 'clerk_api_key:key-b'

const pooledAccount: MoneyAccount = {
  accountRef: accountRefForOwner(ownerId, 'USD'),
  accountKind: 'operator_credit',
  accountId: ownerId,
  balance: amount('USD', '1000', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const providerAccount: MoneyAccount = {
  accountRef: accountRefForProvider('business-1', 'USD'),
  accountKind: 'provider_earnings',
  businessId: 'business-1',
  balance: amount('USD', '0', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const rakeAccount: MoneyAccount = {
  accountRef: accountRefForRake('USD'),
  accountKind: 'ae_rake',
  balance: amount('USD', '0', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

function chargeInput(overrides: Partial<Parameters<typeof authorizePaidCharge>[0]> = {}) {
  return {
    state: createLedgerState([pooledAccount, providerAccount, rakeAccount]),
    transaction: transaction({ principalId: keyOnePrincipal }),
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business-1', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    grossAmount: amount('USD', '300', 2),
    rakeConfig: { rakeBps: 1_000 },
    priceDigest: 'price-1',
    principalId: keyOnePrincipal,
    accountId: ownerId,
    credentialId: 'key-a',
    serviceRef: 'service-1',
    offeringRef: 'offering-1',
    businessId: 'business-1',
    invocationRef: 'inv-1',
    attemptRef: 'attempt-1',
    operationKey: 'operation-1',
    sourceDigest: 'source-charge',
    evidenceRefs: ['invocation:1'],
    observedAt: 11,
    ...overrides,
  }
}

describe('owner account pooling', () => {
  it('draws two key charges from one pooled owner balance', () => {
    const first = authorizePaidCharge(chargeInput({
      transaction: transaction({ principalId: keyOnePrincipal, transactionRef: 'charge-1', idempotencyKey: 'charge-1' }),
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      credentialId: 'key-a',
    }))
    expect(first.result).toMatchObject({ kind: 'accepted', chargeState: 'paid' })

    const second = authorizePaidCharge(chargeInput({
      state: first.state,
      transaction: transaction({ principalId: keyTwoPrincipal, transactionRef: 'charge-2', idempotencyKey: 'charge-2', expectedAccountVersion: 1 }),
      invocationRef: 'inv-2',
      attemptRef: 'attempt-2',
      operationKey: 'operation-2',
      principalId: keyTwoPrincipal,
      credentialId: 'key-b',
    }))
    expect(second.result).toMatchObject({ kind: 'accepted', chargeState: 'paid' })
    expect(second.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(amount('USD', '400', 2))
  })

  it('keeps per-key usage attribution after pooling', () => {
    const charged = authorizePaidCharge(chargeInput())
    expect(charged.result.kind).toBe('accepted')
    const keyAUsage = charged.state.usageEvents.filter((event) => event.credentialId === 'key-a')
    const keyBUsage = authorizePaidCharge(chargeInput({
      state: charged.state,
      transaction: transaction({ principalId: keyTwoPrincipal, transactionRef: 'charge-2', idempotencyKey: 'charge-2', expectedAccountVersion: 1 }),
      invocationRef: 'inv-2',
      attemptRef: 'attempt-2',
      operationKey: 'operation-2',
      principalId: keyTwoPrincipal,
      credentialId: 'key-b',
    })).state.usageEvents.filter((event) => event.credentialId === 'key-b')
    expect(keyAUsage).toHaveLength(1)
    expect(keyBUsage).toHaveLength(1)
    expect(keyAUsage[0]?.principalId).toBe(keyOnePrincipal)
    expect(keyBUsage[0]?.principalId).toBe(keyTwoPrincipal)
    expect(keyAUsage[0]?.accountId).toBe(ownerId)
    expect(keyBUsage[0]?.accountId).toBe(ownerId)
  })

  it('refuses charges against an account that does not match the owner wallet', () => {
    const result = authorizePaidCharge(chargeInput({ accountId: 'other-owner' }))
    expect(result.result).toMatchObject({ kind: 'refused', code: 'billing_identity_mismatch' })
    expect(result.state.transactions).toHaveLength(0)
  })

  it('tops up the owner wallet without binding to a single key principal', () => {
    const topup = applyTopup({
      state: createLedgerState([{ ...pooledAccount, balance: amount('USD', '0', 2) }, providerAccount, rakeAccount]),
      transaction: { ...transaction({ principalId: keyOnePrincipal, transactionRef: 'topup-1', kind: 'topup', idempotencyKey: 'topup-1', inputDigest: 'topup-input', expectedAccountVersion: 0 }), accountId: ownerId },
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:1'],
    })
    expect(topup.result.kind).toBe('accepted')
    expect(topup.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(amount('USD', '1000', 2))
  })
})

type ConvexRow = Record<string, unknown> & { _id: string }
type ConvexQueryBuilder = { eq: (field: string, value: unknown) => ConvexQueryBuilder }
type ConvexQuery = {
  withIndex: (
    name: string,
    build: (query: ConvexQueryBuilder) => ConvexQueryBuilder,
  ) => ConvexQuery
  unique: () => Promise<ConvexRow | null>
}

class ConvexMemoryDb {
  private readonly tables = new Map<string, ConvexRow[]>()

  seed(table: string, row: ConvexRow): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), row])
  }

  rows(table: string): ConvexRow[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): ConvexQuery {
    const filters: Array<(row: ConvexRow) => boolean> = []
    const query: ConvexQuery = {
      withIndex: (_name, build) => {
        const builder: ConvexQueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const rows = (this.tables.get(table) ?? []).filter((row) =>
          filters.every((filter) => filter(row)),
        )
        if (rows.length > 1) throw new Error('expected_unique')
        return rows[0] ?? null
      },
    }
    return query
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    this.seed(table, { ...value, _id: id })
    return id
  }

  async get(id: string): Promise<ConvexRow | null> {
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

type ConvexHandler = (
  ctx: {
    db: ConvexMemoryDb
    auth: { getUserIdentity: () => Promise<{ subject: string; tokenIdentifier: string } | null> }
  },
  args: Record<string, unknown>,
) => Promise<unknown>
type ConvexHandlerExport = { _handler: ConvexHandler }

const reserveTopup = (reserveCreditTopup as unknown as ConvexHandlerExport)._handler
const authorizeCharge = (authorizeInvocationCharge as unknown as ConvexHandlerExport)._handler

const convexNow = 1_000
const convexInvocationRef = 'operation-invocation:owner-pool'
const convexAttemptRef = `operation-attempt:${convexInvocationRef}:1`
const convexTransactionRef = `operation-money:${convexInvocationRef}:${convexAttemptRef}:1`
const convexInput = { symbol: 'BTC', convert: 'USD' }
const convexInputDigest = canonicalDigest(convexInput)
const convexAuthorizationAmount = { currency: 'USD', units: '0', exponent: 2 }
const convexAuthorizationMaximumSpend = { currency: 'USD', units: '0', exponent: 2 }
const convexAuthorizationPriceDigest = canonicalDigest({
  version: 'pricing:v2',
  unit: 'call',
  paidAmount: convexAuthorizationAmount,
})
const convexAuthorizationOperation: PublishedOperation = (() => {
  const original = buildDevelopmentPublishedOperationEvidence().operation
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: convexAuthorizationAmount,
  }
  const identity = {
    ...original.identity,
    businessId: 'business-1',
    offeringId: 'offering-1',
    price: { kind: 'fixed' as const, amount: convexAuthorizationAmount },
    priceDigest: convexAuthorizationPriceDigest,
    pricingConfig,
  }
  return {
    ...original,
    operationId: 'operation:owner-pool',
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest: convexAuthorizationPriceDigest,
    pricingConfig,
    offering: {
      ...original.offering,
      businessId: 'business-1',
      offeringId: 'offering-1',
      presentation: {
        ...original.offering.presentation,
        price: { kind: 'fixed' as const, amount: convexAuthorizationAmount },
      },
    },
    readiness: {
      ...original.readiness,
      evidenceRefs: ['evidence:owner-pool'],
    },
  } as PublishedOperation
})()
const convexAuthorizationOperationRef = createPublicOperationRef({
  operationId: convexAuthorizationOperation.operationId,
  publicationRef: convexAuthorizationOperation.identity.publicationRef,
  publicationRevision: convexAuthorizationOperation.identity.publicationRevision,
  contractRef: convexAuthorizationOperation.contract.ref,
})
const convexAuthorizationDescriptor = materializeRuntimePublishedOperation(
  convexAuthorizationOperation,
)
const convexAuthorizationBasis = {
  kind: 'approve_each' as const,
  authorityRef: 'authority:owner-pool',
}
const convexAuthorizationExpiresAt = new Date(convexNow + 60_000).toISOString()
const convexAuthorizationAuthorityMaterial = {
  format: 'operation-invoke-authority:v1' as const,
  invocationRef: convexInvocationRef,
  operationRef: convexAuthorizationOperationRef,
  inputDigest: convexInputDigest,
  grantRef: 'grant:owner-pool',
  grantGeneration: 1,
  grantDigest: 'sha256:policy-owner-pool',
  reference: convexAuthorizationBasis.authorityRef,
  targetDigest: canonicalDigest(convexAuthorizationOperation.identity as never),
  consequence: convexAuthorizationDescriptor.consequenceClass,
  limits: { amount: convexAuthorizationAmount },
  expiresAt: convexAuthorizationExpiresAt,
  acceptedBasis: convexAuthorizationBasis,
}
const convexAuthorizationAuthority = {
  ...convexAuthorizationAuthorityMaterial,
  decisionDigest: canonicalDigest(convexAuthorizationAuthorityMaterial as never),
}

function seedLegacyPerKeyAccount(
  db: ConvexMemoryDb,
  balanceUnits: string,
): void {
  db.seed('moneyAccounts', {
    _id: 'moneyAccounts:legacy',
    accountRef: legacyPerKeyAccountRef(keyOnePrincipal, 'USD'),
    accountKind: 'operator_credit',
    accountId: 'key-a',
    currency: 'USD',
    exponent: 2,
    balanceUnits,
    version: 0,
    state: 'active',
    createdAt: convexNow,
    updatedAt: convexNow,
  })
}

function seedConvexChargeFixture(db: ConvexMemoryDb): void {
  const leaseOwner = `operation-worker:${convexInvocationRef}`
  const canonicalAuthorityBinding = {
    reference: convexAuthorizationAuthority.reference,
    invocationRef: convexInvocationRef,
    actor: { callerRef: 'key-a', principalRef: keyOnePrincipal },
    origin: { kind: 'standalone' as const, callerRef: 'key-a', principalRef: keyOnePrincipal },
    invocationVersion: 1,
    actionId: convexAuthorizationOperation.operationId,
    contractVersion: convexAuthorizationDescriptor.version,
    digest: convexAuthorizationAuthority.decisionDigest,
    targetDigest: convexAuthorizationAuthority.targetDigest,
    consequence: convexAuthorizationAuthority.consequence,
    limits: convexAuthorizationAuthority.limits,
    expiresAt: convexAuthorizationAuthority.expiresAt,
    acceptedBasis: convexAuthorizationBasis,
  }
  db.seed('capabilityOperationInvocations', {
    _id: 'authorization:invocation',
    invocationRef: convexInvocationRef,
    principalId: keyOnePrincipal,
    ownerId,
    credentialId: 'key-a',
    applicationRef: 'application:owner-pool',
    environment: 'sandbox',
    state: 'pending',
    operationRef: convexAuthorizationOperationRef,
    idempotencyKey: 'idempotency:owner-pool',
    inputDigest: convexInputDigest,
    requestDigest: canonicalDigest({
      operationRef: convexAuthorizationOperationRef,
      input: convexInput,
    } as never),
    grantRef: 'grant:owner-pool',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-owner-pool',
    grantExpiresAt: convexNow + 60_000,
    operationJson: JSON.stringify(convexAuthorizationOperation),
    inputJson: JSON.stringify(convexInput),
    authority: convexAuthorizationAuthority,
    attemptRef: convexAttemptRef,
    createdAt: convexNow,
    updatedAt: convexNow,
  })
  db.seed('agentAccessPrincipals', {
    _id: 'authorization:principal',
    principalId: keyOnePrincipal,
    ownerId,
    credentialId: 'key-a',
    applicationRef: 'application:owner-pool',
    environment: 'sandbox',
    scopes: ['market.operations.invoke'],
    authorityMode: 'approve_each',
    grantGeneration: 1,
    policyDigest: 'sha256:policy-owner-pool',
    lifecycle: 'active',
    expiresAt: convexNow + 60_000,
    recordedAt: convexNow,
    lastSeenAt: convexNow,
  })
  db.seed('capabilityOfferings', {
    _id: 'offering:owner-pool',
    offeringId: 'offering-1',
    businessId: 'business-1',
    status: 'active',
    presentation: { price: { kind: 'fixed', amount: convexAuthorizationAmount } },
  })
  db.seed('agentAccessGrants', {
    _id: 'grant:owner-pool',
    grantRef: 'grant:owner-pool',
    principalId: keyOnePrincipal,
    ownerId,
    applicationRef: 'application:owner-pool',
    credentialId: 'key-a',
    lifecycle: 'active',
    environment: 'sandbox',
    authorityMode: 'approve_each',
    generation: 1,
    policyDigest: 'sha256:policy-owner-pool',
    budgetPolicyRef: 'budget:owner-pool',
    expiresAt: convexNow + 60_000,
    policy: {
      format: 'ae.agent-access-policy:v1',
      operationAccess: 'all_admitted',
      rate: {
        ratePolicyRef: 'rate:owner-pool',
        generation: 1,
        maximumCallsPerMinute: 10,
        maximumCallsPerHour: 100,
      },
      budget: {
        budgetPolicyRef: 'budget:owner-pool',
        currency: 'USD',
        exponent: 2,
        generation: 1,
        maximumSpendPerInvocation: convexAuthorizationMaximumSpend,
        maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
        maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
        maximumConcurrentInvocations: 2,
      },
    },
  })
  db.seed('actionInvocationControls', {
    _id: 'authorization:control',
    invocationRef: convexInvocationRef,
    invocationVersion: 1,
    sourceRef: `operation-invocation-source:${convexInvocationRef}`,
    preparedMaterialDigest: convexInputDigest,
    preparedTargetDigest: convexAuthorizationAuthority.targetDigest,
    consequence: convexAuthorizationAuthority.consequence,
    dataLimitSummary: convexAuthorizationAuthority.limits,
    authorityReference: convexAuthorizationAuthority.reference,
    authorityBinding: canonicalAuthorityBinding,
    authorityDecisionAt: convexAuthorizationExpiresAt,
    currentAttemptRef: convexAttemptRef,
    currentEffectGeneration: 1,
    currentLeaseOwner: leaseOwner,
    currentLeaseExpiresAt: convexAuthorizationExpiresAt,
    updatedAt: convexAuthorizationExpiresAt,
    control: {
      invocationRef: convexInvocationRef,
      invocationVersion: 1,
      origin: { kind: 'standalone' as const, callerRef: 'key-a', principalRef: keyOnePrincipal },
      owner: { callerRef: 'key-a', principalRef: keyOnePrincipal },
      action: {
        id: convexAuthorizationOperation.operationId,
        contractVersion: convexAuthorizationDescriptor.version,
      },
      desired: { state: 'invoke' as const },
      authority: {
        reference: convexAuthorizationAuthority.reference,
        expiresAt: convexAuthorizationAuthority.expiresAt,
      },
      acceptedAuthority: convexAuthorizationBasis,
      freshness: { state: 'current' as const, observedAt: convexAuthorizationExpiresAt },
      control: {
        state: 'leased' as const,
        attemptRef: convexAttemptRef,
        leaseOwner,
        effectGeneration: 1,
        leaseExpiresAt: convexAuthorizationExpiresAt,
        release: 'not_started' as const,
      },
    },
  })
  db.seed('actionInvocationAttempts', {
    _id: 'authorization:attempt',
    invocationRef: convexInvocationRef,
    attemptRef: convexAttemptRef,
    attemptNumber: 1,
    effectGeneration: 1,
    actor: { callerRef: 'key-a', principalRef: keyOnePrincipal },
    idempotency: {
      operationKey: convexAuthorizationOperationRef,
      materialInputDigest: convexInputDigest,
      effectIdentity: canonicalDigest({
        actionId: convexAuthorizationOperation.operationId,
        operationKey: convexAuthorizationOperationRef,
        materialInputDigest: convexInputDigest,
      } as never),
    },
    lease: { owner: leaseOwner, expiresAt: convexAuthorizationExpiresAt },
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
    recordedAt: convexAuthorizationExpiresAt,
  })
  const budgetState = {
    principalId: keyOnePrincipal,
    credentialId: 'key-a',
    budgetPolicyRef: 'budget:owner-pool',
    environment: 'sandbox',
    generation: 1,
    currency: 'USD',
    exponent: 2,
    settledUnits: '0',
    reservedUnits: '0',
    reservedCount: 0,
    version: 1,
    updatedAt: convexNow,
  }
  db.seed('moneyCredentialBudgetStates', {
    ...budgetState,
    _id: 'authorization:day',
    windowKind: 'day',
    windowStart: '1970-01-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...budgetState,
    _id: 'authorization:month',
    windowKind: 'month',
    windowStart: '1970-01',
  })
  db.seed('moneyCredentialBudgetStates', {
    ...budgetState,
    _id: 'authorization:concurrency',
    windowKind: 'concurrency',
    windowStart: 'all',
  })
  const account = (row: Record<string, unknown> & { _id: string }): void =>
    db.seed('moneyAccounts', {
      state: 'active',
      currency: 'USD',
      exponent: 2,
      version: 1,
      createdAt: convexNow,
      updatedAt: convexNow,
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
    accountRef: accountRefForProvider('business-1', 'USD'),
    accountKind: 'provider_earnings',
    businessId: 'business-1',
    balanceUnits: '0',
  })
  account({
    _id: 'authorization:rake',
    accountRef: accountRefForRake('USD'),
    accountKind: 'ae_rake',
    balanceUnits: '0',
  })
}

function convexAuthorizationArgs(): Record<string, unknown> {
  return {
    principalId: keyOnePrincipal,
    amount: convexAuthorizationAmount,
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business-1', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    transactionRef: convexTransactionRef,
    idempotencyKey: convexTransactionRef,
    inputDigest: convexInputDigest,
    expectedAccountVersion: 1,
    rakeBps: 1_000,
    priceDigest: convexAuthorizationPriceDigest,
    priceSourceDigest: convexAuthorizationPriceDigest,
    authorityMaximumSpend: convexAuthorizationMaximumSpend,
    credentialId: 'key-a',
    applicationRef: 'application:owner-pool',
    serviceRef: convexAuthorizationOperation.operationId,
    offeringRef: convexAuthorizationOperation.identity.offeringId,
    businessId: convexAuthorizationOperation.identity.businessId,
    invocationRef: convexInvocationRef,
    attemptRef: convexAttemptRef,
    operationKey: convexAuthorizationOperationRef,
    sourceDigest: convexAuthorizationOperation.materialDigest,
    evidenceRefs: [...convexAuthorizationOperation.readiness.evidenceRefs],
    observedAt: convexNow,
    freeTier: false,
    credentialBudgetGrantRef: 'grant:owner-pool',
    credentialBudgetGeneration: 1,
  }
}

function seedConvexTopupPrincipal(db: ConvexMemoryDb): void {
  db.seed('agentAccessPrincipals', {
    _id: 'agentAccessPrincipals:1',
    principalId: keyOnePrincipal,
    ownerId,
    credentialId: 'key-a',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    scopes: [],
    authorityMode: 'inspect_only',
    grantGeneration: 1,
    policyDigest: 'policy:owner-pool',
    lifecycle: 'active',
    recordedAt: convexNow,
    lastSeenAt: convexNow,
  })
}

function convexTopupArgs(): Record<string, unknown> {
  return {
    principalId: keyOnePrincipal,
    accountRef: accountRefForOwner(ownerId, 'USD'),
    amount: { currency: 'USD', units: '1000', exponent: 2 },
    commandRef: 'command-owner-pool-1',
    idempotencyKey: 'topup-owner-pool-1',
    inputDigest: 'sha256:input-owner-pool-1',
    successReturnRef: 'https://app.example.test/agent-access',
    operationKey: 'money:test',
    correlationId: 'money:test:1',
  }
}

const convexAuth = {
  getUserIdentity: async () => ({ subject: ownerId, tokenIdentifier: keyOnePrincipal }),
}

describe('legacy per-key balance guard', () => {
  it('refuses authorizeInvocationCharge when a legacy per-key wallet has a non-zero balance', async () => {
    const db = new ConvexMemoryDb()
    seedConvexChargeFixture(db)
    seedLegacyPerKeyAccount(db, '500')

    await expect(
      authorizeCharge({ db, auth: convexAuth }, convexAuthorizationArgs()),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
  })

  it('refuses reserveCreditTopup when a legacy per-key wallet has a non-zero balance', async () => {
    const db = new ConvexMemoryDb()
    seedConvexTopupPrincipal(db)
    seedLegacyPerKeyAccount(db, '500')

    await expect(
      reserveTopup({ db, auth: convexAuth }, convexTopupArgs()),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
  })

  it('does not block authorizeInvocationCharge or reserveCreditTopup when the legacy per-key wallet has a zero balance', async () => {
    const chargeDb = new ConvexMemoryDb()
    seedConvexChargeFixture(chargeDb)
    seedLegacyPerKeyAccount(chargeDb, '0')
    await expect(
      authorizeCharge({ db: chargeDb, auth: convexAuth }, convexAuthorizationArgs()),
    ).resolves.toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })

    const topupDb = new ConvexMemoryDb()
    seedConvexTopupPrincipal(topupDb)
    seedLegacyPerKeyAccount(topupDb, '0')
    await expect(
      reserveTopup({ db: topupDb, auth: convexAuth }, convexTopupArgs()),
    ).resolves.toMatchObject({ kind: 'accepted', command: { state: 'pending' } })
  })

  it('does not block authorizeInvocationCharge or reserveCreditTopup when no legacy per-key wallet exists', async () => {
    const chargeDb = new ConvexMemoryDb()
    seedConvexChargeFixture(chargeDb)
    await expect(
      authorizeCharge({ db: chargeDb, auth: convexAuth }, convexAuthorizationArgs()),
    ).resolves.toMatchObject({ kind: 'accepted', chargeState: 'free_tier' })

    const topupDb = new ConvexMemoryDb()
    seedConvexTopupPrincipal(topupDb)
    await expect(
      reserveTopup({ db: topupDb, auth: convexAuth }, convexTopupArgs()),
    ).resolves.toMatchObject({ kind: 'accepted', command: { state: 'pending' } })
  })
})

function transaction(overrides: Partial<BeginTransactionInput> = {}): BeginTransactionInput {
  return {
    transactionRef: 'charge-1',
    kind: 'charge',
    idempotencyKey: 'operation-1:attempt-1:1',
    inputDigest: 'input-1',
    principalId: keyOnePrincipal,
    currency: 'USD',
    expectedAccountVersion: 0,
    now: 10,
    ...overrides,
  }
}

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertAgentAccessRateAdmission: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: true })),
}))

vi.mock('../../../convex/lib/rateLimit', () => ({
  assertAgentAccessRateAdmission: mocks.assertAgentAccessRateAdmission,
}))

beforeEach(() => {
  mocks.assertAgentAccessRateAdmission.mockClear()
  mocks.assertAgentAccessRateAdmission.mockResolvedValue({ ok: true })
})

import { abandon, reserve } from '../../../convex/capabilityOperationInvocations'
import { invokeArgs } from '../../../convex/lib/operationInvocations/contracts'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type Row = Record<string, unknown> & { _id: string }
type Filter = (row: Row) => boolean
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  gt: (field: string, value: number) => QueryBuilder
  lte: (field: string, value: number) => QueryBuilder
}

type Query = {
  withIndex: (name: string, build: (query: QueryBuilder) => QueryBuilder) => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  seed(table: string, row: Row): void {
    const rows = this.tables.get(table) ?? []
    rows.push(row)
    this.tables.set(table, rows)
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    let filters: Filter[] = []
    const rows = () => (this.tables.get(table) ?? []).filter((row) => filters.every((filter) => filter(row)))
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
          gt: (field, value) => {
            filters.push((row) => typeof row[field] === 'number' && row[field] > value)
            return builder
          },
          lte: (field, value) => {
            filters.push((row) => typeof row[field] === 'number' && row[field] <= value)
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const matches = rows()
        if (matches.length > 1) throw new Error('expected_unique')
        return matches[0] ?? null
      },
      take: async (limit) => rows().slice(0, limit),
    }
    return query
  }

  async insert(table: string, row: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    this.seed(table, { ...row, _id: id })
    return id
  }
  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
  }
  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = await this.get(id)
    if (row === null) throw new Error('row_not_found')
    Object.assign(row, value)
  }
  async delete(id: string): Promise<void> {
    for (const [table, rows] of this.tables) {
      const remaining = rows.filter((row) => row._id !== id)
      if (remaining.length !== rows.length) this.tables.set(table, remaining)
    }
  }
}

type HandlerContext = {
  db: MemoryDb
  runMutation: (reference: unknown, args: Record<string, unknown>) => Promise<unknown>
}
type Handler = (ctx: HandlerContext, args: Record<string, unknown>) => Promise<unknown>
const reserveHandler = (reserve as unknown as { _handler: Handler })._handler
const abandonHandler = (abandon as unknown as { _handler: Handler })._handler

const baseOperation = buildDevelopmentPublishedOperationEvidence().operation
const baseOperationJson = JSON.stringify(baseOperation)
const now = 100_000
const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const OTHER_OPERATION_REF = `operation:v1:${'b'.repeat(64)}`
const BASE_POLICY = {
  format: 'ae.agent-access-policy:v1' as const,
  operationAccess: 'all_admitted' as const,
  environment: 'sandbox' as const,
  budget: {
    budgetPolicyRef: 'budget:reservation',
    generation: 1,
    currency: 'USD',
    exponent: 2,
    maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
    maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
    maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
    maximumConcurrentInvocations: 2,
  },
  rate: {
    ratePolicyRef: 'rate:reservation',
    generation: 1,
    maximumCallsPerMinute: 10,
    maximumCallsPerHour: 100,
  },
}
const BASE_POLICY_DIGEST = canonicalDigest(BASE_POLICY as never)

function selectedGrantOverrides(operationRefs: readonly string[]): Record<string, unknown> {
  const policy = {
    ...BASE_POLICY,
    format: 'ae.agent-access-policy:v2' as const,
    operationAccess: 'selected_operations' as const,
    operationRefs: [...operationRefs].sort(),
  }
  return {
    format: 'ae.agent-access-grant:v2',
    operationAccess: 'selected_operations',
    operationRefs: [...policy.operationRefs],
    policy,
    policyDigest: canonicalDigest(policy as never),
  }
}

const grant = (overrides: Record<string, unknown> = {}): Row => {
  const { policy: policyOverrideValue, policyDigest: policyDigestOverride, ...grantOverrides } = overrides
  const policyOverride = policyOverrideValue as Partial<typeof BASE_POLICY> | undefined
  const policy = {
    ...BASE_POLICY,
    ...policyOverride,
    budget: { ...BASE_POLICY.budget, ...policyOverride?.budget },
    rate: { ...BASE_POLICY.rate, ...policyOverride?.rate },
  }
  return {
    _id: 'agentAccessGrants:one',
    _creationTime: now - 1_000,
    format: 'ae.agent-access-grant:v1',
    grantRef: 'grant:one',
    principalId: 'principal:one',
    ownerId: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    environment: 'sandbox',
    operationAccess: 'all_admitted',
    authorityMode: 'approve_each',
    lifecycle: 'active',
    generation: 1,
    policy,
    budgetPolicyRef: policy.budget.budgetPolicyRef,
    ratePolicyRef: policy.rate.ratePolicyRef,
    policyDigest: policyDigestOverride ?? canonicalDigest(policy as never),
    createdAt: now - 1_000,
    updatedAt: now - 1_000,
    expiresAt: now + 60_000,
    ...grantOverrides,
  }
}

const args = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  commitmentRef: 'operation-commitment:v1:one',
  invocationRef: 'operation-invocation:v1:one',
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  grantRef: 'grant:one',
  environment: 'sandbox',
  operationRef: OPERATION_REF,
  idempotencyKey: 'idempotency:one',
  inputDigest: 'sha256:input-one',
  requestDigest: 'sha256:request-one',
  grantGeneration: 1,
  policyDigest: BASE_POLICY_DIGEST,
  grantExpiresAt: now + 60_000,
  operationJson: baseOperationJson,
  inputJson: '{}',
  now,
  ...overrides,
})

function commitment(policyDigest: string = BASE_POLICY_DIGEST): Row {
  return {
    _id: 'capabilityOperationCommitments:one',
    commitmentRef: 'operation-commitment:v1:one',
    principalId: 'principal:one',
    accountRef: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    environment: 'sandbox',
    grantRef: 'grant:one',
    grantGeneration: 1,
    grantPolicyDigest: policyDigest,
    grantExpiresAt: now + 60_000,
    operationRef: OPERATION_REF,
    operationRevision: 1,
    operationMaterialDigest: baseOperation.materialDigest,
    currentOperationDigest: 'sha256:current-operation',
    operationJson: baseOperationJson,
    normalizedInputJson: '{}',
    inputDigest: 'sha256:input-one',
    pricingJson: JSON.stringify({ kind: 'fixed_aud', currency: 'AUD', exponent: 6, amountUnits: '0' }),
    pricingDigest: 'sha256:pricing',
    decisionAudUnits: '0',
    budgetPolicyRef: 'budget:reservation',
    budgetGeneration: 1,
    maximumSpendPerInvocationUnits: '0',
    balanceLedgerAccountRef: 'ledger:aud:customer-prepayment:owner:one',
    balanceVersion: 0,
    balanceChecksum: 'sha256:balance',
    balanceUnits: '0',
    commercialPolicyRefs: ['sandbox-fixture:managed_x402_deterministic_v1'],
    commercialPolicyDigest: 'sha256:sandbox-commercial-policy',
    evidenceDigest: 'sha256:commitment-evidence',
    state: 'issued',
    expiresAt: Number.MAX_SAFE_INTEGER,
    createdAt: now - 1,
    updatedAt: now - 1,
  }
}
const canaryEnvelope = (overrides: Record<string, unknown> = {}) => ({
  executionPurpose: 'seller_onboarding_canary',
  canaryRef: 'seller-canary:one',
  canaryCommitmentDigest: 'sha256:canary-one',
  invocationRef: 'operation-invocation:v1:one',
  operationRef: OPERATION_REF,
  ownerId: 'owner:one',
  businessId: 'business:one',
  offeringRef: 'offering:one',
  offeringRevision: 1,
  offeringSourceHash: 'sha256:offering-one',
  accessPathRef: 'access-path:one',
  accessPathSourceHash: 'sha256:access-one',
  publicationRef: 'publication:one',
  publicationRevision: 1,
  operationMaterialDigest: baseOperation.materialDigest,
  contractDigest: baseOperation.identity.contractDigest,
  bindingDigest: baseOperation.identity.bindingDigest,
  priceDigest: baseOperation.priceDigest,
  sellerPayTo: `0x${'1'.repeat(40)}`,
  sellerClaimDigest: 'sha256:claim-one',
  readinessDigest: 'sha256:readiness-one',
  readinessObservedAt: now - 1,
  readinessValidUntil: now + 30_000,
  expectedOutputSchemaDigest: 'sha256:output-schema-one',
  expectedOutputEvidenceDigest: 'sha256:output-evidence-one',
  expiresAt: now + 30_000,
  inputDigest: 'sha256:input-one',
  idempotencyKey: 'idempotency:one',
  funding: {
    kind: 'ae_owned',
    principalId: 'principal:one',
    ownerId: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    grantRef: 'grant:one',
    grantGeneration: 1,
    policyDigest: BASE_POLICY_DIGEST,
    budgetRef: 'budget:canary',
    maximumSpend: { currency: 'USDC', units: '2000', exponent: 6 },
    requestedSpend: { currency: 'USDC', units: '1000', exponent: 6 },
    ledgerEffects: 'external_spend_only',
  },
  accountingPolicy: {
    recordBuyerUsage: false,
    accrueProviderEarnings: false,
    accruePlatformRake: false,
    recordQualifiedUse: false,
  },
  ...overrides,
})
const abandonmentArgs = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const reservation = args(overrides)
  delete reservation.operationJson
  delete reservation.inputJson
  delete reservation.now
  return reservation
}

function context(grantOverrides: Record<string, unknown> = {}): HandlerContext {
  const db = new MemoryDb()
  const grantRow = grant(grantOverrides)
  db.seed('agentAccessGrants', grantRow)
  db.seed('capabilityOperationCommitments', commitment(String(grantRow.policyDigest)))
  return { db, runMutation: vi.fn(async () => undefined) }
}

function argsFor(ctx: HandlerContext, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const storedGrant = ctx.db.rows('agentAccessGrants')[0]
  const value = args({ policyDigest: storedGrant?.policyDigest, ...overrides })
  const storedCommitment = ctx.db.rows('capabilityOperationCommitments')[0]
  if (storedCommitment !== undefined) {
    Object.assign(storedCommitment, {
      commitmentRef: value.commitmentRef,
      principalId: value.principalId,
      accountRef: value.ownerId,
      credentialId: value.credentialId,
      applicationRef: value.applicationRef,
      environment: value.environment,
      grantRef: value.grantRef,
      grantGeneration: value.grantGeneration,
      grantPolicyDigest: value.policyDigest,
      operationRef: value.operationRef,
      operationJson: value.operationJson,
      normalizedInputJson: value.inputJson,
      inputDigest: value.inputDigest,
      expiresAt: Number.MAX_SAFE_INTEGER,
    })
  }
  return value
}

let seedSequence = 0
function invocation(overrides: Record<string, unknown> = {}): Row {
  const suffix = ++seedSequence
  return {
    _id: `capabilityOperationInvocations:seed-${suffix}`,
    invocationRef: `operation-invocation:v1:seed-${suffix}`,
    principalId: 'principal:one',
    ownerId: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    grantRef: 'grant:one',
    environment: 'sandbox',
    operationRef: 'operation:seed',
    idempotencyKey: `idempotency:seed-${suffix}`,
    inputDigest: 'sha256:seed-input',
    requestDigest: 'sha256:seed-request',
    grantGeneration: 1,
    policyDigest: BASE_POLICY_DIGEST,
    grantExpiresAt: now + 60_000,
    state: 'completed',
    createdAt: now - 1,
    updatedAt: now - 1,
    ...overrides,
  }
}

describe('capability operation reservation admission', () => {
  it('keeps seller canary authority out of the public invoke contract', () => {
    expect('sellerOnboardingCanary' in invokeArgs).toBe(false)
  })

  it('persists and replays only the exact complete seller canary envelope', async () => {
    const ctx = context()
    const canary = canaryEnvelope()
    await expect(reserveHandler(ctx, args({ sellerOnboardingCanary: canary })))
      .resolves.toMatchObject({ kind: 'reserved' })
    expect(ctx.db.rows('capabilityOperationInvocations')[0]).toMatchObject({
      sellerOnboardingCanary: canary,
    })
    await expect(reserveHandler(ctx, args({ sellerOnboardingCanary: canary })))
      .resolves.toMatchObject({ kind: 'replayed' })
    await expect(reserveHandler(ctx, args({
      sellerOnboardingCanary: canaryEnvelope({
        funding: { ...canary.funding, budgetRef: 'budget:attacker' },
      }),
    }))).resolves.toEqual({ kind: 'conflict' })
  })

  it('fails closed on crossed environment or partial canary reservation identity', async () => {
    const production = context({ environment: 'production' })
    await expect(reserveHandler(production, args({
      environment: 'production',
      sellerOnboardingCanary: canaryEnvelope(),
    }))).resolves.toEqual({ kind: 'conflict' })
    const wrongOperation = context()
    await expect(reserveHandler(wrongOperation, args({
      sellerOnboardingCanary: canaryEnvelope({ operationRef: 'operation:swapped' }),
    }))).resolves.toEqual({ kind: 'conflict' })
    expect(production.db.rows('capabilityOperationInvocations')).toHaveLength(0)
    expect(wrongOperation.db.rows('capabilityOperationInvocations')).toHaveLength(0)
  })

  it('replays the persisted reservation before quota checks and does not double-count it', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 }, budget: { maximumConcurrentInvocations: 1 } },
    })

    const first = await reserveHandler(ctx, argsFor(ctx))
    const replay = await reserveHandler(ctx, argsFor(ctx))

    expect(first).toMatchObject({ kind: 'reserved', reservation: { invocationRef: 'operation-invocation:v1:one' } })
    expect(replay).toEqual({
      kind: 'replayed',
      reservation: expect.objectContaining({ invocationRef: 'operation-invocation:v1:one' }),
    })
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(1)
    expect(ctx.db.rows('capabilityOperationCommitments')[0]).toMatchObject({
      state: 'consumed',
      consumedInvocationRef: 'operation-invocation:v1:one',
    })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(1)
  })

  it('admits v1 all-admitted and a v2 grant selecting the exact Operation', async () => {
    const legacy = context()
    await expect(reserveHandler(legacy, args())).resolves.toMatchObject({ kind: 'reserved' })

    const selected = context(selectedGrantOverrides([OPERATION_REF]))
    await expect(reserveHandler(selected, argsFor(selected))).resolves.toMatchObject({ kind: 'reserved' })
  })

  it('refuses an unselected Operation or invalid stored grant before rate, reservation, and evidence writes', async () => {
    for (const ctx of [
      context(selectedGrantOverrides([OTHER_OPERATION_REF])),
      context({ operationRefs: [] }),
    ]) {
      mocks.assertAgentAccessRateAdmission.mockClear()
      await expect(reserveHandler(ctx, argsFor(ctx))).resolves.toMatchObject({
        kind: 'refused',
        code: 'grant_not_found',
      })
      expect(mocks.assertAgentAccessRateAdmission).not.toHaveBeenCalled()
      expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(0)
      expect(ctx.runMutation).not.toHaveBeenCalled()
    }
  })

  it('replays an exact admitted reservation before a later selected-policy change', async () => {
    const ctx = context()
    const originalArgs = args()
    await expect(reserveHandler(ctx, originalArgs)).resolves.toMatchObject({ kind: 'reserved' })
    Object.assign(ctx.db.rows('agentAccessGrants')[0]!, selectedGrantOverrides([OTHER_OPERATION_REF]))

    await expect(reserveHandler(ctx, originalArgs)).resolves.toMatchObject({ kind: 'replayed' })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(1)
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(1)
  })
  it('replays stable operation material when readiness observation changes', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())
    const refreshedOperationJson = JSON.stringify({
      ...baseOperation,
      readiness: {
        ...baseOperation.readiness,
        observedAt: baseOperation.readiness.observedAt + 1_000,
        qualificationDigest: `sha256:${'r'.repeat(64)}`,
      },
    })

    await expect(reserveHandler(ctx, args({ operationJson: refreshedOperationJson }))).resolves.toMatchObject({ kind: 'replayed' })
  })

  it('conflicts when stable operation material changes for an existing idempotency key', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())
    const changedOperationJson = JSON.stringify({
      ...baseOperation,
      operationId: `${baseOperation.operationId}:changed`,
      materialDigest: `sha256:${'m'.repeat(64)}`,
      identity: { ...baseOperation.identity, publicationRef: `${baseOperation.identity.publicationRef}:changed` },
    })

    await expect(reserveHandler(ctx, args({ operationJson: changedOperationJson }))).resolves.toEqual({ kind: 'conflict' })
  })

  it('rejects changed grant generation material for an existing idempotency key', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())

    await expect(reserveHandler(ctx, args({ grantGeneration: 2, invocationRef: 'operation-invocation:v1:changed' }))).resolves.toEqual({ kind: 'conflict' })
  })
  it('refuses before insertion when the canonical rate limiter refuses', async () => {
    mocks.assertAgentAccessRateAdmission.mockResolvedValueOnce({ ok: false })
    const ctx = context()

    await expect(reserveHandler(ctx, args())).resolves.toMatchObject({ kind: 'refused', code: 'rate_limited', retryable: true })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(1)
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(0)
  })
  it('passes the persisted grant rate policy to the canonical application credential key', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 7, maximumCallsPerHour: 42 }, budget: { maximumConcurrentInvocations: 2 } },
    })

    await expect(reserveHandler(ctx, argsFor(ctx))).resolves.toMatchObject({ kind: 'reserved' })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledWith(ctx, {
      applicationRef: 'application:one',
      credentialId: 'credential:one',
      maximumCallsPerMinute: 7,
      maximumCallsPerHour: 42,
    })
  })

  it('does not count completed invocation rows against canonical rate admission', async () => {
    const minuteCtx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 2 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    minuteCtx.db.seed('capabilityOperationInvocations', invocation({ createdAt: now - 60_000 }))
    await expect(reserveHandler(minuteCtx, argsFor(minuteCtx))).resolves.toMatchObject({ kind: 'reserved' })

    const hourCtx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    hourCtx.db.seed('capabilityOperationInvocations', invocation({ createdAt: now - 3_600_000 }))
    await expect(reserveHandler(hourCtx, argsFor(hourCtx))).resolves.toMatchObject({ kind: 'reserved' })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(2)
  })

  it('counts pending and reconciliation reservations, but not terminal states, for concurrency', async () => {
    const blocked = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    blocked.db.seed('capabilityOperationInvocations', invocation({ state: 'pending' }))
    blocked.db.seed('capabilityOperationInvocations', invocation({ state: 'reconciliation_required' }))
    await expect(reserveHandler(blocked, argsFor(blocked))).resolves.toMatchObject({ kind: 'refused', code: 'concurrency_limited' })

    const available = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 1 } },
    })
    for (const state of ['completed', 'refused', 'cancelled'] as const) available.db.seed('capabilityOperationInvocations', invocation({ state }))
    await expect(reserveHandler(available, argsFor(available))).resolves.toMatchObject({ kind: 'reserved' })
  })
  it('does not let an expired pending grant consume concurrency', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 1 } },
    })
    ctx.db.seed('capabilityOperationInvocations', invocation({
      state: 'pending',
      grantExpiresAt: now,
    }))

    await expect(reserveHandler(ctx, argsFor(ctx))).resolves.toMatchObject({ kind: 'reserved' })
  })

  it('refuses expired and environment-mismatched grants with stable codes', async () => {
    const expired = context({ expiresAt: now, lifecycle: 'active' })
    await expect(reserveHandler(expired, args())).resolves.toMatchObject({ kind: 'refused', code: 'grant_expired', retryable: false })

    const mismatched = context({ environment: 'production' })
    await expect(reserveHandler(mismatched, args())).resolves.toMatchObject({ kind: 'refused', code: 'environment_mismatch', retryable: false })
  })
  it('abandons an exact undispatched reservation and makes the same key reservable again', async () => {
    const ctx = context()
    await expect(reserveHandler(ctx, args())).resolves.toMatchObject({ kind: 'reserved' })

    await expect(abandonHandler(ctx, abandonmentArgs())).resolves.toEqual({ kind: 'abandoned' })
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(0)
    expect(ctx.db.rows('capabilityOperationCommitments')[0]).toMatchObject({ state: 'issued' })
  })
  it('does not let a different principal or request identity abandon another reservation', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())

    await expect(abandonHandler(ctx, abandonmentArgs({
      principalId: 'principal:other',
      ownerId: 'owner:other',
    }))).resolves.toEqual({ kind: 'not_found' })
    await expect(abandonHandler(ctx, abandonmentArgs({
      requestDigest: 'sha256:request-other',
    }))).resolves.toEqual({ kind: 'not_found' })
    await expect(abandonHandler(ctx, abandonmentArgs({
      credentialId: 'credential:other',
    }))).resolves.toEqual({ kind: 'not_found' })
    await expect(abandonHandler(ctx, abandonmentArgs({
      applicationRef: 'application:other',
    }))).resolves.toEqual({ kind: 'not_found' })
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(1)
  })

  it('keeps a reservation once dispatch markers exist', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())
    const [row] = ctx.db.rows('capabilityOperationInvocations')
    if (row === undefined) throw new Error('reservation_missing')
    await ctx.db.delete(row._id)
    ctx.db.seed('capabilityOperationInvocations', { ...row, workId: 'work:one' })

    await expect(abandonHandler(ctx, abandonmentArgs())).resolves.toEqual({ kind: 'dispatch_started' })
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(1)
  })
})

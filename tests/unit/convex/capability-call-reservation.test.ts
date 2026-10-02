import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  assertAgentAccessRateAdmission: vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: true })),
}))

vi.mock('../../../convex/lib/platform/rateLimit', () => ({
  assertAgentAccessRateAdmission: mocks.assertAgentAccessRateAdmission,
}))

beforeEach(() => {
  mocks.assertAgentAccessRateAdmission.mockClear()
  mocks.assertAgentAccessRateAdmission.mockResolvedValue({ ok: true })
})

import { abandon, reserve } from '../../../convex/capabilityCalls'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

type Row = Record<string, unknown> & { _id: string }
type Filter = (row: Row) => boolean
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  gt: (field: string, value: number) => QueryBuilder
  lte: (field: string, value: number) => QueryBuilder
}

type Query = {
  withIndex: (name: string, build: (query: QueryBuilder) => QueryBuilder) => Query
  order: (direction: 'asc' | 'desc') => Query
  first: () => Promise<Row | null>
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
      order: () => query,
      first: async () => rows()[0] ?? null,
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

const baseOperation = buildDevelopmentPublishedToolEvidence().tool
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
  quoteRef: 'operation-commitment:v1:one',
  callRef: 'operation-invocation:v1:one',
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  grantRef: 'grant:one',
  environment: 'sandbox',
  toolRef: OPERATION_REF,
  idempotencyKey: 'idempotency:one',
  inputDigest: 'sha256:input-one',
  requestDigest: 'sha256:request-one',
  grantGeneration: 1,
  policyDigest: BASE_POLICY_DIGEST,
  grantExpiresAt: now + 60_000,
  toolJson: baseOperationJson,
  inputJson: '{}',
  now,
  ...overrides,
})

function commitment(policyDigest: string = BASE_POLICY_DIGEST): Row {
  return {
    _id: 'capabilityQuotes:one',
    quoteRef: 'operation-commitment:v1:one',
    principalId: 'principal:one',
    accountRef: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    environment: 'sandbox',
    grantRef: 'grant:one',
    grantGeneration: 1,
    grantPolicyDigest: policyDigest,
    grantExpiresAt: now + 60_000,
    toolRef: OPERATION_REF,
    toolVersion: 1,
    toolMaterialDigest: baseOperation.materialDigest,
    currentToolDigest: 'sha256:current-operation',
    toolJson: baseOperationJson,
    normalizedInputJson: '{}',
    inputDigest: 'sha256:input-one',
    pricingJson: JSON.stringify({ kind: 'fixed_aud', currency: 'AUD', exponent: 6, amountUnits: '0' }),
    pricingDigest: 'sha256:pricing',
    decisionAudUnits: '0',
    budgetPolicyRef: 'budget:reservation',
    budgetGeneration: 1,
    maximumSpendPerCallUnits: '0',
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
const abandonmentArgs = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const reservation = args(overrides)
  delete reservation.toolJson
  delete reservation.inputJson
  delete reservation.now
  return reservation
}

function context(grantOverrides: Record<string, unknown> = {}): HandlerContext {
  const db = new MemoryDb()
  const grantRow = grant(grantOverrides)
  db.seed('agentAccessGrants', grantRow)
  db.seed('capabilityQuotes', commitment(String(grantRow.policyDigest)))
  return { db, runMutation: vi.fn(async () => undefined) }
}

function argsFor(ctx: HandlerContext, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const storedGrant = ctx.db.rows('agentAccessGrants')[0]
  const value = args({ policyDigest: storedGrant?.policyDigest, ...overrides })
  const storedCommitment = ctx.db.rows('capabilityQuotes')[0]
  if (storedCommitment !== undefined) {
    Object.assign(storedCommitment, {
      quoteRef: value.quoteRef,
      principalId: value.principalId,
      accountRef: value.ownerId,
      credentialId: value.credentialId,
      applicationRef: value.applicationRef,
      environment: value.environment,
      grantRef: value.grantRef,
      grantGeneration: value.grantGeneration,
      grantPolicyDigest: value.policyDigest,
      toolRef: value.toolRef,
      toolJson: value.toolJson,
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
    _id: `capabilityCalls:seed-${suffix}`,
    callRef: `operation-invocation:v1:seed-${suffix}`,
    principalId: 'principal:one',
    ownerId: 'owner:one',
    credentialId: 'credential:one',
    applicationRef: 'application:one',
    grantRef: 'grant:one',
    environment: 'sandbox',
    toolRef: 'operation:seed',
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
  it('replays the persisted reservation before quota checks and does not double-count it', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 }, budget: { maximumConcurrentInvocations: 1 } },
    })

    const first = await reserveHandler(ctx, argsFor(ctx))
    const replay = await reserveHandler(ctx, argsFor(ctx))

    expect(first).toMatchObject({ kind: 'reserved', reservation: { callRef: 'operation-invocation:v1:one' } })
    expect(replay).toEqual({
      kind: 'replayed',
      reservation: expect.objectContaining({ callRef: 'operation-invocation:v1:one' }),
    })
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(1)
    expect(ctx.db.rows('capabilityQuotes')[0]).toMatchObject({
      state: 'consumed',
      consumedCallRef: 'operation-invocation:v1:one',
    })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(1)
  })

  it.each(['v1.3.0', 'v1.4.0'])('refuses new paid admission without period evidence under %s', async schemaVersion => {
    const ctx = context(selectedGrantOverrides([OPERATION_REF]))
    const reservationArgs = argsFor(ctx)
    Object.assign(ctx.db.rows('capabilityQuotes')[0]!, {
      decisionAudUnits: '1', formanceSchemaVersion: schemaVersion,
    })
    expect(await reserveHandler(ctx, reservationArgs)).toMatchObject({ kind: 'refused', code: 'budget_exceeded' })
    expect(ctx.db.rows('capabilityCalls')).toEqual([])
    expect(ctx.db.rows('capabilityQuotes')[0]).toMatchObject({ state: 'issued' })
    expect(mocks.assertAgentAccessRateAdmission).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
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
      expect(ctx.db.rows('capabilityCalls')).toHaveLength(0)
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
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(1)
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

    await expect(reserveHandler(ctx, args({ toolJson: refreshedOperationJson }))).resolves.toMatchObject({ kind: 'replayed' })
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

    await expect(reserveHandler(ctx, args({ toolJson: changedOperationJson }))).resolves.toEqual({ kind: 'conflict' })
  })

  it('replays the original reservation when the credential and grant generation rotate under one key', async () => {
    const ctx = context()
    await expect(reserveHandler(ctx, args())).resolves.toMatchObject({ kind: 'reserved' })

    // A rotated credential mints a new grant generation and therefore a new
    // derived callRef; the key must still resolve the original reservation.
    await expect(reserveHandler(ctx, args({
      credentialId: 'credential:successor',
      grantGeneration: 2,
      grantRef: 'grant:successor',
      callRef: 'operation-invocation:v1:changed',
    }))).resolves.toMatchObject({
      kind: 'replayed',
      reservation: {
        callRef: 'operation-invocation:v1:one',
        credentialId: 'credential:one',
        grantRef: 'grant:one',
        grantGeneration: 1,
      },
    })
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(1)
  })

  it('conflicts without throwing when two rows already share one principal idempotency key', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())
    const [row] = ctx.db.rows('capabilityCalls')
    if (row === undefined) throw new Error('reservation_missing')
    ctx.db.seed('capabilityCalls', {
      ...row,
      _id: 'capabilityCalls:duplicate',
      callRef: 'operation-invocation:v1:duplicate',
    })

    await expect(reserveHandler(ctx, args())).resolves.toEqual({ kind: 'conflict' })
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(2)
  })
  it('refuses before insertion when the canonical rate limiter refuses', async () => {
    mocks.assertAgentAccessRateAdmission.mockResolvedValueOnce({ ok: false })
    const ctx = context()

    await expect(reserveHandler(ctx, args())).resolves.toMatchObject({ kind: 'refused', code: 'rate_limited', retryable: true })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(1)
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(0)
  })
  it('passes the persisted grant rate policy to the canonical Agent principal key', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 7, maximumCallsPerHour: 42 }, budget: { maximumConcurrentInvocations: 2 } },
    })

    await expect(reserveHandler(ctx, argsFor(ctx))).resolves.toMatchObject({ kind: 'reserved' })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledWith(ctx, {
      principalRef: 'principal:one',
      maximumCallsPerMinute: 7,
      maximumCallsPerHour: 42,
    })
  })

  it('does not count completed invocation rows against canonical rate admission', async () => {
    const minuteCtx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 2 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    minuteCtx.db.seed('capabilityCalls', invocation({ createdAt: now - 60_000 }))
    await expect(reserveHandler(minuteCtx, argsFor(minuteCtx))).resolves.toMatchObject({ kind: 'reserved' })

    const hourCtx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    hourCtx.db.seed('capabilityCalls', invocation({ createdAt: now - 3_600_000 }))
    await expect(reserveHandler(hourCtx, argsFor(hourCtx))).resolves.toMatchObject({ kind: 'reserved' })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(2)
  })

  it('counts pending and reconciliation reservations, but not terminal states, for concurrency', async () => {
    const blocked = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    blocked.db.seed('capabilityCalls', invocation({ state: 'pending' }))
    blocked.db.seed('capabilityCalls', invocation({ state: 'reconciliation_required' }))
    await expect(reserveHandler(blocked, argsFor(blocked))).resolves.toMatchObject({ kind: 'refused', code: 'concurrency_limited' })

    const available = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 1 } },
    })
    for (const state of ['completed', 'refused', 'cancelled'] as const) available.db.seed('capabilityCalls', invocation({ state }))
    await expect(reserveHandler(available, argsFor(available))).resolves.toMatchObject({ kind: 'reserved' })
  })
  it('counts an expired pending grant against Agent concurrency', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 1 } },
    })
    ctx.db.seed('capabilityCalls', invocation({
      state: 'pending',
      grantExpiresAt: now,
    }))

    await expect(reserveHandler(ctx, argsFor(ctx))).resolves.toMatchObject({ kind: 'refused', code: 'concurrency_limited' })
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
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(0)
    expect(ctx.db.rows('capabilityQuotes')[0]).toMatchObject({ state: 'issued' })
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
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(1)
  })

  it('keeps a reservation once dispatch markers exist', async () => {
    const ctx = context()
    await reserveHandler(ctx, args())
    const [row] = ctx.db.rows('capabilityCalls')
    if (row === undefined) throw new Error('reservation_missing')
    await ctx.db.delete(row._id)
    ctx.db.seed('capabilityCalls', { ...row, workId: 'work:one' })

    await expect(abandonHandler(ctx, abandonmentArgs())).resolves.toEqual({ kind: 'dispatch_started' })
    expect(ctx.db.rows('capabilityCalls')).toHaveLength(1)
  })
})

describe('registered Agent access rate limiter', () => {
  it('keeps one token bucket across credential rotation while isolating another Agent', async () => {
    const { assertAgentAccessRateAdmission } = await vi.importActual<typeof import('../../../convex/lib/platform/rateLimit')>(
      '../../../convex/lib/platform/rateLimit',
    )
    const backend = convexTestWithMarketComponents()
    const limits = { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 }
    const admit = (principalRef: string, credentialId: string) => backend.run(ctx => {
      // Keep the rotated credential in the call material to make the ignored
      // credential dimension explicit; the helper's contract keys by principal.
      const input = { principalRef, credentialId, ...limits }
      return assertAgentAccessRateAdmission(ctx, input)
    })

    await expect(admit('principal:native-rotation', 'credential:native-a'))
      .resolves.toMatchObject({ ok: true })
    await expect(admit('principal:native-rotation', 'credential:native-b'))
      .resolves.toMatchObject({ ok: false, retryAfter: expect.any(Number) })
    await expect(admit('principal:native-other', 'credential:native-c'))
      .resolves.toMatchObject({ ok: true })
  })
})

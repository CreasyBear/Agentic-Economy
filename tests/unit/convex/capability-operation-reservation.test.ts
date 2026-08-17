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
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'

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
  async delete(id: string): Promise<void> {
    for (const [table, rows] of this.tables) {
      const remaining = rows.filter((row) => row._id !== id)
      if (remaining.length !== rows.length) this.tables.set(table, remaining)
    }
  }
}

type Handler = (ctx: { db: MemoryDb }, args: Record<string, unknown>) => Promise<unknown>
const reserveHandler = (reserve as unknown as { _handler: Handler })._handler
const abandonHandler = (abandon as unknown as { _handler: Handler })._handler

const baseOperation = buildDevelopmentPublishedOperationEvidence().operation
const baseOperationJson = JSON.stringify(baseOperation)
const now = 100_000
const grant = (overrides: Record<string, unknown> = {}): Row => ({
  _id: 'agentAccessGrants:one',
  grantRef: 'grant:one',
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox',
  lifecycle: 'active',
  generation: 1,
  policyDigest: 'sha256:policy-one',
  expiresAt: now + 60_000,
  policy: {
    rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 },
    budget: { maximumConcurrentInvocations: 2 },
  },
  ...overrides,
})

const args = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  invocationRef: 'operation-invocation:v1:one',
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  grantRef: 'grant:one',
  environment: 'sandbox',
  operationRef: 'operation:one',
  idempotencyKey: 'idempotency:one',
  inputDigest: 'sha256:input-one',
  requestDigest: 'sha256:request-one',
  grantGeneration: 1,
  policyDigest: 'sha256:policy-one',
  grantExpiresAt: now + 60_000,
  operationJson: baseOperationJson,
  inputJson: '{}',
  now,
  ...overrides,
})
const abandonmentArgs = (overrides: Record<string, unknown> = {}): Record<string, unknown> => {
  const reservation = args(overrides)
  delete reservation.operationJson
  delete reservation.inputJson
  delete reservation.now
  return reservation
}

function context(grantOverrides: Record<string, unknown> = {}): { db: MemoryDb } {
  const db = new MemoryDb()
  db.seed('agentAccessGrants', grant(grantOverrides))
  return { db }
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
    policyDigest: 'sha256:policy-one',
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

    const first = await reserveHandler(ctx, args())
    const replay = await reserveHandler(ctx, args())

    expect(first).toMatchObject({ kind: 'reserved', reservation: { invocationRef: 'operation-invocation:v1:one' } })
    expect(replay).toEqual({
      kind: 'replayed',
      reservation: expect.objectContaining({ invocationRef: 'operation-invocation:v1:one' }),
    })
    expect(ctx.db.rows('capabilityOperationInvocations')).toHaveLength(1)
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(1)
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

    await expect(reserveHandler(ctx, args())).resolves.toMatchObject({ kind: 'reserved' })
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
    await expect(reserveHandler(minuteCtx, args())).resolves.toMatchObject({ kind: 'reserved' })

    const hourCtx = context({
      policy: { rate: { maximumCallsPerMinute: 1, maximumCallsPerHour: 1 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    hourCtx.db.seed('capabilityOperationInvocations', invocation({ createdAt: now - 3_600_000 }))
    await expect(reserveHandler(hourCtx, args())).resolves.toMatchObject({ kind: 'reserved' })
    expect(mocks.assertAgentAccessRateAdmission).toHaveBeenCalledTimes(2)
  })

  it('counts pending and reconciliation reservations, but not terminal states, for concurrency', async () => {
    const blocked = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 2 } },
    })
    blocked.db.seed('capabilityOperationInvocations', invocation({ state: 'pending' }))
    blocked.db.seed('capabilityOperationInvocations', invocation({ state: 'reconciliation_required' }))
    await expect(reserveHandler(blocked, args())).resolves.toMatchObject({ kind: 'refused', code: 'concurrency_limited' })

    const available = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 1 } },
    })
    for (const state of ['completed', 'refused', 'cancelled'] as const) available.db.seed('capabilityOperationInvocations', invocation({ state }))
    await expect(reserveHandler(available, args())).resolves.toMatchObject({ kind: 'reserved' })
  })
  it('does not let an expired pending grant consume concurrency', async () => {
    const ctx = context({
      policy: { rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 }, budget: { maximumConcurrentInvocations: 1 } },
    })
    ctx.db.seed('capabilityOperationInvocations', invocation({
      state: 'pending',
      grantExpiresAt: now,
    }))

    await expect(reserveHandler(ctx, args())).resolves.toMatchObject({ kind: 'reserved' })
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

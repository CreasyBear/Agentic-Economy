import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enqueueAction: vi.fn(async () => 'workpool:approval'),
  readCurrentPublishedTool: vi.fn(async (): Promise<unknown> => undefined),
}))

vi.mock('../../../convex/authz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/authz')>()),
  resolveBusinessActor: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<AuthIdentity | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'anonymous', anonymousBucket: 'convex:anonymous' }
    return {
      kind: 'authenticated_owner',
      clerkUserId: identity.tokenIdentifier,
      canonicalPrincipalRef: identity.tokenIdentifier === 'clerk|user_123'
        ? `prn_${'1'.repeat(32)}`
        : `prn_${'9'.repeat(32)}`,
      canonicalAccountRef: identity.tokenIdentifier === 'clerk|user_123'
        ? `acc_${'2'.repeat(32)}`
        : `acc_${'8'.repeat(32)}`,
      authorityRevision: {},
      authorityProvenance: {},
    }
  }),
}))

vi.mock('../../../convex/marketDispatchWorkpool', () => ({
  marketDispatchWorkpool: { enqueueAction: mocks.enqueueAction },
}))

vi.mock('../../../convex/capabilitySupplyTools', () => ({
  readCurrentPublishedTool: mocks.readCurrentPublishedTool,
}))

import {
  decideCallApproval,
  call,
  listPendingCallApprovals,
  reserve,
} from '../../../convex/capabilityCalls'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import {
  createPublicToolRef,
  materializeRuntimePublishedTool,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

type Row = Record<string, unknown> & { _id: string }
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

  row(table: string, id: string): Row | undefined {
    return this.tables.get(table)?.find((candidate) => candidate._id === id)
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    let filters: Array<(row: Row) => boolean> = []
    let direction: 'asc' | 'desc' = 'asc'
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
      order: (nextDirection) => {
        direction = nextDirection
        return query
      },
      first: async () => queryRows()[0] ?? null,
      unique: async () => {
        const matches = queryRows()
        if (matches.length > 1) throw new Error('expected_unique')
        return matches[0] ?? null
      },
      take: async (limit) => queryRows().slice(0, limit),
    }
    const queryRows = (): Row[] => {
      const matches = (this.tables.get(table) ?? []).filter((row) => filters.every((filter) => filter(row)))
      return matches.sort((left, right) => {
        const leftValue = typeof left.createdAt === 'number' ? left.createdAt : 0
        const rightValue = typeof right.createdAt === 'number' ? right.createdAt : 0
        return direction === 'desc' ? rightValue - leftValue : leftValue - rightValue
      })
    }
    return query
  }

  async patch(id: string, changes: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      const current = rows[index]
      if (current !== undefined) rows[index] = { ...current, ...changes }
    }
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
}

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
type AuthIdentity = Readonly<{ subject: string; tokenIdentifier: string }>
const approvalHandler = (decideCallApproval as unknown as { _handler: Handler })._handler
const listHandler = (listPendingCallApprovals as unknown as { _handler: Handler })._handler
const callHandler = (call as unknown as { _handler: Handler })._handler
const reserveHandler = (reserve as unknown as { _handler: Handler })._handler

const evidence = buildDevelopmentPublishedToolEvidence()
const operation = evidence.tool
const toolRef = createPublicToolRef({
  operationId: operation.operationId,
  publicationRef: operation.identity.publicationRef,
  publicationRevision: operation.identity.publicationRevision,
  contractRef: operation.contract.ref,
})
const descriptor = materializeRuntimePublishedTool(operation)
mocks.readCurrentPublishedTool.mockResolvedValue(operation)
const input = { symbol: 'BTC', convert: 'USD' }
const now = operation.readiness.observedAt + 1_000
const grantExpiresAt = now + 60_000
const quoteRef = `operation-commitment:v1:${'c'.repeat(64)}`
const owner = `acc_${'2'.repeat(32)}`
const ownerIdentity: AuthIdentity = { subject: 'user_123', tokenIdentifier: 'clerk|user_123' }
const principal: AgentAccessPrincipal = {
  principalId: 'principal:approval',
  ownerId: owner,
  credentialId: 'credential:approval',
  applicationRef: 'application:approval',
  environment: 'sandbox',
  scopes: ['market_tools:call'],
  authorityMode: 'approval_required',
}
const approvalPolicy = {
  format: 'ae.agent-access-policy:v2' as const,
  operationAccess: 'all_admitted' as const,
  operationRefs: [] as string[],
  environment: 'sandbox' as const,
  budget: {
    budgetPolicyRef: 'budget:approval-policy',
    generation: 1,
    currency: 'AUD',
    exponent: 6,
    maximumSpendPerInvocation: { currency: 'AUD', units: '1000000', exponent: 6 },
    maximumDailySpend: { currency: 'AUD', units: '10000000', exponent: 6 },
    maximumMonthlySpend: { currency: 'AUD', units: '100000000', exponent: 6 },
    maximumConcurrentInvocations: 1,
  },
  rate: {
    ratePolicyRef: 'rate:approval-policy',
    generation: 1,
    maximumCallsPerMinute: 20,
    maximumCallsPerHour: 100,
  },
}
const approvalPolicyDigest = canonicalDigest(approvalPolicy as never)
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now)
})
afterEach(() => {
  vi.restoreAllMocks()
  mocks.readCurrentPublishedTool.mockResolvedValue(operation)
})

function grant(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: 'agentAccessGrants:approval',
    _creationTime: now - 1_000,
    format: 'ae.agent-access-grant:v2',
    grantRef: 'grant:approval',
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    credentialId: principal.credentialId,
    applicationRef: principal.applicationRef,
    environment: principal.environment,
    lifecycle: 'active',
    authorityMode: 'approve_each',
    generation: 1,
    policyDigest: approvalPolicyDigest,
    expiresAt: grantExpiresAt,
    operationAccess: 'all_admitted',
    operationRefs: [],
    policy: approvalPolicy,
    budgetPolicyRef: approvalPolicy.budget.budgetPolicyRef,
    ratePolicyRef: approvalPolicy.rate.ratePolicyRef,
    createdAt: now - 1_000,
    updatedAt: now - 1_000,
    ...overrides,
  }
}

function authorityRequest() {
  return {
    kind: 'approval_required' as const,
    toolRef,
    consequence: descriptor.consequenceClass,
    retryClass: descriptor.retryClass,
    maximumSpend: descriptor.price.kind === 'fixed' ? descriptor.price.amount : undefined,
    dataFields: [...descriptor.materialInputPointers],
  }
}

function needsAuthorityResult(callRef: string) {
  return {
    kind: 'needs_authority' as const,
    callRef,
    toolRef,
    authorityRequest: authorityRequest(),
  }
}
function invocation(overrides: Record<string, unknown> = {}): Row {
  const callRef = 'operation-invocation:v1:approval'
  return {
    _id: 'capabilityCalls:approval',
    callRef,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    credentialId: principal.credentialId,
    applicationRef: principal.applicationRef,
    toolRef,
    quoteRef,
    idempotencyKey: 'idempotency:approval',
    environment: 'sandbox',
    grantRef: 'grant:approval',
    grantGeneration: 1,
    policyDigest: approvalPolicyDigest,
    grantExpiresAt,
    state: 'pending',
    dispatchState: 'pending',
    inputDigest: canonicalDigest(input),
    requestDigest: canonicalDigest({ toolRef, input }),
    toolJson: JSON.stringify(operation),
    inputJson: JSON.stringify(input),
    result: needsAuthorityResult(callRef),
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
}

function context(options: Readonly<{
  identity?: AuthIdentity | string | null
  invocation?: Row
  grant?: Row
  includeOperation?: boolean
}> = {}) {
  const db = new MemoryDb()
  if (options.grant !== undefined) db.seed('agentAccessGrants', options.grant)
  if (options.invocation !== undefined) db.seed('capabilityCalls', options.invocation)
  const identity = options.identity === undefined
    ? ownerIdentity
    : typeof options.identity === 'string'
      ? { subject: options.identity, tokenIdentifier: options.identity }
      : options.identity
  const runQuery = vi.fn(async () => options.includeOperation === false ? null : { toolJson: JSON.stringify(operation) })
  return {
    db,
    auth: { getUserIdentity: async () => identity },
    runQuery,
    runMutation: vi.fn(async () => ({ ok: true as const })),
  }
}

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

describe('capability operation approval Convex handlers', () => {
  it('lists only current owner pending authority with safe fields and newest-first ordering', async () => {
    const ctx = context({ grant: grant() })
    ctx.db.seed('capabilityCalls', invocation())
    ctx.db.seed('capabilityCalls', invocation({
      _id: 'capabilityCalls:older',
      callRef: 'operation-invocation:v1:older',
      createdAt: 90,
      updatedAt: 90,
      inputJson: JSON.stringify({ secret: 'must-not-project' }),
      result: needsAuthorityResult('operation-invocation:v1:older'),
    }))
    ctx.db.seed('capabilityCalls', invocation({
      _id: 'capabilityCalls:expired',
      callRef: 'operation-invocation:v1:expired',
      grantExpiresAt: 1_000_000,
      createdAt: 110,
      updatedAt: 110,
      result: needsAuthorityResult('operation-invocation:v1:expired'),
    }))
    ctx.db.seed('capabilityCalls', invocation({
      _id: 'capabilityCalls:other-owner',
      callRef: 'operation-invocation:v1:other-owner',
      ownerId: 'owner:other',
      createdAt: 120,
      updatedAt: 120,
      result: needsAuthorityResult('operation-invocation:v1:other-owner'),
    }))

    const result = await listHandler(ctx, {})

    expect(result).toEqual([
      expect.objectContaining({ callRef: 'operation-invocation:v1:approval', createdAt: 100 }),
      expect.objectContaining({ callRef: 'operation-invocation:v1:older', createdAt: 90 }),
    ])
    expect(JSON.stringify(result)).not.toContain('must-not-project')
    expect((result as Array<Record<string, unknown>>).every((item) => Object.keys(item).sort().join(',') === 'authorityRequest,callRef,createdAt,toolRef')).toBe(true)
  })

  it('approves the exact persisted row, dispatches once, and replays approval', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation()
    const ctx = context({ invocation: row, grant: grant() })

    const approved = await approvalHandler(ctx, { callRef: row.callRef, decision: 'approve' })
    const replayed = await approvalHandler(ctx, { callRef: row.callRef, decision: 'approve' })
    const stored = ctx.db.row('capabilityCalls', row._id)

    expect(approved).toEqual({ kind: 'approved', callRef: row.callRef })
    expect(replayed).toEqual({ kind: 'replayed', callRef: row.callRef })
    expect(mocks.enqueueAction).toHaveBeenCalledTimes(1)
    expect(stored).toMatchObject({ state: 'pending', dispatchState: 'enqueued', workId: 'workpool:approval', result: { kind: 'pending' } })
    expect(stored).toMatchObject({
      authority: {
        callRef: row.callRef,
        toolRef,
        acceptedBasis: { kind: 'approval_required' },
        reference: `owner-approval:${canonicalDigest({ callRef: row.callRef, ownerId: row.ownerId }).slice(7)}`,
      },
    })
  })

  it('does not enumerate a cross-owner invocation', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation()
    const ctx = context({ identity: { subject: 'user_123', tokenIdentifier: 'clerk|other' }, invocation: row, grant: grant() })

    await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'approve' })).resolves.toEqual({
      kind: 'refused',
      code: 'invocation_not_found',
    })
    expect(mocks.enqueueAction).not.toHaveBeenCalled()
  })

  it('refuses approval for a revoked or stale grant without dispatch', async () => {
    for (const grantOverrides of [
      { lifecycle: 'revoked' },
      { authorityMode: 'bounded_mandate' },
      { generation: 2 },
      { policyDigest: 'sha256:stale-policy' },
      { expiresAt: grantExpiresAt - 1 },
    ]) {
      mocks.enqueueAction.mockClear()
      const row = invocation()
      const ctx = context({ invocation: row, grant: grant(grantOverrides) })
      await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'approve' })).resolves.toEqual({
        kind: 'refused',
        code: 'grant_not_current',
      })
      expect(mocks.enqueueAction).not.toHaveBeenCalled()
    }
  })

  it('denies terminally, replays denial, and frees the pending authority slot', async () => {
    const row = invocation()
    const ctx = context({ invocation: row, grant: grant() })

    await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'deny' })).resolves.toEqual({
      kind: 'denied',
      callRef: row.callRef,
    })
    await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'deny' })).resolves.toEqual({
      kind: 'replayed',
      callRef: row.callRef,
    })
    expect(ctx.db.row('capabilityCalls', row._id)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'authority_denied' },
    })
    const nextInput = { next: true }
    const nextInputDigest = canonicalDigest(nextInput)
    ctx.db.seed('capabilityQuotes', {
      _id: 'capabilityQuotes:next',
      quoteRef,
      state: 'issued',
      expiresAt: grantExpiresAt,
      principalId: principal.principalId,
      accountRef: principal.ownerId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      environment: principal.environment,
      grantRef: 'grant:approval',
      grantGeneration: 1,
      grantPolicyDigest: approvalPolicyDigest,
      toolRef,
      inputDigest: nextInputDigest,
      toolJson: JSON.stringify(operation),
      normalizedInputJson: JSON.stringify(nextInput),
    })
    const next = await reserveHandler(ctx, {
      quoteRef,
      callRef: 'operation-invocation:v1:next',
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      environment: 'sandbox',
      grantRef: 'grant:approval',
      toolRef,
      idempotencyKey: 'idempotency:next',
      inputDigest: nextInputDigest,
      requestDigest: canonicalDigest({ toolRef, input: nextInput }),
      grantGeneration: 1,
      policyDigest: approvalPolicyDigest,
      grantExpiresAt,
      toolJson: JSON.stringify(operation),
      inputJson: JSON.stringify(nextInput),
      now: 1_500_000,
    })
    expect(next).toMatchObject({ kind: 'reserved' })
  })
})

describe('bounded mandate invocation dispatch', () => {
  it('dispatches with the active grant standing mandate and grant expiry', async () => {
    const boundedPrincipal = { ...principal, authorityMode: 'spending_policy' as const }
    const grantRow = grant()
    const activeGrant = normalizeStoredAgentAccessGrant(grantRow)
    let dispatchedAuthority: Record<string, unknown> | undefined
    const reservation = {
      quoteRef,
      principalId: boundedPrincipal.principalId,
      credentialId: boundedPrincipal.credentialId,
      applicationRef: boundedPrincipal.applicationRef,
      grantRef: activeGrant.grantRef,
      grantGeneration: activeGrant.generation,
      policyDigest: activeGrant.spendingPolicyDigest,
      grantExpiresAt: activeGrant.expiresAt,
      environment: boundedPrincipal.environment,
      toolRef,
      idempotencyKey: 'idempotency:bounded',
      inputDigest: canonicalDigest(input),
      requestDigest: canonicalDigest({ toolRef, input }),
      callRef: 'operation-invocation:v1:bounded',
    }
    const ctx = {
      runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
        switch (functionPath(reference)) {
          case 'capabilityQuotes:admitCall':
            return true
          case 'capabilityCalls:resolveCallAgentAuthority':
            return args.principal
          case 'capabilityCalls:reserve':
            return { kind: 'reserved', reservation }
          case 'capabilityCalls:dispatch':
            dispatchedAuthority = args.authority as Record<string, unknown>
            return { kind: 'enqueued', workId: 'workpool:bounded' }
          case 'capabilityCalls:record':
            return { kind: 'recorded' }
          default:
            throw new Error(`unexpected_mutation:${functionPath(reference)}`)
        }
      }),
      runQuery: vi.fn(async (reference: unknown) => {
        switch (functionPath(reference)) {
          case 'capabilityQuotes:readForCall':
            return {
              toolRef,
              input,
              decisionPrice: { currency: 'AUD', exponent: 6, units: '1000000' },
              quoteRef,
              evidenceDigest: `sha256:${'a'.repeat(64)}`,
            }
          case 'capabilitySupplyTools:readCurrentPublishedToolSnapshot':
            return { toolJson: JSON.stringify(operation) }
          case 'agentAccessPolicy:readActiveGrant':
            return activeGrant
          case 'moneyManagedCall:readBooking':
            return { kind: 'not_required' }
          default:
            throw new Error(`unexpected_query:${functionPath(reference)}`)
        }
      }),
    }
    const result = await callHandler(ctx, {
      operationKey: 'operation-invoke:bounded',
      correlationId: 'correlation:bounded',
      principal: boundedPrincipal,
      quoteRef,
      idempotencyKey: 'idempotency:bounded',
    })

    expect(result).toMatchObject({ kind: 'pending', callRef: reservation.callRef, toolRef })
    expect(dispatchedAuthority).toMatchObject({
      acceptedBasis: {
        kind: 'spending_policy_use',
        spendingPolicyRef: `agent-access-grant:${activeGrant.grantRef}`,
        spendingPolicyVersion: 1,
        spendingPolicyGeneration: activeGrant.generation,
      },
      expiresAt: new Date(activeGrant.expiresAt).toISOString(),
    })
  })
})

describe('invocation admission after an empty pending replay', () => {
  it('terminalizes withdrawn, malformed, and unavailable operations after reservation', async () => {
    const scenarios = [
      { code: 'operation_not_current' as const, snapshot: null, snapshotError: false },
      { code: 'operation_unsupported' as const, snapshot: { toolJson: '{malformed' }, snapshotError: false },
      { code: 'source_unavailable' as const, snapshot: undefined, snapshotError: true },
    ]
    for (const scenario of scenarios) {
      const grantRow = grant()
      const activeGrant = normalizeStoredAgentAccessGrant(grantRow)
      const reservation = {
        quoteRef,
        principalId: principal.principalId,
        credentialId: principal.credentialId,
        applicationRef: principal.applicationRef,
        grantRef: activeGrant.grantRef,
        grantGeneration: activeGrant.generation,
        policyDigest: activeGrant.spendingPolicyDigest,
        grantExpiresAt: activeGrant.expiresAt,
        environment: principal.environment,
        toolRef,
        idempotencyKey: `idempotency:empty-replay:${scenario.code}`,
        inputDigest: canonicalDigest(input),
        requestDigest: canonicalDigest({ toolRef, input }),
        callRef: `operation-invocation:v1:empty-replay:${scenario.code}`,
      }
      let recorded: Record<string, unknown> | undefined
      let abandoned: Record<string, unknown> | undefined
      const runMutation = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
        switch (functionPath(reference)) {
          case 'capabilityQuotes:admitCall':
            return true
          case 'capabilityCalls:resolveCallAgentAuthority':
            return args.principal
          case 'capabilityCalls:reserve':
            return { kind: 'replayed', reservation }
          case 'capabilityCalls:abandon':
            abandoned = args
            return { kind: 'abandoned' }
          case 'capabilityCalls:record':
            recorded = args
            return { kind: 'recorded' }
          case 'capabilityCalls:dispatch':
            throw new Error('dispatch_must_not_run')
          default:
            throw new Error(`unexpected_mutation:${functionPath(reference)}`)
        }
      })
      const runQuery = vi.fn(async (reference: unknown) => {
        switch (functionPath(reference)) {
          case 'capabilityQuotes:readForCall':
            return {
              toolRef,
              input,
              decisionPrice: { currency: 'AUD', exponent: 6, units: '1000000' },
              quoteRef,
              evidenceDigest: `sha256:${'b'.repeat(64)}`,
            }
          case 'capabilitySupplyTools:readCurrentPublishedToolSnapshot':
            if (scenario.snapshotError) throw new Error('source_unavailable')
            return scenario.snapshot
          case 'agentAccessPolicy:readActiveGrant':
            return activeGrant
          case 'capabilityCalls:readReplay':
            return { toolRef, state: 'pending' }
          case 'moneyManagedCall:readBooking':
            return { kind: 'not_required' }
          default:
            throw new Error(`unexpected_query:${functionPath(reference)}`)
        }
      })
      const result = await callHandler({ runMutation, runQuery }, {
        operationKey: `operation-invoke:empty-replay:${scenario.code}`,
        correlationId: `correlation:empty-replay:${scenario.code}`,
        principal,
        quoteRef,
        idempotencyKey: reservation.idempotencyKey,
      })
      expect(result).toMatchObject({ kind: 'refused', toolRef, code: scenario.code })
      expect(abandoned).toEqual({ ...reservation, ownerId: principal.ownerId })
      expect(recorded).toBeUndefined()
    }
  })
})

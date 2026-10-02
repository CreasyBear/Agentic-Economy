/// <reference types="vite/client" />
import { withSourceWrite } from '../../helpers/source-write-admission'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as CurrentToolReads from '../../../convex/lib/capabilitySupply/currentTool/reads'

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

vi.mock('../../../convex/lib/capabilitySupply/currentTool/reads', async (importOriginal) => ({
  ...await importOriginal<typeof CurrentToolReads>(),
  readCurrentPublishedTool: mocks.readCurrentPublishedTool,
}))

import {
  decideCallApproval,
  call,
  listPendingCallApprovals,
  reserve,
  expireStaleApproval,
} from '../../../convex/capabilityCalls'
import { AUTHORITY_REQUEST_TTL_MS } from '../../../convex/lib/capabilityExecution/callLifecycle/admissionApprovals'
import { canonicalOwnerApprovalDecisionHandler } from '../../../convex/lib/capabilityExecution/callLifecycle/ownerCallAuthority'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import {
  createPublicToolRef,
  materializeRuntimePublishedTool,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pricingConfigDecisionAmount } from '@/modules/money/public'
import { normalizeStoredAgentAccessGrant } from '@/modules/agent-access/policy'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { convexTest } from 'convex-test'
import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'

const convexModules = Object.fromEntries(Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
  .map(([path, load]) => [path.replace('../../../convex/', './'), load]))

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
function readField(row: Row, path: string): unknown {
  let value: unknown = row
  for (const segment of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = Reflect.get(value, segment)
  }
  return value
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
            filters.push((row) => readField(row, field) === value)
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
type AuthIdentity = Readonly<{ subject: string; tokenIdentifier: string; fva?: number[] }>
const registeredApprovalHandler = (decideCallApproval as unknown as { _handler: Handler })._handler
const approvalHandler: Handler = async (ctx, args) => registeredApprovalHandler(ctx, await approvalCommand(args))
async function approvalCommand(args: Record<string, unknown>) {
  const operationKey = `call-approval:${String(args.callRef)}:${String(args.decision)}`
  return await withSourceWrite('protected_action', { ...args, operationKey, correlationId: operationKey })
}
const listHandler = (listPendingCallApprovals as unknown as { _handler: Handler })._handler
const callHandler = (call as unknown as { _handler: Handler })._handler
const expireOneHandler = (expireStaleApproval as unknown as { _handler: Handler })._handler
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
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => {
  vi.useRealTimers()
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
    maximumSpend: pricingConfigDecisionAmount(operation.pricingConfig),
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
    createdAt: now - 100,
    updatedAt: now - 100,
    ...overrides,
  }
}

function acceptedQuote(overrides: Record<string, unknown> = {}): Row {
  const row = invocation()
  return {
    _id: 'capabilityQuotes:approval', quoteRef,
    state: 'consumed', consumedCallRef: row.callRef,
    accountRef: row.ownerId, principalId: row.principalId,
    credentialId: row.credentialId, applicationRef: row.applicationRef,
    environment: row.environment, grantRef: row.grantRef,
    grantGeneration: row.grantGeneration, grantPolicyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt, toolRef, toolJson: row.toolJson,
    normalizedInputJson: row.inputJson, inputDigest: row.inputDigest,
    toolMaterialDigest: operation.materialDigest,
    toolVersion: operation.identity.publicationRevision,
    // Accepted AUD consideration deliberately differs from the upstream price.
    decisionAudUnits: '7654321', expiresAt: now - 1,
    ...overrides,
  }
}

function seedAgentIdentity(db: MemoryDb, overrides: Record<string, unknown> = {}) {
  db.seed('principals', { _id: 'principals:approval', principalRef: principal.principalId,
    kind: 'agent', lifecycle: 'active', displayName: 'Research assistant' })
  db.seed('memberships', { _id: 'memberships:approval', accountRef: owner,
    memberPrincipalRef: principal.principalId, lifecycle: 'active' })
  db.seed('agentAccessPrincipals', { _id: 'agentAccessPrincipals:approval',
    principalId: principal.principalId, ownerId: owner, applicationRef: principal.applicationRef,
    environment: principal.environment, ...overrides })
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
    scheduler: { runAfter: vi.fn(async (..._args: unknown[]) => undefined) },
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
      createdAt: now - 200,
      updatedAt: now - 200,
      inputJson: JSON.stringify({ secret: 'must-not-project' }),
      result: needsAuthorityResult('operation-invocation:v1:older'),
    }))
    ctx.db.seed('capabilityCalls', invocation({
      _id: 'capabilityCalls:expired',
      callRef: 'operation-invocation:v1:expired',
      grantExpiresAt: 1_000_000,
      createdAt: now - 300,
      updatedAt: now - 300,
      result: needsAuthorityResult('operation-invocation:v1:expired'),
    }))
    ctx.db.seed('capabilityCalls', invocation({
      _id: 'capabilityCalls:other-owner',
      callRef: 'operation-invocation:v1:other-owner',
      ownerId: 'owner:other',
      createdAt: now - 400,
      updatedAt: now - 400,
      result: needsAuthorityResult('operation-invocation:v1:other-owner'),
    }))

    const result = await listHandler(ctx, {})

    expect(result).toEqual([
      expect.objectContaining({ callRef: 'operation-invocation:v1:approval', createdAt: now - 100 }),
      expect.objectContaining({ callRef: 'operation-invocation:v1:older', createdAt: now - 200 }),
    ])
    expect(JSON.stringify(result)).not.toContain('must-not-project')
    expect((result as Array<Record<string, unknown>>).every((item) => Object.keys(item).sort().join(',') === 'authorityRequest,callRef,createdAt,decisionContext,toolRef')).toBe(true)
  })

  it('projects accepted Quote facts after expiry, with current Agent label and explicit unrecorded facts', async () => {
    const ctx = context({ invocation: invocation() })
    ctx.db.seed('capabilityQuotes', acceptedQuote())
    seedAgentIdentity(ctx.db)
    mocks.readCurrentPublishedTool.mockClear()

    const result = await listHandler(ctx, {})

    expect(result).toMatchObject([{ decisionContext: {
      agent: { principalRef: principal.principalId, applicationRef: principal.applicationRef, currentDisplayName: 'Research assistant' },
      purpose: null,
      acceptedQuote: {
        kind: 'available', quoteRef,
        tool: { name: operation.contract.name, description: operation.contract.description },
        provider: { ref: operation.identity.businessId, name: null },
        maximumSpend: { currency: 'AUD', units: '7654321', exponent: 6 },
        dataUse: operation.contract.dataUse, effects: operation.contract.effects,
      },
    } }])
    expect(mocks.readCurrentPublishedTool).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('inputJson')
    expect(JSON.stringify(result)).not.toContain('credential:approval')
    expect(ctx.db.rows('capabilityQuotes')).toEqual([acceptedQuote()])
  })

  it.each([quoteRef, undefined])('keeps a pending approval visible when its Quote or reference is missing: %s', async (reference) => {
    const ctx = context({ invocation: invocation({ quoteRef: reference }) })
    const query = vi.spyOn(ctx.db, 'query')
    await expect(listHandler(ctx, {})).resolves.toMatchObject([{ decisionContext: {
      agent: { currentDisplayName: null }, purpose: null,
      acceptedQuote: { kind: 'unavailable', reason: 'quote_missing' },
    } }])
    if (reference === undefined) expect(query).not.toHaveBeenCalledWith('capabilityQuotes')
  })

  it.each([
    { state: 'issued' }, { consumedCallRef: 'call:other' }, { accountRef: 'account:other' },
    { principalId: 'agent:other' }, { credentialId: 'credential:other' }, { applicationRef: 'app:other' },
    { environment: 'production' }, { grantRef: 'grant:other' }, { grantGeneration: 2 },
    { grantPolicyDigest: 'sha256:other' }, { grantExpiresAt: grantExpiresAt + 1 },
    { toolRef: 'tool:other' }, { inputDigest: 'sha256:other' },
    { normalizedInputJson: '{"secret":"other-account-input"}' }, { toolJson: '{}' },
  ])('does not project facts from a Quote whose accepted linkage differs: %j', async (overrides) => {
    const ctx = context({ invocation: invocation() })
    ctx.db.seed('capabilityQuotes', acceptedQuote(overrides))
    const result = await listHandler(ctx, {})
    expect(result).toMatchObject([{ decisionContext: { acceptedQuote: { kind: 'unavailable', reason: 'quote_mismatch' } } }])
    expect(JSON.stringify(result)).not.toContain('other-account-input')
  })

  it.each([
    { decisionAudUnits: '-1' }, { decisionAudUnits: 'NaN' },
    { toolMaterialDigest: 'sha256:other' }, { toolVersion: operation.identity.publicationRevision + 1 },
  ])('marks malformed accepted decision material unavailable: %j', async (overrides) => {
    const ctx = context({ invocation: invocation() })
    ctx.db.seed('capabilityQuotes', acceptedQuote(overrides))
    await expect(listHandler(ctx, {})).resolves.toMatchObject([{ decisionContext: {
      acceptedQuote: { kind: 'unavailable', reason: 'material_invalid' },
    } }])
  })

  it('does not endorse an authority request that disagrees with the retained Tool contract', async () => {
    const ctx = context({ invocation: invocation({ result: {
      ...needsAuthorityResult(String(invocation().callRef)),
      authorityRequest: { ...authorityRequest(), dataFields: ['/invented'] },
    } }) })
    ctx.db.seed('capabilityQuotes', acceptedQuote())
    await expect(listHandler(ctx, {})).resolves.toMatchObject([{ decisionContext: {
      acceptedQuote: { kind: 'unavailable', reason: 'material_invalid' },
    } }])
  })

  it.each([{ ownerId: 'account:other' }, { applicationRef: 'app:other' }, { environment: 'production' }])(
    'does not project another Account or application Agent label: %j', async (overrides) => {
      const ctx = context({ invocation: invocation() })
      seedAgentIdentity(ctx.db, overrides)
      await expect(listHandler(ctx, {})).resolves.toMatchObject([{ decisionContext: { agent: { currentDisplayName: null } } }])
    },
  )

  it('removes the current Agent label after membership revocation without replacing accepted Tool facts', async () => {
    const ctx = context({ invocation: invocation() })
    ctx.db.seed('capabilityQuotes', acceptedQuote())
    seedAgentIdentity(ctx.db)
    await ctx.db.patch('memberships:approval', { lifecycle: 'revoked' })
    await expect(listHandler(ctx, {})).resolves.toMatchObject([{ decisionContext: {
      agent: { currentDisplayName: null }, acceptedQuote: { kind: 'available', tool: { name: operation.contract.name } },
    } }])
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

  it('never dispatches an owner-chat Call when the owner session lacks fresh factor verification', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation({ applicationRef: 'ae-owner-chat' })
    const ctx = context({ invocation: row, grant: grant({ applicationRef: 'ae-owner-chat' }) })
    ctx.db.seed('capabilityQuotes', acceptedQuote({ applicationRef: 'ae-owner-chat', expiresAt: now + 60_000,
      maximumSpendPerCallUnits: '10000000', dailyPeriodAvailableUnits: '100000000', monthlyPeriodAvailableUnits: '100000000' }))
    const result = await canonicalOwnerApprovalDecisionHandler(ctx as never, await approvalCommand({
      callRef: String(row.callRef), decision: 'approve',
    }) as never)
    expect(result).toEqual({ kind: 'refused', code: 'mfa_reverification_required' })
    expect(ctx.db.row('capabilityCalls', row._id)).toMatchObject({ state: 'pending', dispatchState: 'pending' })
    expect(mocks.enqueueAction).not.toHaveBeenCalled()
  })

  it('dispatches only the exact fresh owner-chat Quote and Call with verified owner factors', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation({ applicationRef: 'ae-owner-chat' })
    const identity = ownerIdentity
    const ctx = context({ identity, invocation: row, grant: grant({ applicationRef: 'ae-owner-chat' }) })
    ctx.db.seed('capabilityQuotes', acceptedQuote({
      applicationRef: 'ae-owner-chat', expiresAt: now + 60_000,
      maximumSpendPerCallUnits: '10000000', dailyPeriodAvailableUnits: '100000000',
      monthlyPeriodAvailableUnits: '100000000',
      consumedCallRef: 'operation-invocation:v1:other',
    }))
    expect(await canonicalOwnerApprovalDecisionHandler(ctx as never, await approvalCommand({
      callRef: String(row.callRef), decision: 'approve', proof: { reverificationId: 'proof:owner-chat',
        firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1, subject: ownerIdentity.subject, evidenceObservedAt: now },
    }) as never)).toEqual({ kind: 'refused', code: 'invocation_invalid' })
    expect(mocks.enqueueAction).not.toHaveBeenCalled()
    await ctx.db.patch('capabilityQuotes:approval', { consumedCallRef: row.callRef })
    expect(await canonicalOwnerApprovalDecisionHandler(ctx as never, await approvalCommand({
      callRef: String(row.callRef), decision: 'approve', proof: { reverificationId: 'proof:owner-chat',
        firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1, subject: ownerIdentity.subject, evidenceObservedAt: now },
    }) as never)).toEqual({ kind: 'approved', callRef: row.callRef })
    expect(mocks.enqueueAction).toHaveBeenCalledTimes(1)
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

  it.each(['completed', 'refused', 'cancelled'] as const)(
    'reads the committed owner-chat approval after Call %s without fresh MFA or another dispatch', async state => {
      mocks.enqueueAction.mockClear()
      const row = invocation({ applicationRef: 'ae-owner-chat' })
      const ctx = context({ invocation: row, grant: grant({ applicationRef: 'ae-owner-chat' }) })
      ctx.db.seed('capabilityQuotes', acceptedQuote({ applicationRef: 'ae-owner-chat', expiresAt: now + 60_000,
        maximumSpendPerCallUnits: '10000000', dailyPeriodAvailableUnits: '100000000', monthlyPeriodAvailableUnits: '100000000' }))
      const command = { callRef: String(row.callRef), decision: 'approve' as const }
      expect(await approvalHandler(ctx, { ...command, proof: {
        reverificationId: `proof:owner-chat:terminal:${state}`, firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: 0, subject: ownerIdentity.subject, evidenceObservedAt: now,
      } })).toEqual({ kind: 'approved', callRef: row.callRef })
      await ctx.db.patch(row._id, { state, result: state === 'completed'
        ? { kind: 'completed', callRef: row.callRef, toolRef, output: { value: 1 } }
        : { kind: 'refused', toolRef, code: state === 'cancelled' ? 'invocation_cancelled' : 'provider_unavailable', retryable: false },
      ...(state === 'cancelled' ? { workId: undefined } : {}) })
      const committed = structuredClone(ctx.db.row('capabilityCalls', row._id))
      const proofs = structuredClone(ctx.db.rows('consequenceProofUses'))
      const nonces = structuredClone(ctx.db.rows('sourceWriteNonces'))
      expect(await approvalHandler(ctx, command)).toEqual({ kind: 'replayed', callRef: row.callRef })
      expect(await approvalHandler(ctx, { ...command, decision: 'deny' })).toEqual({ kind: 'refused', code: 'authority_not_pending' })
      expect(ctx.db.row('capabilityCalls', row._id)).toEqual(committed)
      expect(ctx.db.rows('consequenceProofUses')).toEqual(proofs)
      expect(ctx.db.rows('sourceWriteNonces')).toEqual(nonces)
      expect(mocks.enqueueAction).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['first_factor', 'stale', 'wrong_subject', 'unsigned', 'modified_command'] as const)(
    'owner-chat %s evidence cannot enqueue or consume a proof', async mode => {
      mocks.enqueueAction.mockClear()
      const row = invocation({ applicationRef: 'ae-owner-chat' })
      const ctx = context({ invocation: row, grant: grant({ applicationRef: 'ae-owner-chat' }) })
      ctx.db.seed('capabilityQuotes', acceptedQuote({ applicationRef: 'ae-owner-chat', expiresAt: now + 60_000,
        maximumSpendPerCallUnits: '10000000', dailyPeriodAvailableUnits: '100000000', monthlyPeriodAvailableUnits: '100000000' }))
      const command = await approvalCommand({ callRef: String(row.callRef), decision: 'approve', proof: {
        reverificationId: 'proof:owner-chat:refused', firstFactorAgeMinutes: 1,
        secondFactorAgeMinutes: mode === 'first_factor' ? -1 : 1,
        subject: mode === 'wrong_subject' ? 'user_other' : ownerIdentity.subject,
        evidenceObservedAt: mode === 'stale' ? now - 10 * 60_000 : now,
      } })
      const args = mode === 'unsigned' ? { ...command, sourceWrite: undefined }
        : mode === 'modified_command' ? { ...command, decision: 'deny' } : command
      expect(await canonicalOwnerApprovalDecisionHandler(ctx as never, args as never)).toEqual({ kind: 'refused',
        code: mode === 'unsigned' || mode === 'modified_command' ? 'invocation_invalid' : 'mfa_reverification_required' })
      expect(mocks.enqueueAction).not.toHaveBeenCalled()
      expect(ctx.db.rows('consequenceProofUses')).toHaveLength(0)
      expect(ctx.db.rows('sourceWriteNonces')).toHaveLength(0)
      expect(ctx.db.row('capabilityCalls', row._id)).toMatchObject({ state: 'pending', dispatchState: 'pending' })
    },
  )

  it('owner-chat denial needs no proof and its terminal retry never enqueues', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation({ applicationRef: 'ae-owner-chat' })
    const ctx = context({ invocation: row })
    const command = { callRef: String(row.callRef), decision: 'deny' as const }
    expect(await approvalHandler(ctx, command)).toEqual({ kind: 'denied', callRef: row.callRef })
    expect(await approvalHandler(ctx, command)).toEqual({ kind: 'replayed', callRef: row.callRef })
    expect(mocks.enqueueAction).not.toHaveBeenCalled()
    expect(ctx.db.rows('consequenceProofUses')).toHaveLength(0)
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
    expect(ctx.db.row('capabilityCalls', row._id)?.reconciliation).toBeUndefined()
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
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
      decisionAudUnits: '0',
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
      now: now + 1_000,
    })
    expect(next).toMatchObject({ kind: 'reserved' })
  })
  it('reconciles a reserved hold after denial, but never refuses an uncertain hold', async () => {
    const reserved = invocation({
      formanceFinancialState: 'reserved',
      formanceReservationRefs: ['reservation:1', 'reservation:2', 'reservation:3'],
    })
    const ctx = context({ invocation: reserved })
    expect(await approvalHandler(ctx, { callRef: reserved.callRef, decision: 'deny' }))
      .toEqual({ kind: 'denied', callRef: reserved.callRef })
    expect(ctx.db.row('capabilityCalls', reserved._id)).toMatchObject({
      state: 'refused', dispatchState: 'failed',
      result: { kind: 'refused', code: 'authority_denied' },
      reconciliation: { reason: 'refund_pending', nextAttemptAt: now },
    })
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1)
    const [delay, reference, args] = ctx.scheduler.runAfter.mock.calls[0] ?? []
    expect(delay).toBe(0)
    expect(reference === undefined ? undefined : functionPath(reference))
      .toBe('capabilityCallWorker:reconcilePreClaimRefund')
    expect(args).toEqual({ callRef: reserved.callRef })
    expect(await approvalHandler(ctx, { callRef: reserved.callRef, decision: 'deny' }))
      .toEqual({ kind: 'replayed', callRef: reserved.callRef })
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1)

    const uncertain = invocation({ formanceFinancialState: 'possibly_submitted' })
    const uncertainCtx = context({ invocation: uncertain })
    expect(await approvalHandler(uncertainCtx, { callRef: uncertain.callRef, decision: 'deny' }))
      .toEqual({ kind: 'refused', code: 'invocation_invalid' })
    expect(uncertainCtx.db.row('capabilityCalls', uncertain._id)).toMatchObject({
      state: 'pending', dispatchState: 'pending', result: { kind: 'needs_authority' },
    })
    expect(uncertainCtx.scheduler.runAfter).not.toHaveBeenCalled()
  })
})
describe('approval request expiry', () => {
  function scheduledApprovalDocument(callRef: string, createdAt: number, overrides: Record<string, unknown> = {}) {
    return {
      callRef,
      principalId: principal.principalId,
      ownerId: owner,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      toolRef,
      idempotencyKey: `idempotency:${callRef}`,
      environment: 'sandbox' as const,
      grantRef: 'grant:approval',
      grantGeneration: 1,
      policyDigest: approvalPolicyDigest,
      grantExpiresAt,
      inputDigest: canonicalDigest(input),
      requestDigest: canonicalDigest({ toolRef, input }),
      state: 'pending' as const,
      result: {
        ...needsAuthorityResult(callRef),
        authorityRequest: {
          ...authorityRequest(),
          maximumSpend: { currency: 'AUD', units: '1000000', exponent: 6 },
        },
      },
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    }
  }

  it('drains 201 clean stale approvals sharing one timestamp through the scheduled continuation', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const cutoff = now - AUTHORITY_REQUEST_TTL_MS
    const refs = await backend.run(async ({ db }) => {
      const callRefs: string[] = []
      for (let index = 0; index < 201; index += 1) {
        const callRef = `operation-invocation:v1:expiry-drain-${index}`
        callRefs.push(callRef)
        await db.insert('capabilityCalls', scheduledApprovalDocument(callRef, cutoff))
      }
      return callRefs
    })
    await backend.mutation(internal.workloadCron.expireStalePendingApprovals, {})
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await backend.run(async ({ db }) => db.query('capabilityCalls').collect())
    expect(rows).toHaveLength(201)
    expect(rows.every((row) => row.state === 'refused'
      && row.result?.kind === 'refused' && row.result.code === 'authority_denied')).toBe(true)
    expect(new Set(rows.map((row) => row.callRef))).toEqual(new Set(refs))
  })

  it('continues past a full page of blocked approvals to expire clean rows at the same timestamp', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const cutoff = now - AUTHORITY_REQUEST_TTL_MS
    await backend.run(async ({ db }) => {
      for (let index = 0; index < 200; index += 1) {
        const callRef = `operation-invocation:v1:expiry-blocked-${index}`
        await db.insert('capabilityCalls', scheduledApprovalDocument(callRef, cutoff, {
          workId: `workpool:${index}`,
        }))
      }
      await db.insert('capabilityCalls', scheduledApprovalDocument(
        'operation-invocation:v1:expiry-after-blocked-page', cutoff,
      ))
      await db.insert('capabilityCalls', scheduledApprovalDocument(
        'operation-invocation:v1:expiry-next-sweep', cutoff + 1,
      ))
    })
    await backend.mutation(internal.workloadCron.expireStalePendingApprovals, {})
    const scheduled = await backend.run(({ db }) => db.system.query('_scheduled_functions').collect())
    expect(scheduled).toMatchObject([{
      name: 'capabilityCalls:continueApprovalExpiry',
      args: [{ continuation: { cutoff, cursor: expect.any(String) } }],
    }])
    vi.setSystemTime(now + 5_000)
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await backend.run(async ({ db }) => db.query('capabilityCalls').collect())
    const blocked = rows.filter((row) => row.workId !== undefined)
    const clean = rows.find((row) => row.callRef === 'operation-invocation:v1:expiry-after-blocked-page')
    expect(blocked).toHaveLength(200)
    expect(blocked.every((row) => row.state === 'pending')).toBe(true)
    expect(clean).toMatchObject({ state: 'refused', result: { kind: 'refused', code: 'authority_denied' } })
    expect(rows.find(row => row.callRef === 'operation-invocation:v1:expiry-next-sweep')).toMatchObject({ state: 'pending' })
  })

  it('resumes queued timestamp-only continuations inclusively without losing tied approvals', async () => {
    const backend = convexTest(schema, convexModules)
    const cutoff = now - AUTHORITY_REQUEST_TTL_MS
    await backend.run(async ({ db }) => {
      for (let index = 0; index < 201; index += 1) {
        await db.insert('capabilityCalls', scheduledApprovalDocument(`operation-invocation:v1:legacy-expiry-${index}`, cutoff))
      }
    })
    await expect(backend.mutation(internal.capabilityCalls.continueApprovalExpiry, { afterCreatedAt: cutoff }))
      .resolves.toEqual({ scanned: 200, scheduled: 200, blocked: 0 })
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    const rows = await backend.run(({ db }) => db.query('capabilityCalls').collect())
    expect(rows).toHaveLength(201)
    expect(rows.every(row => row.state === 'refused')).toBe(true)
  })

  it('rejects an invalid continuation before scheduling or changing approvals', async () => {
    const backend = convexTest(schema, convexModules)
    const cutoff = now - AUTHORITY_REQUEST_TTL_MS
    await backend.run(({ db }) => db.insert('capabilityCalls', scheduledApprovalDocument('operation-invocation:v1:invalid-cursor', cutoff)))
    const before = await backend.run(({ db }) => db.query('capabilityCalls').collect())
    for (const continuation of [
      { cutoff, cursor: '' },
      { cutoff: cutoff + 1, cursor: 'invalid' },
      { cutoff, cursor: 'invalid' },
    ]) {
      await expect(backend.mutation(internal.capabilityCalls.continueApprovalExpiry, { continuation })).rejects.toThrow()
    }
    expect(await backend.run(({ db }) => db.query('capabilityCalls').collect())).toEqual(before)
    expect(await backend.run(({ db }) => db.system.query('_scheduled_functions').collect())).toEqual([])
  })

  it('commits one refusal and one refund job for concurrent expiry attempts', async () => {
    const backend = convexTest(schema, convexModules)
    const callRef = 'operation-invocation:v1:concurrent-expiry'
    await backend.run(({ db }) => db.insert('capabilityCalls', scheduledApprovalDocument(callRef, now - AUTHORITY_REQUEST_TTL_MS, {
      formanceFinancialState: 'reserved', formanceReservationRefs: ['reservation:1', 'reservation:2', 'reservation:3'],
    })))
    await Promise.all([
      backend.mutation(internal.capabilityCalls.expireStaleApproval, { callRef }),
      backend.mutation(internal.capabilityCalls.expireStaleApproval, { callRef }),
    ])
    const rows = await backend.run(({ db }) => db.query('capabilityCalls').collect())
    expect(rows).toMatchObject([{ state: 'refused', result: { code: 'authority_denied' }, reconciliation: { reason: 'refund_pending' } }])
    const jobs = await backend.run(({ db }) => db.system.query('_scheduled_functions').collect())
    expect(jobs).toMatchObject([{ name: 'capabilityCallWorker:reconcilePreClaimRefund', args: [{ callRef }] }])
  })


  it('schedules clean approvals at the exact TTL, preserving blocked and younger requests', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const cutoff = now - AUTHORITY_REQUEST_TTL_MS
    const staleRef = 'operation-invocation:v1:stale-reserved'
    const blockedRef = 'operation-invocation:v1:blocked'
    const youngRef = 'operation-invocation:v1:young'
    await backend.run(async ({ db }) => {
      await db.insert('capabilityCalls', scheduledApprovalDocument(staleRef, cutoff, {
        formanceFinancialState: 'reserved', formanceReservationRefs: ['reservation:1', 'reservation:2', 'reservation:3'],
      }))
      await db.insert('capabilityCalls', scheduledApprovalDocument(blockedRef, cutoff, { workId: 'workpool:blocked' }))
      await db.insert('capabilityCalls', scheduledApprovalDocument(youngRef, cutoff + 1))
    })
    const workload = await backend.query(internal.workloadCron.admit, { name: 'expire stale pending approvals' })
    await expect(backend.mutation(internal.capabilityCalls.expireStalePendingApprovals, { workload }))
      .resolves.toEqual({ scanned: 2, scheduled: 1, blocked: 1 })
    const scheduled = await backend.run(({ db }) => db.system.query('_scheduled_functions').collect())
    expect(scheduled).toMatchObject([{ name: 'capabilityCalls:expireStaleApproval', args: [{ callRef: staleRef }] }])
    await backend.mutation(internal.capabilityCalls.expireStaleApproval, { callRef: staleRef })
    const rows = await backend.run(({ db }) => db.query('capabilityCalls').collect())
    expect(rows.find(row => row.callRef === staleRef)).toMatchObject({
      state: 'refused', dispatchState: 'failed',
      result: { kind: 'refused', code: 'authority_denied' },
      reconciliation: { reason: 'refund_pending', nextAttemptAt: now },
    })
    expect(rows.find(row => row.callRef === blockedRef)).toMatchObject({ state: 'pending' })
    expect(rows.find(row => row.callRef === youngRef)).toMatchObject({ state: 'pending' })
  })

  it('rechecks expiry and funds when executing a scheduled refusal, and replays safely', async () => {
    const stale = invocation({
      createdAt: now - AUTHORITY_REQUEST_TTL_MS - 1,
      formanceFinancialState: 'reserved',
      formanceReservationRefs: ['reservation:1', 'reservation:2', 'reservation:3'],
    })
    const ctx = context({ invocation: stale })
    await expect(expireOneHandler(ctx, { callRef: stale.callRef })).resolves.toBeNull()
    const refused = ctx.db.row('capabilityCalls', stale._id)
    expect(refused).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'authority_denied' },
      reconciliation: { reason: 'refund_pending' },
    })
    await expect(expireOneHandler(ctx, { callRef: stale.callRef })).resolves.toBeNull()
    expect(ctx.db.row('capabilityCalls', stale._id)).toEqual(refused)
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(1)
    for (const overrides of [
      { createdAt: now - AUTHORITY_REQUEST_TTL_MS + 1 },
      { createdAt: now - AUTHORITY_REQUEST_TTL_MS - 1, formanceFinancialState: 'possibly_submitted' },
    ]) {
      const row = invocation(overrides)
      const pendingCtx = context({ invocation: row })
      await expect(expireOneHandler(pendingCtx, { callRef: row.callRef })).resolves.toBeNull()
      expect(pendingCtx.db.row('capabilityCalls', row._id)).toEqual(row)
      expect(pendingCtx.scheduler.runAfter).not.toHaveBeenCalled()
    }
  })

  it('refuses an owner approval at the exact TTL before the sweep runs', async () => {
    const row = invocation({ createdAt: now - AUTHORITY_REQUEST_TTL_MS })
    const ctx = context({ invocation: row, grant: grant() })
    await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'approve' }))
      .resolves.toEqual({ kind: 'refused', code: 'authority_not_pending' })
    expect(ctx.db.row('capabilityCalls', row._id)).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'authority_denied' },
    })
    await expect(expireOneHandler(ctx, { callRef: row.callRef })).resolves.toBeNull()
  })

  it('does not refuse expired approvals whose funds may have been submitted', async () => {
    const row = invocation({
      createdAt: now - AUTHORITY_REQUEST_TTL_MS - 1,
      formanceFinancialState: 'possibly_submitted',
    })
    const ctx = context({ invocation: row, grant: grant() })
    await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'approve' }))
      .resolves.toEqual({ kind: 'refused', code: 'invocation_invalid' })
    expect(ctx.db.row('capabilityCalls', row._id)).toEqual(row)
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled()
  })

  it('a denial never dispatches an approval', async () => {
    mocks.enqueueAction.mockClear()
    const row = invocation()
    const ctx = context({ invocation: row, grant: grant() })
    await expect(approvalHandler(ctx, { callRef: row.callRef, decision: 'deny' }))
      .resolves.toEqual({ kind: 'denied', callRef: row.callRef })
    expect(ctx.db.row('capabilityCalls', row._id)).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'authority_denied' },
    })
    expect(mocks.enqueueAction).not.toHaveBeenCalled()
  })

  it('refuses an approval decision after its pending authority expires', async () => {
    const expired = invocation({ createdAt: now - AUTHORITY_REQUEST_TTL_MS - 1 })
    const ctx = context({ invocation: expired, grant: grant() })
    await expect(approvalHandler(ctx, { callRef: expired.callRef, decision: 'approve' }))
      .resolves.toEqual({ kind: 'refused', code: 'authority_not_pending' })
    expect(ctx.db.row('capabilityCalls', expired._id)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'authority_denied' },
    })
  })
  it('runs the real admitted cron target and reconciles a stale reserved approval', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    const callRef = 'operation-invocation:v1:cron-expiry'
    await backend.run(async ({ db }) => {
      await db.insert('capabilityCalls', {
        callRef,
        principalId: principal.principalId,
        ownerId: owner,
        credentialId: principal.credentialId,
        applicationRef: principal.applicationRef,
        toolRef,
        idempotencyKey: 'idempotency:cron-expiry',
        environment: 'sandbox',
        grantRef: 'grant:approval',
        grantGeneration: 1,
        policyDigest: approvalPolicyDigest,
        grantExpiresAt,
        inputDigest: canonicalDigest(input),
        requestDigest: canonicalDigest({ toolRef, input }),
        state: 'pending',
        formanceFinancialState: 'reserved',
        formanceReservationRefs: ['reservation:1', 'reservation:2', 'reservation:3'],
        result: {
          ...needsAuthorityResult(callRef),
          authorityRequest: {
            ...authorityRequest(),
            maximumSpend: { currency: 'AUD', units: '1000000', exponent: 6 },
          },
        },
        createdAt: now - AUTHORITY_REQUEST_TTL_MS - 1,
        updatedAt: now - AUTHORITY_REQUEST_TTL_MS - 1,
      })
    })

    await expect(backend.mutation(internal.workloadCron.expireStalePendingApprovals, {}))
      .resolves.toBeNull()
    await backend.finishAllScheduledFunctions(vi.runAllTimers)
    const row = await backend.run(async ({ db }) => db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique())
    expect(row).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'authority_denied' },
      reconciliation: { reason: 'refund_pending' },
    })
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
          case 'moneyMonthlySpendBudget:readOrganizationMonthlySpendBudgetForAccount':
            return { enabled: false, ceilingUnits: '0' }
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
          case 'moneyMonthlySpendBudget:readOrganizationMonthlySpendBudgetForAccount':
            return { enabled: false, ceilingUnits: '0' }
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

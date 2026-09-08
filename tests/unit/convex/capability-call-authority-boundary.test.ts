import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: {
    kind: 'authenticated_owner' as const,
    clerkUserId: 'clerk|owner',
    canonicalPrincipalRef: `prn_${'1'.repeat(32)}`,
    canonicalAccountRef: `acc_${'2'.repeat(32)}`,
    authorityRevision: {},
    authorityProvenance: {},
  } as Record<string, unknown>,
  call: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => args.principal),
  list: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    page: [],
    isDone: true,
    continueCursor: '',
    principal: args.principal,
  })),
  readStatus: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found', callRef: args.callRef, toolRef: 'operation:test', state: 'pending',
  })),
  cancel: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found', callRef: args.callRef, toolRef: 'operation:test', state: 'cancelled',
  })),
  reconcile: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found', callRef: args.callRef, toolRef: 'operation:test', state: 'terminal',
  })),
  readOwner: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null>; marker?: string } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    marker: ctx.auth.marker,
    callRef: args.callRef,
  })),
  cancelOwner: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    callRef: args.callRef,
  })),
  reconcileOwner: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    callRef: args.callRef,
  })),
  listApprovals: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => [
    await ctx.auth.getUserIdentity(),
  ]),
  decideApproval: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    callRef: args.callRef,
  })),
}))

vi.mock('../../../convex/authz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/authz')>()),
  resolveBusinessActor: vi.fn(async () => mocks.actor),
}))

vi.mock('../../../convex/lib/callLifecycle/callActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/lib/callLifecycle/callActions')>()),
  callHandler: mocks.call,
  listAgentCallsHandler: mocks.list,
  readCallStatusHandler: mocks.readStatus,
  cancelCallHandler: mocks.cancel,
  reconcileCallHandler: mocks.reconcile,
  readOwnerCallStatusHandler: mocks.readOwner,
  cancelOwnerCallHandler: mocks.cancelOwner,
  reconcileOwnerCallHandler: mocks.reconcileOwner,
}))

vi.mock('../../../convex/lib/callLifecycle/admission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/lib/callLifecycle/admission')>()),
  listPendingCallApprovalsHandler: mocks.listApprovals,
  decideCallApprovalHandler: mocks.decideApproval,
}))

import {
  cancelCall,
  cancelOwnerCall,
  decideCallApproval,
  call,
  listCalls,
  listPendingCallApprovals,
  readCallStatus,
  readOwnerCallStatus,
  reconcileCall,
  reconcileOwnerCall,
  reconcileCallWorkloadAuthority,
  resolveCallAgentAuthority,
} from '../../../convex/capabilityCalls'
import { registerAgentPrincipal } from '../../../convex/agentAccessPrincipals'
import { registerGrantForServer } from '../../../convex/agentAccessPolicy'
import { validateCanonicalAgentDelegation } from '../../../convex/lib/canonicalAgentAuthority'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { createCustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import { agentAccessPolicyDigest } from '@/modules/agent-access/policy'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
type IsolationCaseKind =
  | 'owner'
  | 'member'
  | 'workload'
  | 'missing_workload'
  | 'stranger'
  | 'wrong_account'
  | 'stale_generation'

const ISOLATION_CASES = [
  'owner',
  'member',
  'workload',
  'missing_workload',
  'stranger',
  'wrong_account',
  'stale_generation',
] as const satisfies readonly IsolationCaseKind[]
const callBoundary = (call as unknown as { _handler: Handler })._handler
const listBoundary = (listCalls as unknown as { _handler: Handler })._handler
const statusBoundary = (readCallStatus as unknown as { _handler: Handler })._handler
const cancelBoundary = (cancelCall as unknown as { _handler: Handler })._handler
const reconcileBoundary = (reconcileCall as unknown as { _handler: Handler })._handler
const ownerStatusBoundary = (readOwnerCallStatus as unknown as { _handler: Handler })._handler
const ownerCancelBoundary = (cancelOwnerCall as unknown as { _handler: Handler })._handler
const ownerReconcileBoundary = (reconcileOwnerCall as unknown as { _handler: Handler })._handler
const listApprovalBoundary = (listPendingCallApprovals as unknown as { _handler: Handler })._handler
const decideApprovalBoundary = (decideCallApproval as unknown as { _handler: Handler })._handler
const resolveAgentBoundary = (resolveCallAgentAuthority as unknown as { _handler: Handler })._handler
const reconcileWorkloadBoundary = (reconcileCallWorkloadAuthority as unknown as { _handler: Handler })._handler
const registerAgentBoundary = (registerAgentPrincipal as unknown as { _handler: Handler })._handler
const registerGrantBoundary = (registerGrantForServer as unknown as { _handler: Handler })._handler

const callerPrincipal = {
  principalId: `prn_${'3'.repeat(32)}`,
  ownerId: `acc_${'4'.repeat(32)}`,
  credentialId: 'ak_live_locator',
  applicationRef: 'agentic-economy',
  environment: 'production' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'spending_policy' as const,
}
const canonicalPrincipal = {
  ...callerPrincipal,
}

function path(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

function agentContext(
  result: typeof canonicalPrincipal | null = canonicalPrincipal,
  committedOperationRef = OPERATION_REF,
) {
  return {
    runMutation: vi.fn(async (reference: unknown, _args: Record<string, unknown>) => {
      if (path(reference) === 'capabilityQuotes:admitCall') return true
      if (path(reference) === 'capabilityCalls:resolveCallAgentAuthority') return result
      throw new Error(`unexpected_mutation:${path(reference)}`)
    }),
    runQuery: vi.fn(async (reference: unknown) => {
      if (path(reference) === 'capabilityQuotes:readForCall') return {
        toolRef: committedOperationRef,
        input: { query: 'btc' },
        decisionPrice: { currency: 'AUD', exponent: 6, units: '0' },
        quoteRef: COMMITMENT_REF,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
      }
      throw new Error(`unexpected_query:${path(reference)}`)
    }),
  }
}

function agentArgs() {
  return {
    operationKey: 'surface:http:agent-operation-invoke',
    correlationId: 'correlation:operation:1',
    principal: callerPrincipal,
    quoteRef: COMMITMENT_REF,
    idempotencyKey: 'idempotency:operation:1',
  }
}

function agentListArgs() {
  return {
    operationKey: 'surface:http:agent-operation-list',
    correlationId: 'correlation:operation-list:1',
    principal: callerPrincipal,
    paginationOpts: { cursor: null, numItems: 20 },
  }
}

type Row = Record<string, unknown> & { _id: string }

class AuthorityMemoryDb {
  readonly patches: Array<Readonly<{ id: string; value: Record<string, unknown> }>> = []
  readonly insertions: Array<Readonly<{ table: string; value: Record<string, unknown> }>> = []

  constructor(private readonly tables: Readonly<Record<string, readonly Row[]>>) {}

  query(table: string) {
    const predicates: Array<(row: Row) => boolean> = []
    const rows = () => [...(this.tables[table] ?? [])].filter((row) => predicates.every((predicate) => predicate(row)))
    const query = {
      withIndex: (_index: string, build: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        const builder = {
          eq: (field: string, value: unknown) => {
            predicates.push((row) => row[field] === value)
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const matched = rows()
        if (matched.length > 1) throw new Error('expected_unique')
        return matched[0] ?? null
      },
      take: async (limit: number) => rows().slice(0, limit),
    }
    return query
  }

  async patch(id: string, value: Record<string, unknown>) {
    this.patches.push({ id, value })
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) Object.assign(row, value)
    }
  }

  async insert(table: string, value: Record<string, unknown>) {
    this.insertions.push({ table, value })
    const rows = (this.tables as Record<string, Row[]>)[table]
    if (rows === undefined) throw new Error(`missing_table:${table}`)
    rows.push({ _id: `${table}:${rows.length + 1}`, ...value })
  }
}

const NOW = 2_000_000
const BINDING_REF = `eid_${'5'.repeat(32)}`
const CREDENTIAL_REF = `crd_${'6'.repeat(32)}`
const PRINCIPAL_REF = canonicalPrincipal.principalId
const ACCOUNT_REF = canonicalPrincipal.ownerId
const GRANT_REF = `grt_${'7'.repeat(32)}`
const OWNERSHIP_REF = `own_${'8'.repeat(32)}`
const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const OTHER_OPERATION_REF = `operation:v1:${'b'.repeat(64)}`
const COMMITMENT_REF = `operation-commitment:v1:${'c'.repeat(64)}`
const PARENT_GRANT_REF = `grt_${'9'.repeat(32)}`
const AUTHORITY_POLICY = {
  format: 'ae.agent-access-policy:v1' as const,
  operationAccess: 'all_admitted' as const,
  environment: 'production' as const,
  budget: {
    budgetPolicyRef: 'budget:authority-boundary',
    generation: 4,
    currency: 'USD',
    exponent: 2,
    maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
    maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
    maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
    maximumConcurrentInvocations: 2,
  },
  rate: {
    ratePolicyRef: 'rate:authority-boundary',
    generation: 4,
    maximumCallsPerMinute: 10,
    maximumCallsPerHour: 100,
  },
}
const AUTHORITY_POLICY_DIGEST = canonicalDigest(AUTHORITY_POLICY as never)

function currentAuthorityGrantFields(): Record<string, unknown> {
  const spendingPolicy = {
    format: 'ae.agent-access-policy:v2' as const,
    toolAccess: 'all_admitted' as const,
    toolRefs: [] as string[],
    environment: AUTHORITY_POLICY.environment,
    budget: {
      budgetPolicyRef: AUTHORITY_POLICY.budget.budgetPolicyRef,
      generation: AUTHORITY_POLICY.budget.generation,
      currency: AUTHORITY_POLICY.budget.currency,
      exponent: AUTHORITY_POLICY.budget.exponent,
      maximumSpendPerCall: AUTHORITY_POLICY.budget.maximumSpendPerInvocation,
      maximumDailySpend: AUTHORITY_POLICY.budget.maximumDailySpend,
      maximumMonthlySpend: AUTHORITY_POLICY.budget.maximumMonthlySpend,
      maximumConcurrentCalls: AUTHORITY_POLICY.budget.maximumConcurrentInvocations,
    },
    rate: AUTHORITY_POLICY.rate,
  }
  return {
    format: 'ae.agent-access-grant:v2',
    authorityMode: 'spending_policy',
    toolAccess: 'all_admitted',
    toolRefs: [],
    spendingPolicy,
    spendingPolicyDigest: agentAccessPolicyDigest(spendingPolicy),
  }
}

function applyCurrentGrantFields(
  rows: ReturnType<typeof authorityRows>,
  fields: Record<string, unknown>,
): void {
  const grant = rows.agentAccessGrants[0]
  if (grant === undefined) throw new Error('current_grant_fixture_missing')
  const grantRecord = grant as Record<string, unknown>
  delete grantRecord.operationAccess
  delete grantRecord.policy
  delete grantRecord.policyDigest
  Object.assign(grant, fields)
}

function selectedAuthorityPolicy(operationRefs: readonly string[]) {
  const policy = {
    ...AUTHORITY_POLICY,
    format: 'ae.agent-access-policy:v2' as const,
    operationAccess: 'selected_operations' as const,
    operationRefs: [...operationRefs].sort(),
  }
  return { policy, policyDigest: canonicalDigest(policy as never) }
}

function selectedAccessGrant(operationRefs: readonly string[]) {
  const { policy, policyDigest } = selectedAuthorityPolicy(operationRefs)
  return {
    accessGrant: {
      format: 'ae.agent-access-grant:v2',
      operationAccess: 'selected_operations',
      operationRefs: [...policy.operationRefs],
      policy,
      policyDigest,
    },
    storedAgent: { spendingPolicyDigest: policyDigest },
  }
}

function authorityRows(overrides: Readonly<{
  binding?: Record<string, unknown>
  credential?: Record<string, unknown>
  principal?: Record<string, unknown>
  storedAgent?: Record<string, unknown>
  accessGrant?: Record<string, unknown>
  delegation?: Record<string, unknown>
  parentDelegation?: Record<string, unknown> | null
  account?: Record<string, unknown>
  invocation?: Record<string, unknown>
}> = {}) {
  return {
    externalIdentityBindings: [{
      _id: 'externalIdentityBindings:1', bindingRef: BINDING_REF, principalRef: PRINCIPAL_REF,
      providerNamespace: 'clerk/api-key', providerIdentifier: callerPrincipal.credentialId,
      providerState: { kind: 'known', value: 'active' }, lifecycle: 'active', credentialGeneration: 3,
      ...overrides.binding,
    }],
    credentials: [{
      _id: 'credentials:1', credentialRef: CREDENTIAL_REF, bindingRef: BINDING_REF,
      principalRef: PRINCIPAL_REF, type: 'api_key', lifecycle: 'active', generation: 3,
      issuedAt: NOW - 10_000, expiresAt: NOW + 60_000, ...overrides.credential,
    }],
    principals: [{
      _id: 'principals:1', principalRef: PRINCIPAL_REF, kind: 'agent', lifecycle: 'active',
      ...overrides.principal,
    }],
    agentAccessPrincipals: [{
      _id: 'agentAccessPrincipals:1', ...canonicalPrincipal, grantGeneration: 4,
      spendingPolicyDigest: AUTHORITY_POLICY_DIGEST, lifecycle: 'active', ...overrides.storedAgent,
    }],
    agentAccessGrants: [{
      _id: 'agentAccessGrants:1', _creationTime: NOW - 1_000,
      format: 'ae.agent-access-grant:v1', grantRef: GRANT_REF, principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF, credentialId: callerPrincipal.credentialId,
      applicationRef: callerPrincipal.applicationRef, environment: 'production',
      operationAccess: 'all_admitted', authorityMode: 'bounded_mandate',
      policy: AUTHORITY_POLICY,
      budgetPolicyRef: AUTHORITY_POLICY.budget.budgetPolicyRef,
      ratePolicyRef: AUTHORITY_POLICY.rate.ratePolicyRef,
      generation: 4, policyDigest: AUTHORITY_POLICY_DIGEST,
      lifecycle: 'active', createdAt: NOW - 1_000, updatedAt: NOW - 1_000,
      expiresAt: NOW + 50_000, ...overrides.accessGrant,
    }],
    authorityDelegationGrants: [
      ...(overrides.parentDelegation === undefined || overrides.parentDelegation === null ? [] : [{
        _id: 'authorityDelegationGrants:parent', grantRef: PARENT_GRANT_REF,
        accountRef: ACCOUNT_REF, actorPrincipalRef: `prn_${'a'.repeat(32)}`,
        subjectPrincipalRef: PRINCIPAL_REF, generation: 2, revision: 2,
        lifecycle: 'active', expiresAt: NOW + 80_000,
        scopes: ['market_supply:manage', 'market_tools:call'],
        resourceRefs: ['operation:other', OPERATION_REF], budgetLimit: 2, budgetUsed: 0,
        createdAt: NOW - 2_000,
        createdBy: {
          actorPrincipalRef: `prn_${'a'.repeat(32)}`, activeAccountRef: ACCOUNT_REF,
          correlationRef: 'correlation:parent', idempotencyRef: 'idempotency:parent',
        },
        ...overrides.parentDelegation,
      }]),
      {
      _id: 'authorityDelegationGrants:1', grantRef: GRANT_REF, subjectPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF, actorPrincipalRef: PRINCIPAL_REF,
      generation: 4, revision: 4, lifecycle: 'active', expiresAt: NOW + 40_000,
        scopes: ['market_tools:call'], resourceRefs: [OPERATION_REF],
      budgetLimit: 1, budgetUsed: 0, createdAt: NOW - 1_000,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF, activeAccountRef: ACCOUNT_REF,
        correlationRef: 'correlation:test', idempotencyRef: 'idempotency:test',
      },
      ...overrides.delegation,
      },
    ],
    accounts: [{
      _id: 'accounts:1', accountRef: ACCOUNT_REF, lifecycle: 'active', revision: 1,
      currentOwnershipRef: OWNERSHIP_REF, ...overrides.account,
    }],
    accountOwnerships: [{
      _id: 'accountOwnerships:1', ownershipRef: OWNERSHIP_REF, accountRef: ACCOUNT_REF,
      ownerPrincipalRef: PRINCIPAL_REF, lifecycle: 'active',
    }],
    memberships: [] as Row[],
    capabilityCalls: [{
      _id: 'capabilityCalls:1', callRef: 'invocation:canonical',
      principalId: PRINCIPAL_REF, ownerId: ACCOUNT_REF, credentialId: callerPrincipal.credentialId,
      applicationRef: callerPrincipal.applicationRef, environment: 'production',
      grantRef: GRANT_REF, grantGeneration: 4, policyDigest: AUTHORITY_POLICY_DIGEST,
      grantExpiresAt: NOW + 50_000, toolRef: OPERATION_REF, ...overrides.invocation,
    }],
  }
}

function liveAgentActionContext(
  rows: ReturnType<typeof authorityRows>,
  committedOperationRef = OPERATION_REF,
) {
  const db = new AuthorityMemoryDb(rows)
  return {
    db,
    runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
      if (path(reference) === 'capabilityQuotes:admitCall') return true
      if (path(reference) === 'capabilityCalls:resolveCallAgentAuthority') {
        return await resolveAgentBoundary({ db }, args)
      }
      throw new Error(`unexpected_mutation:${path(reference)}`)
    }),
    runQuery: vi.fn(async (reference: unknown) => {
      if (path(reference) === 'capabilityQuotes:readForCall') return {
        toolRef: committedOperationRef,
        input: { query: 'btc' },
        decisionPrice: { currency: 'AUD', exponent: 6, units: '0' },
        quoteRef: COMMITMENT_REF,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
      }
      throw new Error(`unexpected_query:${path(reference)}`)
    }),
  }
}

function registrationArgs(overrides: Record<string, unknown> = {}) {
  return {
    principalId: callerPrincipal.principalId,
    credentialId: callerPrincipal.credentialId,
    applicationRef: callerPrincipal.applicationRef,
    environment: callerPrincipal.environment,
    scopes: callerPrincipal.scopes,
    authorityMode: callerPrincipal.authorityMode,
    grantGeneration: 4,
    spendingPolicyDigest: AUTHORITY_POLICY_DIGEST,
    lifecycle: 'active',
    expiresAt: NOW + 50_000,
    seenAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  mocks.actor = {
    kind: 'authenticated_owner',
    clerkUserId: 'clerk|owner',
    canonicalPrincipalRef: `prn_${'1'.repeat(32)}`,
    canonicalAccountRef: `acc_${'2'.repeat(32)}`,
    authorityRevision: {},
    authorityProvenance: {},
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('capability operation canonical authority boundary', () => {
  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered cancel action and its real current-agent sink',
    async (caseKind) => {
      const rows = authorityRows(caseKind === 'stale_generation'
        ? { accessGrant: { generation: 3 } }
        : {})
      const db = new AuthorityMemoryDb(rows)
      const principal = isolationPrincipal(caseKind)
      const ctx = {
        runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
          if (path(reference) === 'capabilityCalls:resolveCallAgentAuthority') {
            return await resolveAgentBoundary({ db }, args)
          }
          throw new Error(`unexpected_mutation:${path(reference)}`)
        }),
      }

      const result = await cancelBoundary(ctx, {
        operationKey: 'surface:http:agent-operation-cancel',
        correlationId: `correlation:operation:cancel:${caseKind}`,
        principal,
        callRef: 'invocation:canonical',
        idempotencyKey: `isolation:${caseKind}`,
      })

      if (caseKind === 'workload') {
        expect(result).toMatchObject({ kind: 'found', state: 'cancelled' })
        expect(mocks.cancel).toHaveBeenCalledTimes(1)
      } else {
        expect(result).toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
        expect(mocks.cancel).not.toHaveBeenCalled()
      }
      expect(ctx.runMutation).toHaveBeenCalledTimes(1)
      expect(db.patches).toHaveLength(0)
      expect(db.insertions).toHaveLength(0)
    },
  )

  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered agent registration mutation and its real canonical-context sink',
    async (caseKind) => {
      const rows = authorityRows(caseKind === 'stale_generation'
        ? { binding: { credentialGeneration: 2 } }
        : {})
      const currentGrant = currentAuthorityGrantFields()
      if (caseKind === 'workload') applyCurrentGrantFields(rows, currentGrant)
      rows.agentAccessPrincipals = []
      if (caseKind === 'wrong_account') {
        rows.accountOwnerships[0]!.accountRef = `acc_${'d'.repeat(32)}`
      }
      const db = new AuthorityMemoryDb(rows)
      const tokenIdentifier = caseKind === 'workload' || caseKind === 'wrong_account' || caseKind === 'stale_generation'
        ? callerPrincipal.credentialId
        : caseKind === 'missing_workload'
          ? null
          : `unknown-${caseKind}-credential`

      const result = await registerAgentBoundary({
        db,
        auth: {
          getUserIdentity: async () => tokenIdentifier === null ? null : { tokenIdentifier },
        },
      }, registrationArgs(caseKind === 'workload'
        ? { spendingPolicyDigest: currentGrant.spendingPolicyDigest }
        : {}))

      if (caseKind === 'workload') {
        expect(result).toEqual({ kind: 'recorded' })
        expect(rows.agentAccessPrincipals).toHaveLength(1)
        expect(db.insertions).toHaveLength(1)
      } else {
        expect(result).not.toEqual({ kind: 'recorded' })
        expect(rows.agentAccessPrincipals).toHaveLength(0)
        expect(db.insertions).toHaveLength(0)
      }
      expect(db.patches).toHaveLength(0)
    },
  )

  it('derives agent provenance from the current credential, Principal, Account, and exact Grant generation', async () => {
    const result = await resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )
    expect(result).toEqual(canonicalPrincipal)
  })

  it('admits v1 all-admitted and v2 selected grants only when Agent policy independently allows the Operation', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toEqual(canonicalPrincipal)

    const selected = selectedAccessGrant([OPERATION_REF])
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows(selected)) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toEqual(canonicalPrincipal)
  })

  it('fails closed when Agent policy and Delegation disagree or the stored grant is invalid', async () => {
    const policyDenies = selectedAccessGrant([OTHER_OPERATION_REF])
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows(policyDenies)) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const policyAllows = selectedAccessGrant([OPERATION_REF])
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows({
        ...policyAllows,
        delegation: { resourceRefs: [OTHER_OPERATION_REF] },
      })) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows({ accessGrant: { operationRefs: [] } })) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('lists the Agent own receipts through live v1 or selected authority without treating listing as an Operation', async () => {
    const legacyContext = liveAgentActionContext(authorityRows({
      delegation: { resourceRefs: ['*'] },
    }))
    await expect(listBoundary(legacyContext, agentListArgs())).resolves.toMatchObject({
      isDone: true,
      principal: canonicalPrincipal,
    })
    expect(legacyContext.runMutation).toHaveBeenCalledWith(expect.anything(), {
      principal: callerPrincipal,
      receiptList: true,
    })

    const selectedContext = liveAgentActionContext(authorityRows(selectedAccessGrant([OPERATION_REF])))
    await expect(listBoundary(selectedContext, agentListArgs())).resolves.toMatchObject({
      isDone: true,
      principal: canonicalPrincipal,
    })
    expect(mocks.list).toHaveBeenCalledTimes(2)
    for (const call of mocks.list.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ principal: canonicalPrincipal }))
    }

    const unselectedContext = liveAgentActionContext(authorityRows({
      ...selectedAccessGrant([OPERATION_REF]),
      delegation: { resourceRefs: [OPERATION_REF, OTHER_OPERATION_REF] },
    }), OTHER_OPERATION_REF)
    await expect(callBoundary(unselectedContext, agentArgs()))
      .resolves.toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    expect(mocks.call).not.toHaveBeenCalled()
  })

  it('accepts a generation-bound, monotonically narrowed multi-hop delegation chain', async () => {
    const rows = authorityRows({
      parentDelegation: {},
      delegation: {
        parentGrantRef: PARENT_GRANT_REF,
        parentGeneration: 2,
        expiresAt: NOW + 40_000,
      },
    })
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(rows) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toEqual(canonicalPrincipal)
  })

  it.each([
    ['revoked parent', {
      parentDelegation: {
        lifecycle: 'revoked', generation: 3, revision: 3, revokedAt: NOW - 1,
        revokedBy: {
          actorPrincipalRef: PRINCIPAL_REF, activeAccountRef: ACCOUNT_REF,
          correlationRef: 'correlation:revoke', idempotencyRef: 'idempotency:revoke',
        },
      },
      delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 3 },
    }],
    ['expired parent', {
      parentDelegation: { expiresAt: NOW },
      delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 2 },
    }],
    ['cyclic ancestry', {
      delegation: { parentGrantRef: GRANT_REF, parentGeneration: 4 },
    }],
    ['stale parent generation', {
      parentDelegation: {},
      delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 1 },
    }],
    ['cross-account parent', {
      parentDelegation: { accountRef: `acc_${'b'.repeat(32)}` },
      delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 2 },
    }],
    ['scope widening', {
      parentDelegation: { scopes: ['market_supply:manage'] },
      delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 2 },
    }],
    ['resource widening', {
      parentDelegation: { resourceRefs: ['operation:other'] },
      delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 2 },
    }],
  ])('denies %s before public operation admission', async (_case, overrides) => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows(overrides)) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it.each([
    ['credential expiry', { credential: { expiresAt: NOW } }],
    ['binding revocation', { binding: { lifecycle: 'revoked' } }],
    ['principal revocation', { principal: { lifecycle: 'revoked' } }],
    ['stale access generation', { accessGrant: { generation: 3 } }],
    ['cross-account grant', { delegation: { accountRef: `acc_${'9'.repeat(32)}` } }],
    ['inactive account', { account: { lifecycle: 'inactive' } }],
    ['expired durable agent principal', { storedAgent: { expiresAt: NOW } }],
    ['expired agent access grant', { accessGrant: { expiresAt: NOW } }],
  ])('denies %s at current server time', async (_case, overrides) => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows(overrides)) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies a caller that omits the required operation scope', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, scopes: [] }, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies duplicate requested scope expectations and ambiguous durable agent projections', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, scopes: [...callerPrincipal.scopes, ...callerPrincipal.scopes] }, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const ambiguous = authorityRows()
    ambiguous.agentAccessPrincipals.push({
      ...ambiguous.agentAccessPrincipals[0]!, _id: 'agentAccessPrincipals:2',
    })
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(ambiguous) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it.each([
    ['Principal', { principalId: `prn_${'c'.repeat(32)}` }],
    ['Account', { ownerId: `acc_${'d'.repeat(32)}` }],
    ['Credential', { credentialId: 'forged-api-key' }],
    ['application', { applicationRef: 'forged-application' }],
  ])('treats caller %s only as an expectation and denies a forged value', async (_case, forged) => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, ...forged }, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies ambiguous or missing active Account access for the resolved agent Principal', async () => {
    const ambiguous = authorityRows()
    ambiguous.memberships = [{
      _id: 'memberships:1', membershipRef: 'membership:1', accountRef: ACCOUNT_REF,
      memberPrincipalRef: PRINCIPAL_REF, lifecycle: 'active', revision: 1,
    }]
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(ambiguous) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const missing = authorityRows()
    missing.accountOwnerships = []
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missing) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies missing or stale canonical identity and Account ownership facts', async () => {
    const missingPrincipal = authorityRows()
    missingPrincipal.principals = []
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missingPrincipal) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const missingAccount = authorityRows()
    missingAccount.accounts = []
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missingAccount) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const missingCurrentOwnership = authorityRows()
    missingCurrentOwnership.accounts[0]!.currentOwnershipRef = 'ownership:missing'
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missingCurrentOwnership) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const staleAgentOwnership = authorityRows()
    const currentOwnerRef = `prn_${'e'.repeat(32)}`
    staleAgentOwnership.principals.push({
      _id: 'principals:owner', principalRef: currentOwnerRef, kind: 'human', lifecycle: 'active',
    })
    staleAgentOwnership.accountOwnerships.push({
      _id: 'accountOwnerships:current', ownershipRef: 'ownership:current', accountRef: ACCOUNT_REF,
      ownerPrincipalRef: currentOwnerRef, lifecycle: 'active',
    })
    staleAgentOwnership.accounts[0]!.currentOwnershipRef = 'ownership:current'
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(staleAgentOwnership) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()

    const inactiveCurrentOwner = authorityRows()
    inactiveCurrentOwner.accountOwnerships = [{
      _id: 'accountOwnerships:current', ownershipRef: OWNERSHIP_REF, accountRef: ACCOUNT_REF,
      ownerPrincipalRef: currentOwnerRef, lifecycle: 'active',
    }]
    inactiveCurrentOwner.memberships = [{
      _id: 'memberships:1', membershipRef: 'membership:1', accountRef: ACCOUNT_REF,
      memberPrincipalRef: PRINCIPAL_REF, lifecycle: 'active', revision: 1,
    }]
    inactiveCurrentOwner.principals.push({
      _id: 'principals:owner', principalRef: currentOwnerRef, kind: 'human', lifecycle: 'retired',
    })
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(inactiveCurrentOwner) },
      { principal: callerPrincipal, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies malformed server-time inputs before resolving identity or delegation', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, credentialId: '' }, toolRef: OPERATION_REF },
    )).resolves.toBeNull()
    await expect(validateCanonicalAgentDelegation(
      { db: new AuthorityMemoryDb(authorityRows()) } as never,
      {
        evidenceKind: 'test', evidenceRef: 'test', principalRef: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF, grantRef: GRANT_REF, grantGeneration: 4,
        requiredScopes: ['market_tools:call'], resourceRefs: [OPERATION_REF], now: -1,
      },
    )).resolves.toBeNull()
  })

  it('binds recovery to the durable Agent and current delegation while retaining prior Call authority evidence', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: callerPrincipal, callRef: 'invocation:canonical' },
    )).resolves.toEqual(canonicalPrincipal)

    const changedPolicy = selectedAccessGrant([OTHER_OPERATION_REF])
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows({
        ...changedPolicy,
        invocation: { policyDigest: changedPolicy.accessGrant.policyDigest },
      })) },
      { principal: callerPrincipal, callRef: 'invocation:canonical' },
    )).resolves.toEqual(canonicalPrincipal)

    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows({
        invocation: { grantGeneration: 3 },
      })) },
      { principal: callerPrincipal, callRef: 'invocation:canonical' },
    )).resolves.toEqual(canonicalPrincipal)

    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows({
        parentDelegation: {
          lifecycle: 'revoked', generation: 3, revision: 3, revokedAt: NOW - 1,
          revokedBy: {
            actorPrincipalRef: PRINCIPAL_REF, activeAccountRef: ACCOUNT_REF,
            correlationRef: 'correlation:revoke', idempotencyRef: 'idempotency:revoke',
          },
        },
        delegation: { parentGrantRef: PARENT_GRANT_REF, parentGeneration: 3 },
      })) },
      { principal: callerPrincipal, callRef: 'invocation:canonical' },
    )).resolves.toBeNull()
  })

  it('rejects an absent or ambiguous public operation authority target', async () => {
    const ctx = { db: new AuthorityMemoryDb(authorityRows()) }
    await expect(resolveAgentBoundary(ctx, { principal: callerPrincipal })).resolves.toBeNull()
    await expect(resolveAgentBoundary(ctx, {
      principal: callerPrincipal,
      toolRef: OPERATION_REF,
      callRef: 'invocation:canonical',
    })).resolves.toBeNull()
    await expect(resolveAgentBoundary(ctx, {
      principal: callerPrincipal,
      callRef: 'invocation:missing',
    })).resolves.toBeNull()
  })

  it('registers only current server-resolved agent provenance and canonical grant facts', async () => {
    const rows = authorityRows({
      accessGrant: {
        format: 'ae.agent-access-grant:v2',
        authorityMode: 'spending_policy',
        toolAccess: 'all_admitted',
        toolRefs: [],
        spendingPolicy: registrationSpendingPolicy,
        spendingPolicyDigest: agentAccessPolicyDigest(registrationSpendingPolicy),
      },
    })
    applyCurrentGrantFields(rows, {
      format: 'ae.agent-access-grant:v2',
      authorityMode: 'spending_policy',
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: registrationSpendingPolicy,
      spendingPolicyDigest: agentAccessPolicyDigest(registrationSpendingPolicy),
    })
    rows.agentAccessPrincipals = []
    const db = new AuthorityMemoryDb(rows)
    await expect(registerAgentBoundary({
      db,
      auth: { getUserIdentity: async () => ({ tokenIdentifier: callerPrincipal.credentialId }) },
    }, registrationArgs({
      seenAt: 1,
      spendingPolicyDigest: agentAccessPolicyDigest(registrationSpendingPolicy),
    }))).resolves.toEqual({ kind: 'recorded' })
    expect(rows.agentAccessPrincipals).toEqual([
      expect.objectContaining({
        principalId: PRINCIPAL_REF,
        ownerId: ACCOUNT_REF,
        ownerTokenIdentifier: callerPrincipal.credentialId,
        credentialId: callerPrincipal.credentialId,
        grantGeneration: 4,
        spendingPolicyDigest: agentAccessPolicyDigest(registrationSpendingPolicy),
        scopes: ['market_tools:call'],
        recordedAt: NOW,
        lastSeenAt: NOW,
      }),
    ])
  })

  it('fails closed before registration when the authenticated API-key identity has no canonical binding', async () => {
    const rows = authorityRows()
    rows.agentAccessPrincipals = []
    await expect(registerAgentBoundary({
      db: new AuthorityMemoryDb(rows),
      auth: { getUserIdentity: async () => ({ tokenIdentifier: 'unknown-api-key' }) },
    }, registrationArgs())).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
    expect(rows.agentAccessPrincipals).toEqual([])
  })

  it('fails closed before registration when no authenticated identity exists', async () => {
    const rows = authorityRows()
    rows.agentAccessPrincipals = []
    await expect(registerAgentBoundary({
      db: new AuthorityMemoryDb(rows),
      auth: { getUserIdentity: async () => null },
    }, registrationArgs())).resolves.toEqual({ kind: 'refused', code: 'authentication_required' })
    expect(rows.agentAccessPrincipals).toEqual([])
  })

  it.each([
    ['forged Principal', { principalId: `prn_${'c'.repeat(32)}` }],
    ['forged Credential', { credentialId: 'forged-api-key' }],
    ['forged generation', { grantGeneration: 99 }],
    ['forged digest', { spendingPolicyDigest: 'sha256:forged' }],
  ])('refuses public registration with %s and performs no write', async (_case, forged) => {
    const rows = authorityRows()
    rows.agentAccessPrincipals = []
    await expect(registerAgentBoundary({
      db: new AuthorityMemoryDb(rows),
      auth: { getUserIdentity: async () => ({ tokenIdentifier: callerPrincipal.credentialId }) },
    }, registrationArgs(forged))).resolves.not.toEqual({ kind: 'recorded' })
    expect(rows.agentAccessPrincipals).toEqual([])
  })

  it.each([
    ['no active access grant', (rows: ReturnType<typeof authorityRows>) => { rows.agentAccessGrants = [] }],
    ['ambiguous active access grant', (rows: ReturnType<typeof authorityRows>) => {
      rows.agentAccessGrants.push({ ...rows.agentAccessGrants[0]!, _id: 'agentAccessGrants:2', environment: 'sandbox' })
    }],
    ['missing delegation', (rows: ReturnType<typeof authorityRows>) => { rows.authorityDelegationGrants = [] }],
    ['revoked parent delegation', (rows: ReturnType<typeof authorityRows>) => {
      rows.authorityDelegationGrants.unshift({
        ...rows.authorityDelegationGrants[0]!, _id: 'authorityDelegationGrants:parent',
        grantRef: PARENT_GRANT_REF, generation: 3, revision: 3, lifecycle: 'revoked',
        revokedAt: NOW - 1,
        revokedBy: {
          actorPrincipalRef: PRINCIPAL_REF, activeAccountRef: ACCOUNT_REF,
          correlationRef: 'correlation:revoke', idempotencyRef: 'idempotency:revoke',
        },
      } as never)
      Object.assign(rows.authorityDelegationGrants[1]!, {
        parentGrantRef: PARENT_GRANT_REF, parentGeneration: 3,
      })
    }],
    ['cross-account access grant', (rows: ReturnType<typeof authorityRows>) => {
      rows.agentAccessGrants[0]!.ownerId = `acc_${'d'.repeat(32)}`
    }],
    ['cross-principal access grant', (rows: ReturnType<typeof authorityRows>) => {
      rows.agentAccessGrants[0]!.principalId = `prn_${'c'.repeat(32)}`
    }],
    ['cross-credential access grant', (rows: ReturnType<typeof authorityRows>) => {
      rows.agentAccessGrants[0]!.credentialId = 'forged-api-key'
    }],
    ['grant beyond credential expiry', (rows: ReturnType<typeof authorityRows>) => {
      rows.agentAccessGrants[0]!.expiresAt = NOW + 70_000
    }],
  ])('refuses registration for %s without persisting a projection', async (_case, mutate) => {
    const rows = authorityRows()
    rows.agentAccessPrincipals = []
    mutate(rows)
    await expect(registerAgentBoundary({
      db: new AuthorityMemoryDb(rows),
      auth: { getUserIdentity: async () => ({ tokenIdentifier: callerPrincipal.credentialId }) },
    }, registrationArgs())).resolves.not.toEqual({ kind: 'recorded' })
    expect(rows.agentAccessPrincipals).toEqual([])
  })

  it('reconciles a worker only from its persisted invocation-bound canonical authority', async () => {
    await expect(reconcileWorkloadBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { callRef: 'invocation:canonical' },
    )).resolves.toEqual({
      kind: 'authorized',
      authority: {
        principalId: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF,
        credentialId: callerPrincipal.credentialId,
        grantRef: GRANT_REF,
        grantGeneration: 4,
        policyDigest: AUTHORITY_POLICY_DIGEST,
        expiresAt: NOW + 50_000,
      },
    })
  })

  it('validates new and persisted Calls when access and canonical delegation generations differ', async () => {
    const ctx = { db: new AuthorityMemoryDb(authorityRows({ delegation: { generation: 1 } })) }
    await expect(resolveAgentBoundary(ctx, { principal: callerPrincipal, toolRef: OPERATION_REF }))
      .resolves.toEqual(canonicalPrincipal)
    await expect(reconcileWorkloadBoundary(ctx, { callRef: 'invocation:canonical' }))
      .resolves.toMatchObject({ kind: 'authorized', authority: { grantGeneration: 4 } })
  })

  it.each([
    ['forged Principal', { invocation: { principalId: 'caller-principal' } }],
    ['cross-account row', { invocation: { ownerId: `acc_${'9'.repeat(32)}` } }],
    ['stale Grant generation', { invocation: { grantGeneration: 3 } }],
    ['stale authority expiry', { invocation: { grantExpiresAt: NOW + 40_000 } }],
    ['revoked credential', { credential: { lifecycle: 'revoked' } }],
    ['revoked delegation resource', { delegation: { resourceRefs: ['operation:other'] } }],
  ])('refuses worker authority for %s before a consequence', async (_case, overrides) => {
    await expect(reconcileWorkloadBoundary(
      { db: new AuthorityMemoryDb(authorityRows(overrides)) },
      { callRef: 'invocation:canonical' },
    )).resolves.toEqual({ kind: 'refused' })
  })

  it.each([
    ['missing invocation', 'capabilityCalls'],
    ['missing persisted agent', 'agentAccessPrincipals'],
  ])('refuses worker authority for %s', async (_case, missingTable) => {
    const rows = authorityRows()
    ;(rows as Record<string, Row[]>)[missingTable] = []
    await expect(reconcileWorkloadBoundary(
      { db: new AuthorityMemoryDb(rows) },
      { callRef: 'invocation:canonical' },
    )).resolves.toEqual({ kind: 'refused' })
  })

  it('requires canonical agent expectations and exact authority targets on every public agent action', async () => {
    const ctx = agentContext()
    await expect(callBoundary(ctx, agentArgs())).resolves.toEqual(canonicalPrincipal)
    await expect(statusBoundary(ctx, { ...agentArgs(), callRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'found' })
    await expect(cancelBoundary(ctx, { ...agentArgs(), callRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'found' })
    await expect(reconcileBoundary(ctx, { ...agentArgs(), callRef: 'invocation:1', evidence: {
      attemptRef: 'attempt:1', effectGeneration: 1, requiredAt: new Date(0).toISOString(),
      retry: 'reconcile_before_retry', evidenceSource: 'test',
    } })).resolves.toMatchObject({ kind: 'found' })

    expect(mocks.call).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ principal: canonicalPrincipal }),
      true,
    )
    for (const call of [mocks.readStatus, mocks.cancel, mocks.reconcile]) {
      expect(call).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ principal: canonicalPrincipal }))
    }
    expect(ctx.runMutation).toHaveBeenCalledTimes(5)
    expect(ctx.runMutation).toHaveBeenNthCalledWith(1, expect.anything(), {
      ...agentArgs(),
    })
    expect(ctx.runMutation).toHaveBeenNthCalledWith(2, expect.anything(), {
      principal: canonicalPrincipal,
      toolRef: OPERATION_REF,
    })
    for (const call of ctx.runMutation.mock.calls.slice(2)) {
      expect(call[1]).toEqual({ principal: canonicalPrincipal, callRef: 'invocation:1' })
    }
  })

  it('fails closed before any operation handler when the canonical agent binding is absent', async () => {
    const ctx = agentContext(null)
    await expect(callBoundary(ctx, agentArgs())).resolves.toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    await expect(statusBoundary(ctx, { ...agentArgs(), callRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(cancelBoundary(ctx, { ...agentArgs(), callRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(reconcileBoundary(ctx, { ...agentArgs(), callRef: 'invocation:1', evidence: {} })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    expect(mocks.call).not.toHaveBeenCalled()
    expect(mocks.readStatus).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })

  it('projects canonical BusinessActor identity into owner and approval handlers and denies anonymous actors', async () => {
    const ctx = { auth: { marker: 'preserved-auth-property', getUserIdentity: async () => ({ subject: 'user_1', tokenIdentifier: 'clerk|owner' }) } }
    const expectedIdentity = expect.objectContaining({
      subject: `prn_${'1'.repeat(32)}`,
      tokenIdentifier: `acc_${'2'.repeat(32)}`,
    })

    await expect(ownerStatusBoundary(ctx, { callRef: 'invocation:1' })).resolves.toMatchObject({
      identity: expectedIdentity,
      marker: 'preserved-auth-property',
    })
    await expect(ownerCancelBoundary(ctx, { callRef: 'invocation:1', idempotencyKey: 'cancel:1' })).resolves.toMatchObject({ identity: expectedIdentity })
    await expect(ownerReconcileBoundary(ctx, { callRef: 'invocation:1', idempotencyKey: 'reconcile:1', evidence: {} })).resolves.toMatchObject({ identity: expectedIdentity })
    await expect(listApprovalBoundary(ctx, {})).resolves.toEqual([expectedIdentity])
    await expect(decideApprovalBoundary(ctx, { callRef: 'invocation:1', decision: 'deny' })).resolves.toMatchObject({ identity: expectedIdentity })

    mocks.actor = { kind: 'anonymous', anonymousBucket: 'convex:anonymous' }
    await expect(ownerStatusBoundary(ctx, { callRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(listApprovalBoundary(ctx, {})).resolves.toEqual([])
    await expect(decideApprovalBoundary(ctx, { callRef: 'invocation:1', decision: 'deny' })).resolves.toEqual({
      kind: 'refused', code: 'authentication_required',
    })
  })

  it('fails closed if an authenticated BusinessActor cannot be paired with an auth identity', async () => {
    const ctx = { auth: { getUserIdentity: async () => null } }
    await expect(ownerStatusBoundary(ctx, { callRef: 'invocation:1' })).rejects.toThrow(
      'canonical_owner_identity_missing',
    )
    expect(mocks.readOwner).not.toHaveBeenCalled()
  })
})

function isolationPrincipal(caseKind: IsolationCaseKind): typeof callerPrincipal {
  switch (caseKind) {
    case 'workload':
      return callerPrincipal
    case 'owner':
      return { ...callerPrincipal, principalId: `prn_${'a'.repeat(32)}` }
    case 'member':
      return { ...callerPrincipal, principalId: `prn_${'b'.repeat(32)}` }
    case 'missing_workload':
      return { ...callerPrincipal, scopes: [] }
    case 'stranger':
      return { ...callerPrincipal, credentialId: 'unknown-stranger-credential' }
    case 'wrong_account':
      return { ...callerPrincipal, ownerId: `acc_${'d'.repeat(32)}` }
    case 'stale_generation':
      return callerPrincipal
  }
}

const grantServerToken = 'agent-access-grant-server-token-at-least-32-bytes'
const grantForeignAccountRef = `acc_${'e'.repeat(32)}`
const registrationSpendingPolicy = {
  format: 'ae.agent-access-policy:v2' as const,
  toolAccess: 'all_admitted' as const,
  toolRefs: [] as string[],
  environment: callerPrincipal.environment,
  budget: {
    budgetPolicyRef: AUTHORITY_POLICY.budget.budgetPolicyRef,
    generation: 4,
    currency: AUTHORITY_POLICY.budget.currency,
    exponent: AUTHORITY_POLICY.budget.exponent,
    maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 },
    maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
    maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
    maximumConcurrentCalls: AUTHORITY_POLICY.budget.maximumConcurrentInvocations,
  },
  rate: AUTHORITY_POLICY.rate,
}
const grantRegistrationMaterial = {
  format: 'ae.agent-access-grant:v2' as const,
  grantRef: GRANT_REF,
  principalId: PRINCIPAL_REF,
  ownerId: ACCOUNT_REF,
  credentialId: callerPrincipal.credentialId,
  applicationRef: callerPrincipal.applicationRef,
  environment: callerPrincipal.environment,
  authorityMode: callerPrincipal.authorityMode,
  toolAccess: 'all_admitted' as const,
  toolRefs: [] as string[],
  spendingPolicy: registrationSpendingPolicy,
  budgetPolicyRef: AUTHORITY_POLICY.budget.budgetPolicyRef,
  ratePolicyRef: AUTHORITY_POLICY.rate.ratePolicyRef,
  lifecycle: 'active' as const,
  generation: 4,
  spendingPolicyDigest: agentAccessPolicyDigest(registrationSpendingPolicy),
  createdAt: NOW - 1_000,
  updatedAt: NOW - 1_000,
  expiresAt: NOW + 50_000,
}

async function signedGrantServiceAssertion(
  grant: typeof grantRegistrationMaterial,
  issuedAt: number,
  overrides: Readonly<{ ownerId?: string; scopes?: readonly string[] }> = {},
) {
  const signed = { ...grant, ownerId: overrides.ownerId ?? grant.ownerId }
  return await createCustomerRequestServiceAssertion({
    key: grantServerToken,
    operation: 'agentAccessPolicy.registerGrantForServer',
    command: { grant: signed },
    principal: {
      principalId: grant.principalId,
      ownerId: signed.ownerId,
      credentialId: grant.credentialId,
      scopes: overrides.scopes ?? [MARKET_TOOLS_CALL_SCOPE],
    },
    issuedAt,
  })
}

describe('agent grant registration server authority', () => {
  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered grant registration handler',
    async (caseKind) => {
      vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', grantServerToken)
      try {
        const now = Date.now()
        const grant = { ...grantRegistrationMaterial, expiresAt: now + 50_000 }
        const storedAgent = {
          _id: 'agentAccessPrincipals:1',
          principalId: grant.principalId,
          ownerId: grant.ownerId,
          credentialId: grant.credentialId,
          applicationRef: grant.applicationRef,
          environment: grant.environment,
          scopes: [MARKET_TOOLS_CALL_SCOPE],
          authorityMode: grant.authorityMode,
          grantGeneration: grant.generation,
          spendingPolicyDigest: grant.spendingPolicyDigest,
          lifecycle: 'active',
          expiresAt: now + 60_000,
        }
        const db = new AuthorityMemoryDb(caseKind === 'missing_workload'
          ? { agentAccessPrincipals: [] }
          : { agentAccessPrincipals: [storedAgent] })
        const runMutation = vi.fn(async (_reference: unknown, args: Record<string, unknown>) => {
          return { kind: 'recorded' as const, forwarded: args }
        })

        let args: Record<string, unknown>
        if (caseKind === 'owner') {
          args = { grant }
        } else if (caseKind === 'member') {
          args = { grant, serviceAuth: await signedGrantServiceAssertion(grant, now, { scopes: ['market_supply:manage'] }) }
        } else if (caseKind === 'wrong_account') {
          args = { grant, serviceAuth: await signedGrantServiceAssertion(grant, now, { ownerId: grantForeignAccountRef }) }
        } else {
          const issuedAt = caseKind === 'stale_generation' ? now - 10 * 60_000 : now
          args = { grant, serviceAuth: await signedGrantServiceAssertion(grant, issuedAt) }
        }
        if (caseKind === 'stranger') {
          const assertion = args.serviceAuth as { signature: string }
          args = { ...args, serviceAuth: { ...assertion, signature: `${assertion.signature}forged` } }
        }

        if (caseKind === 'owner') {
          await expect(registerGrantBoundary({ db, runMutation }, args)).rejects.toThrow()
        } else if (caseKind === 'workload') {
          await expect(registerGrantBoundary({ db, runMutation }, args)).resolves.toEqual({
            kind: 'recorded',
            forwarded: { grant: { ...grant, ownerId: storedAgent.ownerId } },
          })
          expect(runMutation).toHaveBeenCalledTimes(1)
        } else {
          await expect(registerGrantBoundary({ db, runMutation }, args)).resolves.toEqual({
            kind: 'refused',
            code: 'authentication_required',
          })
          expect(runMutation).not.toHaveBeenCalled()
        }
        expect(db.insertions).toHaveLength(0)
        expect(db.patches).toHaveLength(0)
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )
})

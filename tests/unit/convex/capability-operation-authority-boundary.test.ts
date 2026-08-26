import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: {
    kind: 'authenticated_owner' as const,
    clerkUserId: 'clerk|owner',
    canonicalPrincipalRef: `prn_${'1'.repeat(32)}`,
    canonicalAccountRef: `acc_${'2'.repeat(32)}`,
    legacyOwnerId: 'owners:1',
    authorityRevision: {},
    authorityProvenance: {},
  } as Record<string, unknown>,
  invoke: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => args.principal),
  readStatus: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found', invocationRef: args.invocationRef, operationRef: 'operation:test', state: 'pending',
  })),
  cancel: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found', invocationRef: args.invocationRef, operationRef: 'operation:test', state: 'cancelled',
  })),
  reconcile: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found', invocationRef: args.invocationRef, operationRef: 'operation:test', state: 'terminal',
  })),
  readOwner: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null>; marker?: string } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    marker: ctx.auth.marker,
    invocationRef: args.invocationRef,
  })),
  cancelOwner: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    invocationRef: args.invocationRef,
  })),
  reconcileOwner: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    invocationRef: args.invocationRef,
  })),
  listApprovals: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }) => [
    await ctx.auth.getUserIdentity(),
  ]),
  decideApproval: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }, args: Record<string, unknown>) => ({
    identity: await ctx.auth.getUserIdentity(),
    invocationRef: args.invocationRef,
  })),
}))

vi.mock('../../../convex/authz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/authz')>()),
  resolveBusinessActor: vi.fn(async () => mocks.actor),
}))

vi.mock('../../../convex/capabilityOperationInvokeActions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/capabilityOperationInvokeActions')>()),
  invokeHandler: mocks.invoke,
  readInvocationStatusHandler: mocks.readStatus,
  cancelInvocationHandler: mocks.cancel,
  reconcileInvocationHandler: mocks.reconcile,
  readOwnerInvocationStatusHandler: mocks.readOwner,
  cancelOwnerInvocationHandler: mocks.cancelOwner,
  reconcileOwnerInvocationHandler: mocks.reconcileOwner,
}))

vi.mock('../../../convex/capabilityOperationAdmission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/capabilityOperationAdmission')>()),
  listPendingOperationApprovalsHandler: mocks.listApprovals,
  decideOperationApprovalHandler: mocks.decideApproval,
}))

import {
  cancelInvocation,
  cancelOwnerInvocation,
  decideOperationApproval,
  invoke,
  listPendingOperationApprovals,
  readInvocationStatus,
  readOwnerInvocationStatus,
  reconcileInvocation,
  reconcileOwnerInvocation,
  reconcileInvocationWorkloadAuthority,
  resolveInvocationAgentAuthority,
} from '../../../convex/capabilityOperationInvocations'
import { registerAgentPrincipal } from '../../../convex/agentAccessPrincipals'
import { validateCanonicalAgentDelegation } from '../../../convex/lib/canonicalAgentAuthority'

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
const invokeBoundary = (invoke as unknown as { _handler: Handler })._handler
const statusBoundary = (readInvocationStatus as unknown as { _handler: Handler })._handler
const cancelBoundary = (cancelInvocation as unknown as { _handler: Handler })._handler
const reconcileBoundary = (reconcileInvocation as unknown as { _handler: Handler })._handler
const ownerStatusBoundary = (readOwnerInvocationStatus as unknown as { _handler: Handler })._handler
const ownerCancelBoundary = (cancelOwnerInvocation as unknown as { _handler: Handler })._handler
const ownerReconcileBoundary = (reconcileOwnerInvocation as unknown as { _handler: Handler })._handler
const listApprovalBoundary = (listPendingOperationApprovals as unknown as { _handler: Handler })._handler
const decideApprovalBoundary = (decideOperationApproval as unknown as { _handler: Handler })._handler
const resolveAgentBoundary = (resolveInvocationAgentAuthority as unknown as { _handler: Handler })._handler
const reconcileWorkloadBoundary = (reconcileInvocationWorkloadAuthority as unknown as { _handler: Handler })._handler
const registerAgentBoundary = (registerAgentPrincipal as unknown as { _handler: Handler })._handler

const callerPrincipal = {
  principalId: `prn_${'3'.repeat(32)}`,
  ownerId: `acc_${'4'.repeat(32)}`,
  credentialId: 'ak_live_locator',
  applicationRef: 'agentic-economy',
  environment: 'production' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'bounded_mandate' as const,
}
const canonicalPrincipal = {
  ...callerPrincipal,
}

function path(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

function agentContext(result: typeof canonicalPrincipal | null = canonicalPrincipal) {
  return {
    runMutation: vi.fn(async (reference: unknown, _args: Record<string, unknown>) => {
      if (path(reference) === 'capabilityOperationInvocations:resolveInvocationAgentAuthority') return result
      throw new Error(`unexpected_mutation:${path(reference)}`)
    }),
  }
}

function agentArgs() {
  return {
    operationKey: 'surface:http:agent-operation-invoke',
    correlationId: 'correlation:operation:1',
    principal: callerPrincipal,
    operationRef: 'operation:test',
    input: { query: 'btc' },
    idempotencyKey: 'idempotency:operation:1',
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
const OPERATION_REF = 'operation:test'
const PARENT_GRANT_REF = `grt_${'9'.repeat(32)}`

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
      policyDigest: 'sha256:policy', lifecycle: 'active', ...overrides.storedAgent,
    }],
    agentAccessGrants: [{
      _id: 'agentAccessGrants:1', grantRef: GRANT_REF, principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF, credentialId: callerPrincipal.credentialId,
      applicationRef: callerPrincipal.applicationRef, environment: 'production',
      authorityMode: 'bounded_mandate', generation: 4, policyDigest: 'sha256:policy',
      lifecycle: 'active', expiresAt: NOW + 50_000, ...overrides.accessGrant,
    }],
    authorityDelegationGrants: [
      ...(overrides.parentDelegation === undefined || overrides.parentDelegation === null ? [] : [{
        _id: 'authorityDelegationGrants:parent', grantRef: PARENT_GRANT_REF,
        accountRef: ACCOUNT_REF, actorPrincipalRef: `prn_${'a'.repeat(32)}`,
        subjectPrincipalRef: PRINCIPAL_REF, generation: 2, revision: 2,
        lifecycle: 'active', expiresAt: NOW + 80_000,
        scopes: ['market_operations:invoke', 'market_supply:manage'],
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
      scopes: ['market_operations:invoke'], resourceRefs: [OPERATION_REF],
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
    capabilityOperationInvocations: [{
      _id: 'capabilityOperationInvocations:1', invocationRef: 'invocation:canonical',
      principalId: PRINCIPAL_REF, ownerId: ACCOUNT_REF, credentialId: callerPrincipal.credentialId,
      applicationRef: callerPrincipal.applicationRef, environment: 'production',
      grantRef: GRANT_REF, grantGeneration: 4, policyDigest: 'sha256:policy',
      grantExpiresAt: NOW + 50_000, operationRef: OPERATION_REF, ...overrides.invocation,
    }],
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
    policyDigest: 'sha256:policy',
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
    legacyOwnerId: 'owners:1',
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
          if (path(reference) === 'capabilityOperationInvocations:resolveInvocationAgentAuthority') {
            return await resolveAgentBoundary({ db }, args)
          }
          throw new Error(`unexpected_mutation:${path(reference)}`)
        }),
      }

      const result = await cancelBoundary(ctx, {
        operationKey: 'surface:http:agent-operation-cancel',
        correlationId: `correlation:operation:cancel:${caseKind}`,
        principal,
        invocationRef: 'invocation:canonical',
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
      }, registrationArgs())

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
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )
    expect(result).toEqual(canonicalPrincipal)
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
      { principal: callerPrincipal, operationRef: OPERATION_REF },
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
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it.each([
    ['credential expiry', { credential: { expiresAt: NOW } }],
    ['binding revocation', { binding: { lifecycle: 'revoked' } }],
    ['principal revocation', { principal: { lifecycle: 'revoked' } }],
    ['stale generation', { delegation: { generation: 3 } }],
    ['cross-account grant', { delegation: { accountRef: `acc_${'9'.repeat(32)}` } }],
    ['inactive account', { account: { lifecycle: 'inactive' } }],
    ['expired durable agent principal', { storedAgent: { expiresAt: NOW } }],
    ['expired agent access grant', { accessGrant: { expiresAt: NOW } }],
  ])('denies %s at current server time', async (_case, overrides) => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows(overrides)) },
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies a caller that omits the required operation scope', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, scopes: [] }, operationRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies duplicate requested scope expectations and ambiguous durable agent projections', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, scopes: [...callerPrincipal.scopes, ...callerPrincipal.scopes] }, operationRef: OPERATION_REF },
    )).resolves.toBeNull()

    const ambiguous = authorityRows()
    ambiguous.agentAccessPrincipals.push({
      ...ambiguous.agentAccessPrincipals[0]!, _id: 'agentAccessPrincipals:2',
    })
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(ambiguous) },
      { principal: callerPrincipal, operationRef: OPERATION_REF },
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
      { principal: { ...callerPrincipal, ...forged }, operationRef: OPERATION_REF },
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
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()

    const missing = authorityRows()
    missing.accountOwnerships = []
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missing) },
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies missing or stale canonical identity and Account ownership facts', async () => {
    const missingPrincipal = authorityRows()
    missingPrincipal.principals = []
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missingPrincipal) },
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()

    const missingAccount = authorityRows()
    missingAccount.accounts = []
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missingAccount) },
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()

    const missingCurrentOwnership = authorityRows()
    missingCurrentOwnership.accounts[0]!.currentOwnershipRef = 'ownership:missing'
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(missingCurrentOwnership) },
      { principal: callerPrincipal, operationRef: OPERATION_REF },
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
      { principal: callerPrincipal, operationRef: OPERATION_REF },
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
      { principal: callerPrincipal, operationRef: OPERATION_REF },
    )).resolves.toBeNull()
  })

  it('denies malformed server-time inputs before resolving identity or delegation', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, credentialId: '' }, operationRef: OPERATION_REF },
    )).resolves.toBeNull()
    await expect(validateCanonicalAgentDelegation(
      { db: new AuthorityMemoryDb(authorityRows()) } as never,
      {
        evidenceKind: 'test', evidenceRef: 'test', principalRef: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF, grantRef: GRANT_REF, grantGeneration: 4,
        requiredScopes: ['market_operations:invoke'], resourceRefs: [OPERATION_REF], now: -1,
      },
    )).resolves.toBeNull()
  })

  it('binds status, cancel, and reconcile admission to the persisted invocation operation and authority snapshot', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: callerPrincipal, invocationRef: 'invocation:canonical' },
    )).resolves.toEqual(canonicalPrincipal)

    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows({
        invocation: { grantGeneration: 3 },
      })) },
      { principal: callerPrincipal, invocationRef: 'invocation:canonical' },
    )).resolves.toBeNull()

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
      { principal: callerPrincipal, invocationRef: 'invocation:canonical' },
    )).resolves.toBeNull()
  })

  it('rejects an absent or ambiguous public operation authority target', async () => {
    const ctx = { db: new AuthorityMemoryDb(authorityRows()) }
    await expect(resolveAgentBoundary(ctx, { principal: callerPrincipal })).resolves.toBeNull()
    await expect(resolveAgentBoundary(ctx, {
      principal: callerPrincipal,
      operationRef: OPERATION_REF,
      invocationRef: 'invocation:canonical',
    })).resolves.toBeNull()
    await expect(resolveAgentBoundary(ctx, {
      principal: callerPrincipal,
      invocationRef: 'invocation:missing',
    })).resolves.toBeNull()
  })

  it('registers only current server-resolved agent provenance and canonical grant facts', async () => {
    const rows = authorityRows()
    rows.agentAccessPrincipals = []
    const db = new AuthorityMemoryDb(rows)
    await expect(registerAgentBoundary({
      db,
      auth: { getUserIdentity: async () => ({ tokenIdentifier: callerPrincipal.credentialId }) },
    }, registrationArgs({ seenAt: 1 }))).resolves.toEqual({ kind: 'recorded' })
    expect(rows.agentAccessPrincipals).toEqual([
      expect.objectContaining({
        principalId: PRINCIPAL_REF,
        ownerId: ACCOUNT_REF,
        ownerTokenIdentifier: callerPrincipal.credentialId,
        credentialId: callerPrincipal.credentialId,
        grantGeneration: 4,
        policyDigest: 'sha256:policy',
        scopes: ['market_operations:invoke'],
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
    ['forged digest', { policyDigest: 'sha256:forged' }],
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
      { invocationRef: 'invocation:canonical' },
    )).resolves.toEqual({
      kind: 'authorized',
      authority: {
        principalId: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF,
        credentialId: callerPrincipal.credentialId,
        grantRef: GRANT_REF,
        grantGeneration: 4,
        policyDigest: 'sha256:policy',
        expiresAt: NOW + 50_000,
      },
    })
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
      { invocationRef: 'invocation:canonical' },
    )).resolves.toEqual({ kind: 'refused' })
  })

  it.each([
    ['missing invocation', 'capabilityOperationInvocations'],
    ['missing persisted agent', 'agentAccessPrincipals'],
  ])('refuses worker authority for %s', async (_case, missingTable) => {
    const rows = authorityRows()
    ;(rows as Record<string, Row[]>)[missingTable] = []
    await expect(reconcileWorkloadBoundary(
      { db: new AuthorityMemoryDb(rows) },
      { invocationRef: 'invocation:canonical' },
    )).resolves.toEqual({ kind: 'refused' })
  })

  it('requires canonical agent expectations and exact authority targets on every public agent action', async () => {
    const ctx = agentContext()
    await expect(invokeBoundary(ctx, agentArgs())).resolves.toEqual(canonicalPrincipal)
    await expect(statusBoundary(ctx, { ...agentArgs(), invocationRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'found' })
    await expect(cancelBoundary(ctx, { ...agentArgs(), invocationRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'found' })
    await expect(reconcileBoundary(ctx, { ...agentArgs(), invocationRef: 'invocation:1', evidence: {
      attemptRef: 'attempt:1', effectGeneration: 1, requiredAt: new Date(0).toISOString(),
      retry: 'reconcile_before_retry', evidenceSource: 'test',
    } })).resolves.toMatchObject({ kind: 'found' })

    for (const call of [mocks.invoke, mocks.readStatus, mocks.cancel, mocks.reconcile]) {
      expect(call).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ principal: canonicalPrincipal }))
    }
    expect(ctx.runMutation).toHaveBeenCalledTimes(4)
    expect(ctx.runMutation).toHaveBeenNthCalledWith(1, expect.anything(), {
      principal: canonicalPrincipal,
      operationRef: OPERATION_REF,
    })
    for (const call of ctx.runMutation.mock.calls.slice(1)) {
      expect(call[1]).toEqual({ principal: canonicalPrincipal, invocationRef: 'invocation:1' })
    }
  })

  it('fails closed before any operation handler when the canonical agent binding is absent', async () => {
    const ctx = agentContext(null)
    await expect(invokeBoundary(ctx, agentArgs())).resolves.toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    await expect(statusBoundary(ctx, { ...agentArgs(), invocationRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(cancelBoundary(ctx, { ...agentArgs(), invocationRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(reconcileBoundary(ctx, { ...agentArgs(), invocationRef: 'invocation:1', evidence: {} })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    expect(mocks.invoke).not.toHaveBeenCalled()
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

    await expect(ownerStatusBoundary(ctx, { invocationRef: 'invocation:1' })).resolves.toMatchObject({
      identity: expectedIdentity,
      marker: 'preserved-auth-property',
    })
    await expect(ownerCancelBoundary(ctx, { invocationRef: 'invocation:1', idempotencyKey: 'cancel:1' })).resolves.toMatchObject({ identity: expectedIdentity })
    await expect(ownerReconcileBoundary(ctx, { invocationRef: 'invocation:1', idempotencyKey: 'reconcile:1', evidence: {} })).resolves.toMatchObject({ identity: expectedIdentity })
    await expect(listApprovalBoundary(ctx, {})).resolves.toEqual([expectedIdentity])
    await expect(decideApprovalBoundary(ctx, { invocationRef: 'invocation:1', decision: 'deny' })).resolves.toMatchObject({ identity: expectedIdentity })

    mocks.actor = { kind: 'anonymous', anonymousBucket: 'convex:anonymous' }
    await expect(ownerStatusBoundary(ctx, { invocationRef: 'invocation:1' })).resolves.toMatchObject({ kind: 'refused', code: 'invocation_not_found' })
    await expect(listApprovalBoundary(ctx, {})).resolves.toEqual([])
    await expect(decideApprovalBoundary(ctx, { invocationRef: 'invocation:1', decision: 'deny' })).resolves.toEqual({
      kind: 'refused', code: 'authentication_required',
    })
  })

  it('fails closed if an authenticated BusinessActor cannot be paired with an auth identity', async () => {
    const ctx = { auth: { getUserIdentity: async () => null } }
    await expect(ownerStatusBoundary(ctx, { invocationRef: 'invocation:1' })).rejects.toThrow(
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

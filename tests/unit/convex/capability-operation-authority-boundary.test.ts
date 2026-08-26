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

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
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

const callerPrincipal = {
  principalId: 'caller-principal',
  ownerId: 'caller-owner',
  credentialId: 'ak_live_locator',
  applicationRef: 'agentic-economy',
  environment: 'production' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'bounded_mandate' as const,
}
const canonicalPrincipal = {
  ...callerPrincipal,
  principalId: `prn_${'3'.repeat(32)}`,
  ownerId: `acc_${'4'.repeat(32)}`,
}

function path(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

function agentContext(result: typeof canonicalPrincipal | null = canonicalPrincipal) {
  return {
    runMutation: vi.fn(async (reference: unknown) => {
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
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) Object.assign(row, value)
    }
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

function authorityRows(overrides: Readonly<{
  binding?: Record<string, unknown>
  credential?: Record<string, unknown>
  principal?: Record<string, unknown>
  storedAgent?: Record<string, unknown>
  accessGrant?: Record<string, unknown>
  delegation?: Record<string, unknown>
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
      expiresAt: NOW + 60_000, ...overrides.credential,
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
    authorityDelegationGrants: [{
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
    }],
    accounts: [{
      _id: 'accounts:1', accountRef: ACCOUNT_REF, lifecycle: 'active', revision: 1,
      currentOwnershipRef: OWNERSHIP_REF, ...overrides.account,
    }],
    accountOwnerships: [{
      _id: 'accountOwnerships:1', ownershipRef: OWNERSHIP_REF, accountRef: ACCOUNT_REF,
      ownerPrincipalRef: PRINCIPAL_REF, lifecycle: 'active',
    }],
    capabilityOperationInvocations: [{
      _id: 'capabilityOperationInvocations:1', invocationRef: 'invocation:canonical',
      principalId: PRINCIPAL_REF, ownerId: ACCOUNT_REF, credentialId: callerPrincipal.credentialId,
      applicationRef: callerPrincipal.applicationRef, environment: 'production',
      grantRef: GRANT_REF, grantGeneration: 4, policyDigest: 'sha256:policy',
      grantExpiresAt: NOW + 50_000, operationRef: OPERATION_REF, ...overrides.invocation,
    }],
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
  it('derives agent provenance from the current credential, Principal, Account, and exact Grant generation', async () => {
    const result = await resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: callerPrincipal },
    )
    expect(result).toEqual(canonicalPrincipal)
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
      { principal: callerPrincipal },
    )).resolves.toBeNull()
  })

  it('denies a caller that omits the required operation scope', async () => {
    await expect(resolveAgentBoundary(
      { db: new AuthorityMemoryDb(authorityRows()) },
      { principal: { ...callerPrincipal, scopes: [] } },
    )).resolves.toBeNull()
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

  it('replaces caller-shaped agent provenance with the current canonical binding on every public agent action', async () => {
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

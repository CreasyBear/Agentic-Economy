import { convexTest, type TestConvex } from 'convex-test'
import { getFunctionName, type FunctionArgs, type FunctionReference } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

import { internal } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import schema from '../../../convex/schema'
import { beginLeaseEffectHandler } from '../../../convex/lib/providerConnections/leases'
import {
  abortProviderConsequenceHandler,
  attestProviderConsequenceTicketHandler,
  authorizeProviderConsequenceX402RpcHandler,
  claimProviderConsequenceHandler,
  completeProviderConsequenceHandler,
  issueProviderConsequenceTicketHandler,
} from '../../../convex/capabilityProviderConsequenceJournal'
import {
  abortProviderConsequenceJournal,
  attestProviderConsequenceTicket,
  beginProviderConsequenceJournal,
  completeProviderConsequenceJournal,
  providerConsequenceX402Rpc,
} from '../../../convex/providerConsequenceHttp'
import convexHttp from '../../../convex/http'
import type { ActionCtx } from '../../../convex/_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  createJitProviderConsequenceBoundary,
  providerConsequenceInvocationDigest,
  type ProviderConsequenceJournal,
} from '@/modules/capability-execution/provider-consequence-runtime'
import type { RouteTransportFetch, RouteTransportInvocation } from '@/modules/capability-supply/route-transport-runtime'
import {
  secretGeneration,
  secretRef,
  type ProductionSecretRuntimeOptions,
  type SecretPointer,
} from '@/modules/secrets/public'
import { issueProviderApprovalDecision } from '@/modules/capability-supply/provider-approval'
import {
  convexModules,
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'

const NOW = 2_000_000_000_000
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
const JOURNAL_TOKEN = 'journal-token-never-persisted'
const HTTP_JOURNAL_TOKEN = 't'.repeat(43)
const HTTP_JOURNAL_TOKEN_DIGEST = `sha256:${createHash('sha256').update(HTTP_JOURNAL_TOKEN).digest('hex')}`
const TOKEN_DIGEST = canonicalDigest(JOURNAL_TOKEN)
const REQUEST_DIGEST = DIGEST('1')
const INVOCATION_DIGEST = DIGEST('2')
const CLAIMS_DIGEST = DIGEST('3')
const OPERATION_KEY_DIGEST = DIGEST('4')
const TICKET_REF = 'provider-ticket:test'
const EFFECT_REF = 'connection-effect:test'
const CLAIM_REF = `provider-claim:${TICKET_REF}`
const SECRET_REF = `sec_${'5'.repeat(32)}`
const PAYMENT_SECRET_REF = `sec_${'6'.repeat(32)}`
const { getVercelOidcToken } = vi.hoisted(() => ({ getVercelOidcToken: vi.fn() }))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken }))
type Backend = TestConvex<typeof schema>
type CanonicalOwner = Readonly<{ principalRef: string; accountRef: string }>
type HttpExport = { _handler: (ctx: ActionCtx, request: Request) => Promise<Response> }
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
const beginProviderConsequenceRuntime = (beginProviderConsequenceJournal as unknown as HttpExport)._handler
const attestProviderConsequenceRuntime = (attestProviderConsequenceTicket as unknown as HttpExport)._handler
const completeProviderConsequenceRuntime = (
  completeProviderConsequenceJournal as unknown as HttpExport
)._handler
const abortProviderConsequenceRuntime = (abortProviderConsequenceJournal as unknown as HttpExport)._handler
const providerConsequenceX402Runtime = (providerConsequenceX402Rpc as unknown as HttpExport)._handler

function registeredProviderPost(path: string): HttpExport['_handler'] {
  const match = convexHttp.lookup(path, 'POST')
  if (match === null || match[1] !== 'POST' || match[2] !== path) {
    throw new Error(`registered_provider_POST_missing:${path}`)
  }
  return (match[0] as unknown as HttpExport)._handler
}

function providerToken(caseKind: IsolationCaseKind): string | null {
  if (caseKind === 'missing_workload') return null
  if (caseKind === 'workload' || caseKind === 'wrong_account' || caseKind === 'stale_generation') {
    return HTTP_JOURNAL_TOKEN
  }
  return caseKind === 'owner' ? 'o'.repeat(43) : caseKind === 'member' ? 'm'.repeat(43) : 's'.repeat(43)
}

function providerRequest(
  path: string,
  body: unknown,
  token: string | null,
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (token !== null) headers.set('Authorization', `Bearer ${token}`)
  return new Request(`https://deployment.convex.site${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function providerActionContext(
  backend: Backend,
  callTrace: string[],
): ActionCtx {
  const mutation = backend.mutation.bind(backend) as unknown as (
    reference: FunctionReference<'mutation'>,
    args: Record<string, unknown>,
  ) => Promise<unknown>
  const query = backend.query.bind(backend) as unknown as (
    reference: FunctionReference<'query'>,
    args: Record<string, unknown>,
  ) => Promise<unknown>
  return {
    runMutation: async (reference: FunctionReference<'mutation'>, args: Record<string, unknown>) => {
      callTrace.push(getFunctionName(reference))
      return await mutation(reference, args)
    },
    runQuery: async (reference: FunctionReference<'query'>, args: Record<string, unknown>) => {
      callTrace.push(getFunctionName(reference))
      return await query(reference, args)
    },
  } as unknown as ActionCtx
}

async function canonicalOwner(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
): Promise<CanonicalOwner> {
  return await backend.run(async (ctx) => {
    const business = await ctx.db.get(businessId)
    if (business === null) throw new Error('business_missing')
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', business.owningAccountRef))
      .unique()
    if (account === null) throw new Error('canonical_account_missing')
    const ownership = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
      .unique()
    if (ownership === null) throw new Error('canonical_ownership_missing')
    const principal = await ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', ownership.ownerPrincipalRef))
      .unique()
    if (principal === null) throw new Error('canonical_owner_missing')
    return { principalRef: principal.principalRef, accountRef: account.accountRef }
  })
}

async function grant(
  backend: ConvexFixtureBackend,
  owner: CanonicalOwner,
  suffix: string,
  scopes: readonly string[],
  resources: readonly string[],
) {
  const grantRef = `grt_${suffix.repeat(32)}`
  const expiresAt = NOW + 300_000
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: owner.accountRef,
      actorPrincipalRef: owner.principalRef,
      subjectPrincipalRef: owner.principalRef,
      scopes: [...scopes].sort(),
      resourceRefs: [...resources].sort(),
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: NOW - 1_000,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `create:${grantRef}`,
        idempotencyRef: `create:${grantRef}`,
      },
    })
  })
  return { grantRef, expiresAt }
}

async function childGrant(
  backend: ConvexFixtureBackend,
  owner: CanonicalOwner,
  suffix: string,
  parent: Readonly<{ grantRef: string; expiresAt: number }>,
  scopes: readonly string[],
  resources: readonly string[],
) {
  const grantRef = `grt_${suffix.repeat(32)}`
  const expiresAt = parent.expiresAt - 60_000
  await backend.run(async (ctx) => {
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: owner.accountRef,
      actorPrincipalRef: owner.principalRef,
      subjectPrincipalRef: owner.principalRef,
      parentGrantRef: parent.grantRef,
      parentGeneration: 1,
      scopes: [...scopes].sort(),
      resourceRefs: [...resources].sort(),
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: NOW - 500,
      createdBy: {
        actorPrincipalRef: owner.principalRef,
        activeAccountRef: owner.accountRef,
        correlationRef: `create:${grantRef}`,
        idempotencyRef: `create:${grantRef}`,
      },
    })
  })
  return { grantRef, expiresAt, parentGrantRef: parent.grantRef }
}

async function freshIssueAuthority(adapterId = 'http-json:v1') {
  const backend = convexTestWithMarketComponents()
  const fixture = await publishedBusinessOwner(backend, 'provider-consequence-journal')
  const owner = await canonicalOwner(backend, fixture.businessId)
  const providerNamespace = `capability-provider/${adapterId}`
  const providerAccountRef = 'account:journal'
  await grant(backend, owner, 'a', ['connection:install'], [
    `connection-provider:${providerNamespace}`,
    `connection-provider:${providerNamespace}:${providerAccountRef}`,
    `secret:${SECRET_REF}`,
  ])
  const installed = await backend.mutation(internal.capabilityProviderConnections.create, {
    commandId: 'command:install:journal',
    connectionRef: 'connection:journal',
    businessId: fixture.businessId,
    providerRef: 'provider:journal',
    providerAccountRef,
    adapterId,
    credentialRef: SECRET_REF,
    requestedScopes: ['profile:read'],
    grantedScopes: ['profile:read'],
    requestedResources: [providerAccountRef],
    grantedResources: [providerAccountRef],
    evidenceRefs: ['evidence:install'],
    now: NOW,
  })
  if (installed.kind === 'refused' || installed.connection.connectionRef === undefined) {
    throw new Error('canonical_install_failed')
  }
  const operationRef = 'operation:journal'
  const invocationRef = 'invocation:journal'
  const attemptRef = 'attempt:journal'
  const leaseGrantScopes = [
    'connection:begin_effect',
    'connection:lease',
  ]
  const leaseGrantResources = [operationRef, `connection:${installed.connection.connectionRef}`]
  const leaseRootGrant = await grant(backend, owner, 'b', leaseGrantScopes, leaseGrantResources)
  const leaseGrant = await childGrant(
    backend,
    owner,
    'c',
    leaseRootGrant,
    leaseGrantScopes,
    leaseGrantResources,
  )
  const approval = issueProviderApprovalDecision({
    commandId: 'command:approval:journal',
    decisionRef: 'decision:approval:journal',
    providerRef: installed.connection.providerRef,
    providerAccountRef: installed.connection.providerAccountRef,
    connectionRef: installed.connection.connectionRef,
    authorityGeneration: installed.connection.authorityGeneration,
    connectionAuthorityDigest: installed.connection.authorityDigest,
    requestedScopes: [...installed.connection.grantedScopes],
    grantedScopes: [...installed.connection.grantedScopes],
    requestedResources: [...installed.connection.grantedResources],
    grantedResources: [...installed.connection.grantedResources],
    decision: 'granted',
    decisionMakerAuthorityRef: 'authority:test',
    reasonCode: 'test',
    evidenceRefs: ['evidence:approval'],
  }, NOW, {
    connectionRef: installed.connection.connectionRef,
    providerRef: installed.connection.providerRef,
    providerAccountRef: installed.connection.providerAccountRef,
    authorityGeneration: installed.connection.authorityGeneration,
    authorityDigest: installed.connection.authorityDigest,
  })
  if (approval.kind === 'refused') throw new Error(approval.code)
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityProviderApprovals', {
      ...approval.decision,
      requestedScopes: [...approval.decision.requestedScopes],
      grantedScopes: [...approval.decision.grantedScopes],
      requestedResources: [...approval.decision.requestedResources],
      grantedResources: [...approval.decision.grantedResources],
      evidenceRefs: [...approval.decision.evidenceRefs],
    })
    await ctx.db.insert('capabilityOperationInvocations', {
      invocationRef,
      principalId: owner.principalRef,
      ownerId: 'legacy-owner-not-authority',
      credentialId: 'credential:journal',
      applicationRef: 'application:journal',
      operationRef,
      idempotencyKey: 'idempotency:journal',
      environment: 'sandbox',
      grantRef: leaseGrant.grantRef,
      grantGeneration: 1,
      policyDigest: DIGEST('c'),
      grantExpiresAt: leaseGrant.expiresAt,
      inputDigest: DIGEST('d'),
      requestDigest: REQUEST_DIGEST,
      state: 'pending',
      attemptRef,
      updatedAt: NOW,
      createdAt: NOW,
    })
  })
  const readinessValidUntil = NOW + 120_000
  const readinessDigest = DIGEST('e')
  const leaseResult = await backend.mutation(internal.capabilityProviderConnections.issueLease, {
    commandId: 'command:lease:journal',
    leaseRef: 'lease:journal',
    invocationRef,
    operationRef,
    connectionRef: installed.connection.connectionRef,
    providerRef: installed.connection.providerRef,
    providerAccountRef: installed.connection.providerAccountRef,
    adapterId: installed.connection.adapterId,
    expectedAuthorityGeneration: installed.connection.authorityGeneration,
    expectedAuthorityDigest: installed.connection.authorityDigest,
    requestedScopes: [...installed.connection.grantedScopes],
    grantedScopes: [...installed.connection.grantedScopes],
    requestedResources: [...installed.connection.grantedResources],
    grantedResources: [...installed.connection.grantedResources],
    approvalDecisionRef: approval.decision.decisionRef,
    readinessValidUntil,
    readinessDigest,
    leaseMs: 60_000,
    evidenceRefs: ['evidence:lease'],
    now: NOW,
  })
  if (leaseResult.kind === 'refused') throw new Error(`lease_issue_failed:${leaseResult.code}`)
  const signingSecretRef = `sec_${'8'.repeat(32)}`
  await backend.run(async (ctx) => {
    await ctx.db.insert('secretPointers', {
      secretRef: SECRET_REF,
      owningAccountRef: owner.accountRef,
      activeGeneration: `sgn_${'3'.repeat(32)}`,
      revision: 4,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        operation: 'provision',
        snapshotRef: 'snapshot:customer',
        accountRef: owner.accountRef,
        actorPrincipalRef: owner.principalRef,
        grantRef: leaseGrant.grantRef,
        grantGeneration: 1,
        correlationRef: 'correlation:customer',
        idempotencyRef: 'idempotency:customer',
        occurredAt: NOW,
      },
    })
    await ctx.db.insert('secretPointers', {
      secretRef: signingSecretRef,
      owningAccountRef: `acc_${'9'.repeat(32)}`,
      activeGeneration: `sgn_${'9'.repeat(32)}`,
      revision: 2,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        operation: 'provision',
        snapshotRef: 'snapshot:signing',
        accountRef: `acc_${'9'.repeat(32)}`,
        actorPrincipalRef: `prn_${'9'.repeat(32)}`,
        grantRef: 'grant:signing',
        grantGeneration: 1,
        correlationRef: 'correlation:signing',
        idempotencyRef: 'idempotency:signing',
        occurredAt: NOW,
      },
    })
    await ctx.db.insert('secretPointers', {
      secretRef: PAYMENT_SECRET_REF,
      owningAccountRef: `acc_${'9'.repeat(32)}`,
      activeGeneration: `sgn_${'6'.repeat(32)}`,
      revision: 5,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        operation: 'provision',
        snapshotRef: 'snapshot:payment',
        accountRef: `acc_${'9'.repeat(32)}`,
        actorPrincipalRef: `prn_${'9'.repeat(32)}`,
        grantRef: 'grant:payment',
        grantGeneration: 1,
        correlationRef: 'correlation:payment',
        idempotencyRef: 'idempotency:payment',
        occurredAt: NOW,
      },
    })
  })
  const args = issueArgs({
    commandId: 'provider-effect:invocation:journal:attempt:journal:1',
    invocationRef,
    operationRef,
    attemptRef,
    leaseRef: 'lease:journal',
    providerRef: installed.connection.providerRef,
    adapterId: installed.connection.adapterId,
    authorityDigest: installed.connection.authorityDigest,
    grantedScopes: [...installed.connection.grantedScopes],
    grantedResources: [...installed.connection.grantedResources],
    readinessValidUntil,
    readinessDigest,
    signingSecretRef,
  })
  return {
    backend,
    args,
    owner,
    signingSecretRef,
    connection: installed.connection,
    lease: leaseResult.lease,
    leaseRootGrant,
  }
}

async function currentEffectFixture(primaryPatch: Record<string, unknown> = {}) {
  const fixture = await freshIssueAuthority()
  const first = await fixture.backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, fixture.args))
  if (first.kind !== 'issued') throw new Error('initial_ticket_issue_failed')
  await fixture.backend.run(async (ctx) => {
    const primary = await ctx.db.query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique()
    if (primary === null) throw new Error('primary_journal_missing')
    await ctx.db.patch(primary._id, primaryPatch)
    await ctx.db.insert('providerConsequenceJournal', {
      ...journalRow({
        ticketRef: 'provider-ticket:aborted-shadow',
        effectRef: 'connection-effect:aborted-shadow',
        commandId: fixture.args.commandId,
        state: 'aborted',
        abortedAt: NOW,
      }),
    })
  })
  return fixture
}

function journalRow(overrides: Record<string, unknown> = {}) {
  return {
    ticketRef: TICKET_REF,
    effectRef: EFFECT_REF,
    commandId: 'provider-effect:invocation:test:attempt:test:1',
    state: 'pending' as const,
    journalTokenDigest: TOKEN_DIGEST,
    requestDigest: REQUEST_DIGEST,
    invocationDigest: INVOCATION_DIGEST,
    operationKeyDigest: OPERATION_KEY_DIGEST,
    ticketClaimsDigest: CLAIMS_DIGEST,
    invocationRef: 'invocation:test',
    operationRef: 'operation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    leaseRef: 'lease:test',
    connectionRef: 'connection:test',
    authorityGeneration: 6,
    providerRef: 'provider:test',
    adapterId: 'x402-fetch:v2',
    authorityDigest: DIGEST('6'),
    grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'],
    readinessValidUntil: NOW + 20_000,
    readinessDigest: DIGEST('7'),
    owningAccountRef: `acc_${'1'.repeat(32)}`,
    activeAccountRef: `acc_${'1'.repeat(32)}`,
    actorPrincipalRef: `prn_${'2'.repeat(32)}`,
    grantRef: 'grant:test',
    grantGeneration: 3,
    secretRef: SECRET_REF,
    secretGeneration: `sgn_${'3'.repeat(32)}`,
    secretPointerRevision: 4,
    paymentSecretRef: PAYMENT_SECRET_REF,
    paymentSecretGeneration: `sgn_${'6'.repeat(32)}`,
    paymentSecretPointerRevision: 5,
    paymentAccountRef: `acc_${'9'.repeat(32)}`,
    signingSecretRef: `sec_${'8'.repeat(32)}`,
    signingSecretGeneration: `sgn_${'9'.repeat(32)}`,
    signingSecretPointerRevision: 2,
    signingAccountRef: `acc_${'9'.repeat(32)}`,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 10_000,
    updatedAt: NOW - 1_000,
    ...overrides,
  }
}

function claimArgs(overrides: Record<string, unknown> = {}) {
  return {
    ticketRef: TICKET_REF,
    journalTokenDigest: TOKEN_DIGEST,
    effectRef: EFFECT_REF,
    requestDigest: REQUEST_DIGEST,
    invocationDigest: INVOCATION_DIGEST,
    ticketClaimsDigest: CLAIMS_DIGEST,
    expiresAt: NOW + 10_000,
    ...overrides,
  }
}

function issueArgs(overrides: Record<string, unknown> = {}) {
  const adapterId = typeof overrides.adapterId === 'string'
    ? overrides.adapterId
    : 'x402-fetch:v2'
  return {
    ticketRef: TICKET_REF,
    commandId: 'provider-effect:invocation:test:attempt:test:1',
    journalTokenDigest: TOKEN_DIGEST,
    requestDigest: REQUEST_DIGEST,
    invocationDigest: INVOCATION_DIGEST,
    operationKeyDigest: OPERATION_KEY_DIGEST,
    invocationRef: 'invocation:test',
    operationRef: 'operation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    leaseRef: 'lease:test',
    providerRef: 'provider:test',
    adapterId,
    authorityDigest: DIGEST('6'),
    grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'],
    readinessValidUntil: NOW + 20_000,
    readinessDigest: DIGEST('7'),
    signingSecretRef: `sec_${'8'.repeat(32)}`,
    ...(adapterId === 'x402-fetch:v2' ? { paymentSecretRef: PAYMENT_SECRET_REF } : {}),
    requestedExpiresAt: NOW + 10_000,
    ...overrides,
  }
}

function succeededObservation(requestDigest = REQUEST_DIGEST) {
  return {
    transport: 'x402' as const,
    disposition: 'succeeded' as const,
    releaseStarted: true,
    requestDigest,
    outputJson: JSON.stringify({ serviceReference: 'service:test' }),
    settlementEvidence: {
      kind: 'settled' as const,
      response: {
        success: true,
        transaction: '0xsettlement',
        network: 'eip155:84532',
      },
      digest: DIGEST('e'),
    },
  }
}

async function backendWithJournal(overrides: Record<string, unknown> = {}) {
  const backend = convexTest(schema, convexModules)
  await backend.run(async (ctx) => {
    await ctx.db.insert('providerConsequenceJournal', journalRow(overrides))
  })
  return backend
}

async function readJournal(backend: Backend) {
  return await backend.run(async (ctx) => await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique())
}

async function seedProviderX402RuntimeRows(
  backend: Backend,
  caseKind: IsolationCaseKind,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityOperationInvocations', {
      invocationRef: 'invocation:test',
      principalId: caseKind === 'wrong_account' ? `prn_${'f'.repeat(32)}` : `prn_${'2'.repeat(32)}`,
      ownerId: 'owner:test',
      credentialId: 'credential:test',
      applicationRef: 'application:test',
      operationRef: 'operation:test',
      idempotencyKey: 'idempotency:test',
      environment: 'sandbox',
      grantRef: 'grant:test',
      grantGeneration: caseKind === 'stale_generation' ? 2 : 3,
      policyDigest: DIGEST('8'),
      grantExpiresAt: NOW + 20_000,
      inputDigest: DIGEST('9'),
      requestDigest: REQUEST_DIGEST,
      state: 'pending',
      attemptRef: 'attempt:test',
      updatedAt: NOW,
      createdAt: NOW,
    })
    await ctx.db.insert('moneyX402PaymentAttempts', {
      dispatchRef: 'invocation:test',
      attemptRef: 'attempt:test',
      effectGeneration: 1,
      operationRef: 'operation:test',
      paymentIdentifier: OPERATION_KEY_DIGEST,
      operationKeyDigest: OPERATION_KEY_DIGEST,
      challengeDigest: DIGEST('a'),
      challengeJson: '{}',
      selectedRequirementJson: '{}',
      providerEndpoint: 'https://provider.example/pay',
      credentialRef: PAYMENT_SECRET_REF,
      scheme: 'exact',
      network: 'eip155:8453',
      asset: 'asset:test',
      payTo: 'payee:test',
      amountUnits: '1',
      currency: 'USD',
      exponent: 2,
      custodyRef: 'custody:test',
      authorizationDigest: DIGEST('b'),
      state: 'prepared',
      preparedAt: NOW,
      evidenceRefs: [],
    })
  })
}

function testOidcJwt(): string {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3_540 })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

function vaultConfig(scope: 'platform' | 'customer') {
  return {
    scope,
    baseUrl: 'https://app.infisical.com',
    projectId: `project-${scope}`,
    environment: 'production',
    secretPath: `/agentic-economy/${scope}`,
    machineIdentityId: `identity-${scope}`,
  } as const
}

function fixedPointer(pointer: SecretPointer) {
  return {
    getActive: async () => pointer,
    advanceActive: async () => { throw new Error('pointer_advance_forbidden') },
  }
}

function testVaultFetch(secretValue: string): typeof globalThis.fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'vault-access-token',
        tokenType: 'Bearer',
        expiresIn: 600,
        accessTokenMaxTTL: 600,
      })
    }
    return Response.json({
      secret: {
        secretKey: `${SECRET_REF}--${`sgn_${'3'.repeat(32)}`}`,
        secretValue,
        environment: 'production',
        workspace: url.searchParams.get('projectId'),
      },
    })
  }) as typeof globalThis.fetch
}

describe('provider consequence durable journal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    getVercelOidcToken.mockReset()
    getVercelOidcToken.mockResolvedValue(testOidcJwt())
  })

  it('resolves a configured credential only through the atomic consequence-time lease gate', async () => {
    const { backend, args, owner } = await freshIssueAuthority()
    await expect(backend.run(async (ctx) => beginLeaseEffectHandler(ctx, {
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      commandId: args.commandId,
    }))).resolves.toMatchObject({
      kind: 'admitted',
      owningAccountRef: owner.accountRef,
      activeAccountRef: owner.accountRef,
      actorPrincipalRef: owner.principalRef,
      secretRef: SECRET_REF,
    })
  })

  it.each(['revoked_parent', 'stale_parent', 'inactive_context'] as const)(
    'refuses consequence authority when the live delegation context is %s',
    async (failure) => {
      const fixture = await freshIssueAuthority()
      await fixture.backend.run(async (ctx) => {
        if (failure === 'inactive_context') {
          const account = await ctx.db.query('accounts')
            .withIndex('by_accountRef', (query) => query.eq('accountRef', fixture.owner.accountRef))
            .unique()
          if (account === null) throw new Error('account_fixture_missing')
          await ctx.db.patch(account._id, { lifecycle: 'suspended' })
          return
        }
        const parent = await ctx.db.query('authorityDelegationGrants')
          .withIndex('by_grantRef', (query) => query.eq('grantRef', fixture.leaseRootGrant.grantRef))
          .unique()
        if (parent === null) throw new Error('parent_grant_fixture_missing')
        await ctx.db.patch(parent._id, failure === 'revoked_parent'
          ? { lifecycle: 'revoked', generation: parent.generation + 1, revision: parent.revision + 1, revokedAt: NOW }
          : { generation: parent.generation + 1, revision: parent.revision + 1 })
      })

      await expect(fixture.backend.run(async (ctx) => beginLeaseEffectHandler(ctx, {
        leaseRef: fixture.args.leaseRef,
        invocationRef: fixture.args.invocationRef,
        operationRef: fixture.args.operationRef,
        commandId: fixture.args.commandId,
      }))).resolves.toEqual({ kind: 'unavailable', reason: 'invocation_authority_mismatch' })
    },
  )

  it('prevents an attacker account from leasing or using a victim connection credential', async () => {
    const fixture = await freshIssueAuthority()
    const attackerBusiness = await publishedBusinessOwner(fixture.backend, 'provider-consequence-attacker')
    const attacker = await canonicalOwner(fixture.backend, attackerBusiness.businessId)
    const attackerGrant = await grant(fixture.backend, attacker, 'd', [
      'connection:begin_effect',
      'connection:lease',
    ], [fixture.args.operationRef, `connection:${fixture.connection.connectionRef}`])
    await fixture.backend.run(async (ctx) => {
      const invocation = await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', fixture.args.invocationRef))
        .unique()
      if (invocation === null) throw new Error('invocation_fixture_missing')
      await ctx.db.patch(invocation._id, {
        principalId: attacker.principalRef,
        grantRef: attackerGrant.grantRef,
        grantGeneration: 1,
        grantExpiresAt: attackerGrant.expiresAt,
      })
    })

    const leaseRef = 'lease:attacker'
    await expect(fixture.backend.mutation(internal.capabilityProviderConnections.issueLease, {
      commandId: 'command:lease:attacker',
      leaseRef,
      invocationRef: fixture.args.invocationRef,
      operationRef: fixture.args.operationRef,
      connectionRef: fixture.connection.connectionRef,
      providerRef: fixture.connection.providerRef,
      providerAccountRef: fixture.connection.providerAccountRef,
      adapterId: fixture.connection.adapterId,
      expectedAuthorityGeneration: fixture.connection.authorityGeneration,
      expectedAuthorityDigest: fixture.connection.authorityDigest,
      requestedScopes: [...fixture.connection.grantedScopes],
      grantedScopes: [...fixture.connection.grantedScopes],
      requestedResources: [...fixture.connection.grantedResources],
      grantedResources: [...fixture.connection.grantedResources],
      approvalDecisionRef: 'decision:approval:journal',
      readinessValidUntil: fixture.args.readinessValidUntil,
      readinessDigest: fixture.args.readinessDigest,
      leaseMs: 60_000,
      evidenceRefs: ['evidence:attacker-lease'],
      now: NOW,
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_lease' })
    await expect(fixture.backend.run(async (ctx) => beginLeaseEffectHandler(ctx, {
      leaseRef,
      invocationRef: fixture.args.invocationRef,
      operationRef: fixture.args.operationRef,
      commandId: 'command:effect:attacker',
    }))).resolves.toEqual({ kind: 'unavailable', reason: 'lease_inactive' })
  })

  it.each(['revoked_parent', 'stale_parent'] as const)(
    'refuses provider installation when its delegation has a %s',
    async (failure) => {
      const backend = convexTestWithMarketComponents()
      const fixture = await publishedBusinessOwner(backend, `provider-install-${failure}`)
      const owner = await canonicalOwner(backend, fixture.businessId)
      const providerAccountRef = `account:install:${failure}`
      const resources = [
        'connection-provider:capability-provider/http-json:v1',
        `connection-provider:capability-provider/http-json:v1:${providerAccountRef}`,
        `secret:${SECRET_REF}`,
      ]
      const parent = await grant(backend, owner, 'e', ['*'], ['*'])
      await childGrant(backend, owner, 'f', parent, ['connection:install'], resources)
      await backend.run(async (ctx) => {
        const parentRow = await ctx.db.query('authorityDelegationGrants')
          .withIndex('by_grantRef', (query) => query.eq('grantRef', parent.grantRef))
          .unique()
        if (parentRow === null) throw new Error('parent_grant_fixture_missing')
        await ctx.db.patch(parentRow._id, failure === 'revoked_parent'
          ? { lifecycle: 'revoked', generation: 2, revision: 2, revokedAt: NOW }
          : { generation: 2, revision: 2 })
      })

      await expect(backend.mutation(internal.capabilityProviderConnections.create, {
        commandId: `command:install:${failure}`,
        connectionRef: `connection:install:${failure}`,
        businessId: fixture.businessId,
        providerRef: 'provider:install-test',
        providerAccountRef,
        adapterId: 'http-json:v1',
        credentialRef: SECRET_REF,
        requestedScopes: ['profile:read'],
        grantedScopes: ['profile:read'],
        requestedResources: [providerAccountRef],
        grantedResources: [providerAccountRef],
        evidenceRefs: ['evidence:install-test'],
        now: NOW,
      })).resolves.toEqual({ kind: 'refused', code: 'invalid_transition' })
    },
  )

  it('issues a fresh ticket only from exact current lease, invocation, connection, grant, and secret authority', async () => {
    const { backend, args, owner, signingSecretRef } = await freshIssueAuthority()

    const first = await backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args))
    expect(first).toMatchObject({
      kind: 'issued',
      ticket: {
        ticketRef: TICKET_REF,
        invocationRef: args.invocationRef,
        operationRef: args.operationRef,
        leaseRef: args.leaseRef,
        providerRef: args.providerRef,
        adapterId: args.adapterId,
        owningAccountRef: owner.accountRef,
        activeAccountRef: owner.accountRef,
        actorPrincipalRef: owner.principalRef,
        secret: {
          secretRef: SECRET_REF,
          activeGeneration: `sgn_${'3'.repeat(32)}`,
          pointerRevision: 4,
        },
      },
      signingSecret: {
        secretRef: signingSecretRef,
        activeGeneration: `sgn_${'9'.repeat(32)}`,
        pointerRevision: 2,
      },
    })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual(first)
    const persisted = await backend.run(async (ctx) => await ctx.db.query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique())
    expect(persisted).toMatchObject({
      state: 'pending',
      commandId: args.commandId,
      journalTokenDigest: TOKEN_DIGEST,
      owningAccountRef: owner.accountRef,
      secretRef: SECRET_REF,
      signingSecretRef,
    })
    expect(JSON.stringify(persisted)).not.toContain(JOURNAL_TOKEN)
  })

  it('executes one real installed provider consequence and replays without a second provider send', async () => {
    const fixture = await freshIssueAuthority()
    const { connection, lease } = fixture
    expect(lease.connectionRef).toBe(connection.connectionRef)
    const config = { method: 'POST' as const, requestTimeoutMs: 5_000, credential: { kind: 'bearer' as const } }
    const routeInvocation: Extract<RouteTransportInvocation, { binding: { authority: { kind: 'provider_connection' } } }> = {
      binding: {
        adapterId: connection.adapterId,
        endpointUrl: 'https://provider.example/run',
        authority: {
          kind: 'provider_connection',
          connectionRef: connection.connectionRef,
          providerRef: connection.providerRef,
        },
        configJson: JSON.stringify(config),
        configDigest: canonicalDigest(config),
      },
      authority: {
        attemptRef: fixture.args.attemptRef,
        effectGeneration: 1,
        operationKeyDigest: fixture.args.operationKeyDigest,
        mandateDigest: DIGEST('6'),
        grantDigest: DIGEST('7'),
        capabilityContractDigest: DIGEST('8'),
        maximumSpend: { currency: 'USD', units: '0', exponent: 2 },
        expiresAt: fixture.args.requestedExpiresAt,
        callIdentity: { keyId: 'route-calls:test', signature: 'hmac-sha256:test' },
        authorityGeneration: lease.authorityGeneration,
        authorityDigest: lease.authorityDigest,
        leaseRef: fixture.args.leaseRef,
        invocationRef: fixture.args.invocationRef,
        operationRef: fixture.args.operationRef,
        grantedScopes: fixture.args.grantedScopes,
        grantedResources: fixture.args.grantedResources,
        readinessValidUntil: fixture.args.readinessValidUntil,
        ...(fixture.args.readinessDigest === undefined ? {} : { readinessDigest: fixture.args.readinessDigest }),
      },
      inputJson: JSON.stringify({ destination: 'PER' }),
    }
    const requestDigest = canonicalDigest({
      adapterId: routeInvocation.binding.adapterId,
      endpointUrl: routeInvocation.binding.endpointUrl,
      configDigest: routeInvocation.binding.configDigest,
      attemptRef: routeInvocation.authority.attemptRef,
      operationKeyDigest: routeInvocation.authority.operationKeyDigest,
      mandateDigest: routeInvocation.authority.mandateDigest,
      grantDigest: routeInvocation.authority.grantDigest,
      capabilityContractDigest: routeInvocation.authority.capabilityContractDigest,
      inputJson: routeInvocation.inputJson,
    } as StableHashValue)
    const invocationDigest = providerConsequenceInvocationDigest(routeInvocation)
    if (invocationDigest === undefined) throw new Error('invocation_digest_fixture_missing')
    const issued = await fixture.backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, {
      ...fixture.args,
      requestDigest,
      invocationDigest,
    }))
    if (issued.kind !== 'issued') throw new Error('ticket_issue_fixture_failed')
    expect(issued.ticket.connectionRef).toBe(connection.connectionRef)
    expect(issued.ticket.connectionRef).toBe(routeInvocation.binding.authority.connectionRef)

    const durableJournal: ProviderConsequenceJournal = {
      begin: async (input) => await fixture.backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, {
        ticketRef: input.ticketRef,
        journalTokenDigest: TOKEN_DIGEST,
        effectRef: input.effectRef,
        requestDigest: input.requestDigest,
        invocationDigest: input.invocationDigest,
        ticketClaimsDigest: input.ticketClaimsDigest,
        expiresAt: input.expiresAt,
      })),
      complete: async ({ claimRef, observation }) => {
        const result = await fixture.backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
          ticketRef: issued.ticket.ticketRef,
          journalTokenDigest: TOKEN_DIGEST,
          claimRef,
          observationJson: JSON.stringify(observation),
        }))
        if (result.kind !== 'completed') throw new Error('completion_fixture_failed')
      },
      abortBeforeRelease: async ({ claimRef }) => {
        const result = await fixture.backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, {
          ticketRef: issued.ticket.ticketRef,
          journalTokenDigest: TOKEN_DIGEST,
          claimRef,
        }))
        if (result.kind !== 'aborted') throw new Error('abort_fixture_failed')
      },
    }
    const customerPointer: SecretPointer = {
      secretRef: secretRef(issued.ticket.secret.secretRef),
      activeGeneration: secretGeneration(issued.ticket.secret.activeGeneration),
      revision: issued.ticket.secret.pointerRevision,
    }
    const secretRuntime: ProductionSecretRuntimeOptions = {
      configuration: {
        platform: vaultConfig('platform'),
        customer: vaultConfig('customer'),
      },
      platform: { pointerStore: fixedPointer(customerPointer), generationProbe: { validate: async () => undefined } },
      customer: { pointerStore: fixedPointer(customerPointer), generationProbe: { validate: async () => undefined } },
      fetch: testVaultFetch('provider-secret-never-return'),
      now: () => NOW,
    }
    const send = vi.fn<RouteTransportFetch>(async () => Response.json({ serviceReference: 'service:real-path' }))
    const boundary = createJitProviderConsequenceBoundary({
      verifyTicket: async (candidate) => candidate === 'ae-signed-ticket' ? issued.ticket : undefined,
      journal: durableJournal,
      secretRuntime,
      send,
      now: () => NOW,
    })
    const first = await boundary.execute({ ticket: 'ae-signed-ticket', invocation: routeInvocation })
    expect(first).toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    expect(send).toHaveBeenCalledOnce()
    expect(JSON.stringify(first)).not.toContain('provider-secret-never-return')

    const replay = await boundary.execute({ ticket: 'ae-signed-ticket', invocation: routeInvocation })
    expect(replay).toEqual(first)
    expect(send).toHaveBeenCalledOnce()
    await expect(readJournal(fixture.backend)).resolves.toMatchObject({ state: 'completed' })
  })

  it('attests only the exact unexpired pending ticket without consuming it', async () => {
    const backend = await backendWithJournal()
    await backend.run(async (ctx) => {
      await ctx.db.insert('secretPointers', {
        secretRef: `sec_${'8'.repeat(32)}`,
        owningAccountRef: `acc_${'9'.repeat(32)}`,
        activeGeneration: `sgn_${'9'.repeat(32)}`,
        revision: 2,
        createdAt: NOW,
        updatedAt: NOW,
        lastAction: {
          operation: 'provision', snapshotRef: 'snapshot:signing', accountRef: `acc_${'9'.repeat(32)}`,
          actorPrincipalRef: `prn_${'9'.repeat(32)}`, grantRef: 'grant:signing', grantGeneration: 1,
          correlationRef: 'correlation:signing', idempotencyRef: 'idempotency:signing', occurredAt: NOW,
        },
      })
    })
    const exact = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      ticketClaimsDigest: CLAIMS_DIGEST,
      expiresAt: NOW + 10_000,
      signingSecretRef: `sec_${'8'.repeat(32)}`,
      signingSecretGeneration: `sgn_${'9'.repeat(32)}`,
      signingSecretPointerRevision: 2,
    }
    await expect(backend.run(async (ctx) => attestProviderConsequenceTicketHandler(ctx, exact)))
      .resolves.toEqual({ kind: 'attested' })
    for (const patch of [
      { ticketRef: 'provider-ticket:missing' },
      { journalTokenDigest: DIGEST('0') },
      { ticketClaimsDigest: DIGEST('0') },
      { expiresAt: NOW + 9_999 },
      { signingSecretRef: `sec_${'0'.repeat(32)}` },
      { signingSecretGeneration: `sgn_${'0'.repeat(32)}` },
      { signingSecretPointerRevision: 3 },
    ]) {
      await expect(backend.run(async (ctx) => attestProviderConsequenceTicketHandler(ctx, {
        ...exact,
        ...patch,
      }))).resolves.toEqual({ kind: 'unavailable' })
    }
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('providerConsequenceJournal')
        .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique()
      if (row === null) throw new Error('journal_fixture_missing')
      await ctx.db.patch(row._id, { state: 'started' })
    })
    await expect(backend.run(async (ctx) => attestProviderConsequenceTicketHandler(ctx, exact)))
      .resolves.toEqual({ kind: 'unavailable' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('providerConsequenceJournal')
        .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique()
      if (row === null) throw new Error('journal_fixture_missing')
      await ctx.db.patch(row._id, { state: 'pending', expiresAt: NOW })
    })
    await expect(backend.run(async (ctx) => attestProviderConsequenceTicketHandler(ctx, {
      ...exact,
      expiresAt: NOW,
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['missing pointer', null],
    ['owning account', { owningAccountRef: `acc_${'0'.repeat(32)}` }],
    ['generation', { activeGeneration: `sgn_${'0'.repeat(32)}` }],
    ['revision', { revision: 3 }],
  ] as const)('rejects stale current signing pointer provenance: %s', async (_label, patch) => {
    const backend = await backendWithJournal()
    if (patch !== null) {
      await backend.run(async (ctx) => {
        await ctx.db.insert('secretPointers', {
          secretRef: `sec_${'8'.repeat(32)}`,
          owningAccountRef: `acc_${'9'.repeat(32)}`,
          activeGeneration: `sgn_${'9'.repeat(32)}`,
          revision: 2,
          createdAt: NOW,
          updatedAt: NOW,
          lastAction: {
            operation: 'provision', snapshotRef: 'snapshot:signing', accountRef: `acc_${'9'.repeat(32)}`,
            actorPrincipalRef: `prn_${'9'.repeat(32)}`, grantRef: 'grant:signing', grantGeneration: 1,
            correlationRef: 'correlation:signing', idempotencyRef: 'idempotency:signing', occurredAt: NOW,
          },
          ...patch,
        })
      })
    }
    await expect(backend.run(async (ctx) => attestProviderConsequenceTicketHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST, ticketClaimsDigest: CLAIMS_DIGEST,
      expiresAt: NOW + 10_000, signingSecretRef: `sec_${'8'.repeat(32)}`,
      signingSecretGeneration: `sgn_${'9'.repeat(32)}`, signingSecretPointerRevision: 2,
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['not admitted', { kind: 'unavailable', reason: 'lease_inactive' }],
    ['owning account drift', { owningAccountRef: `acc_${'0'.repeat(32)}` }],
    ['active account drift', { activeAccountRef: `acc_${'f'.repeat(32)}` }],
    ['connection drift', { connectionRef: `con_${'0'.repeat(32)}` }],
    ['generation drift', { authorityGeneration: 999 }],
    ['secret drift', { secretRef: `sec_${'0'.repeat(32)}` }],
  ] as const)('rejects contradictory atomic effect admission: %s', async (_label, patch) => {
    const { backend, args } = await freshIssueAuthority()
    const admitted = await backend.run(async (ctx) => beginLeaseEffectHandler(ctx, {
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      commandId: args.commandId,
    }))
    if (admitted.kind !== 'admitted') throw new Error('effect_admission_fixture_failed')
    const contradiction = 'kind' in patch && patch.kind === 'unavailable'
      ? patch
      : { ...admitted, ...patch }
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(
      ctx,
      args,
      async () => contradiction as never,
    ))).rejects.toThrow('provider_consequence_effect_admission_failed')
  })

  it('aborts an expired pending command and admits a fresh exact ticket from current authority', async () => {
    const { backend, args } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      await ctx.db.insert('providerConsequenceJournal', journalRow({
        ticketRef: 'provider-ticket:expired',
        commandId: args.commandId,
        state: 'pending',
        expiresAt: NOW,
      }))
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toMatchObject({ kind: 'issued', ticket: { ticketRef: TICKET_REF } })
    const rows = await backend.run(async (ctx) => await ctx.db.query('providerConsequenceJournal').collect())
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.ticketRef === 'provider-ticket:expired')).toMatchObject({
      state: 'aborted',
      abortedAt: NOW,
    })
    expect(rows.find((row) => row.ticketRef === TICKET_REF)).toMatchObject({ state: 'pending' })
  })

  it.each([
    ['customer account', SECRET_REF, { owningAccountRef: `acc_${'0'.repeat(32)}` }],
    ['signing account', `sec_${'8'.repeat(32)}`, { owningAccountRef: 'customer-owner' }],
    ['customer generation', SECRET_REF, { activeGeneration: 'caller-shaped-generation' }],
    ['signing revision', `sec_${'8'.repeat(32)}`, { revision: 0 }],
  ])('denies substituted %s before effect admission', async (_label, secretRef, patch) => {
    const { backend, args, owner } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      const pointer = await ctx.db.query('secretPointers')
        .withIndex('by_secretRef', (query) => query.eq('secretRef', secretRef)).unique()
      if (pointer === null) throw new Error('pointer_fixture_missing')
      await ctx.db.patch(pointer._id, 'owningAccountRef' in patch && patch.owningAccountRef === 'customer-owner'
        ? { owningAccountRef: owner.accountRef }
        : patch)
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'secret_pointer_unavailable' })
    await expect(backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal').collect()))
      .resolves.toHaveLength(0)
  })

  it('fails closed on a conflicting journal identity after exact effect admission', async () => {
    const { backend, args } = await freshIssueAuthority()
    const admission = await backend.run(async (ctx) => beginLeaseEffectHandler(ctx, {
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      commandId: args.commandId,
    }))
    expect(admission).toMatchObject({ kind: 'admitted' })
    if (admission.kind !== 'admitted') throw new Error('effect_admission_fixture_failed')
    await backend.run(async (ctx) => {
      await ctx.db.insert('providerConsequenceJournal', journalRow({
        ticketRef: 'provider-ticket:conflict',
        effectRef: admission.effectRef,
        commandId: 'provider-effect:conflicting-command',
      }))
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_identity_mismatch' })
    const journals = await backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal').collect())
    expect(journals).toHaveLength(1)
    expect(journals[0]).toMatchObject({ ticketRef: 'provider-ticket:conflict' })
  })

  it('rejects every substituted persisted field after exact effect admission', async () => {
    const substitutions: Array<Record<string, unknown>> = [
      { commandId: 'provider-effect:other' }, { requestDigest: DIGEST('a') },
      { invocationDigest: DIGEST('a') }, { operationKeyDigest: DIGEST('a') },
      { invocationRef: 'invocation:other' }, { operationRef: 'operation:other' },
      { attemptRef: 'attempt:other' }, { effectGeneration: 99 }, { leaseRef: 'lease:other' },
      { connectionRef: 'connection:other' },
      { authorityGeneration: 99 }, { providerRef: 'provider:other' },
      { adapterId: 'mcp-jsonrpc:v1' }, { authorityDigest: DIGEST('a') },
      { grantedScopes: ['scope:other'] }, { grantedResources: ['resource:other'] },
      { readinessValidUntil: NOW + 1 }, { readinessDigest: DIGEST('a') },
      { owningAccountRef: `acc_${'0'.repeat(32)}` }, { activeAccountRef: `acc_${'0'.repeat(32)}` },
      { actorPrincipalRef: `prn_${'0'.repeat(32)}` }, { grantRef: 'grant:other' },
      { grantGeneration: 99 }, { secretRef: `sec_${'0'.repeat(32)}` },
      { secretGeneration: `sgn_${'0'.repeat(32)}` }, { secretPointerRevision: 99 },
      { paymentSecretRef: `sec_${'0'.repeat(32)}` },
      { paymentSecretGeneration: `sgn_${'0'.repeat(32)}` },
      { paymentSecretPointerRevision: 99 }, { paymentAccountRef: `acc_${'0'.repeat(32)}` },
      { signingSecretRef: `sec_${'0'.repeat(32)}` },
      { signingSecretGeneration: `sgn_${'0'.repeat(32)}` },
      { signingSecretPointerRevision: 99 }, { signingAccountRef: `acc_${'0'.repeat(32)}` },
    ]
    for (const substitution of substitutions) {
      const { backend, args } = await currentEffectFixture(substitution)
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
        .resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_identity_mismatch' })
    }
  })

  it.each([
    ['pending', {}, 'issued'],
    ['started', { state: 'started', claimRef: CLAIM_REF, startedAt: NOW }, 'started'],
    ['completed', {
      state: 'completed',
      claimRef: CLAIM_REF,
      startedAt: NOW,
      observationJson: JSON.stringify(succeededObservation()),
      completedAt: NOW,
    }, 'completed'],
  ] as const)('replays exact current %s state after an aborted command shadow', async (_label, patch, kind) => {
    const { backend, args } = await currentEffectFixture(patch)
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toMatchObject({ kind })
  })

  it('aborts expired current state and refuses ticket identity reuse', async () => {
    const { backend, args } = await currentEffectFixture({ expiresAt: NOW })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'ticket_identity_conflict' })
    const primary = await backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal')
      .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique())
    expect(primary).toMatchObject({ state: 'aborted', abortedAt: NOW })
  })

  it('refuses a changed current pending token without making it retryable', async () => {
    const { backend, args } = await currentEffectFixture({ journalTokenDigest: DIGEST('a') })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_unavailable' })
  })

  it('refuses an already-aborted current effect and preserves ticket identity', async () => {
    const { backend, args } = await currentEffectFixture({ state: 'aborted', abortedAt: NOW })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'ticket_identity_conflict' })
  })

  it('rejects every non-canonical ticket input before reading live authority', async () => {
    const backend = convexTest(schema, convexModules)
    for (const override of [
      { ticketRef: '' }, { commandId: '' }, { journalTokenDigest: 'raw-token' },
      { requestDigest: 'bad' }, { invocationDigest: 'bad' }, { operationKeyDigest: 'bad' },
      { invocationRef: '' }, { operationRef: '' }, { attemptRef: '' }, { effectGeneration: 0 },
      { leaseRef: '' }, { providerRef: '' }, { adapterId: '' }, { authorityDigest: 'bad' },
      { grantedScopes: [] }, { grantedScopes: [''] }, { grantedResources: [] },
      { grantedResources: [''] }, { readinessValidUntil: 1.5 }, { readinessDigest: 'bad' },
      { signingSecretRef: 'credential:caller' }, { requestedExpiresAt: 1.5 },
    ]) {
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(
        ctx,
        issueArgs(override),
      ))).resolves.toEqual({ kind: 'unavailable', reason: 'ticket_input_invalid' })
    }
  })

  it('requires a distinct platform payment pointer only for x402 before effect admission', async () => {
    const { backend, args } = await freshIssueAuthority('x402-fetch:v2')
    for (const paymentSecretRef of [SECRET_REF, args.signingSecretRef]) {
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, {
        ...args,
        paymentSecretRef,
      }))).resolves.toEqual({ kind: 'unavailable', reason: 'payment_secret_pointer_unavailable' })
    }
    const { paymentSecretRef: _paymentSecretRef, ...missingPaymentPointer } = args
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(
      ctx,
      missingPaymentPointer,
    ))).resolves.toEqual({ kind: 'unavailable', reason: 'ticket_input_invalid' })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, {
      ...args,
      adapterId: 'http-json:v1',
      paymentSecretRef: PAYMENT_SECRET_REF,
    }))).resolves.toEqual({ kind: 'unavailable', reason: 'ticket_input_invalid' })
    await expect(backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal').collect()))
      .resolves.toHaveLength(0)
  })

  it('rejects a non-payment ticket whose payment pointer appears after input validation', async () => {
    const { backend, args } = await freshIssueAuthority('http-json:v1')
    let reads = 0
    Object.defineProperty(args, 'paymentSecretRef', {
      configurable: true,
      enumerable: true,
      get: () => reads++ === 0 ? undefined : PAYMENT_SECRET_REF,
    })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'payment_secret_pointer_unavailable' })
    await expect(backend.run(async (ctx) => ctx.db.query('providerConsequenceJournal').collect()))
      .resolves.toHaveLength(0)
  })

  it('pins admitted payment pointer generation, revision, and platform account across live pointer changes', async () => {
    for (const substitution of [
      { activeGeneration: `sgn_${'0'.repeat(32)}` },
      { revision: 99 },
      { owningAccountRef: `acc_${'0'.repeat(32)}` },
    ]) {
      const { backend, args } = await freshIssueAuthority('x402-fetch:v2')
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
        .resolves.toMatchObject({
          kind: 'issued',
          ticket: {
            paymentSecret: {
              secretRef: PAYMENT_SECRET_REF,
              activeGeneration: `sgn_${'6'.repeat(32)}`,
              pointerRevision: 5,
            },
          },
        })
      await backend.run(async (ctx) => {
        const pointer = await ctx.db.query('secretPointers')
          .withIndex('by_secretRef', (query) => query.eq('secretRef', PAYMENT_SECRET_REF)).unique()
        if (pointer === null) throw new Error('payment_pointer_fixture_missing')
        await ctx.db.patch(pointer._id, substitution)
      })
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
        .resolves.toMatchObject({
          kind: 'issued',
          ticket: {
            paymentSecret: {
              secretRef: PAYMENT_SECRET_REF,
              activeGeneration: `sgn_${'6'.repeat(32)}`,
              pointerRevision: 5,
            },
          },
        })
    }
  })

  it.each([
    ['lease', 'lease_authority_unavailable'],
    ['invocation', 'invocation_authority_unavailable'],
    ['connection', 'connection_authority_unavailable'],
    ['lifetime', 'ticket_lifetime_unavailable'],
  ] as const)('fails closed when current %s authority changes before issue', async (kind, reason) => {
    const { backend, args } = await freshIssueAuthority()
    if (kind === 'lease') {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
        if (row === null) throw new Error('lease_fixture_missing')
        await ctx.db.patch(row._id, { state: 'invalidated' })
      })
    } else if (kind === 'invocation') {
      await backend.run(async (ctx) => {
        const row = await ctx.db.query('capabilityOperationInvocations')
          .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
        if (row === null) throw new Error('invocation_fixture_missing')
        await ctx.db.patch(row._id, { principalId: `prn_${'0'.repeat(32)}` })
      })
    } else if (kind === 'connection') {
      await backend.run(async (ctx) => {
        const lease = await ctx.db.query('capabilityProviderConnectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
        if (lease === null) throw new Error('lease_fixture_missing')
        const row = await ctx.db.query('capabilityProviderConnections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', lease.connectionRef)).unique()
        if (row === null) throw new Error('connection_fixture_missing')
        await ctx.db.patch(row._id, { lifecycle: 'revoked' })
      })
    } else {
      args.requestedExpiresAt = NOW + 100
    }
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason })
  })

  it('rejects an expired provider connection before effect admission', async () => {
    const { backend, args } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      const lease = await ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
      if (lease === null) throw new Error('lease_fixture_missing')
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', lease.connectionRef)).unique()
      if (row === null) throw new Error('connection_fixture_missing')
      await ctx.db.patch(row._id, { expiresAt: NOW })
    })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable', reason: 'connection_authority_unavailable' })
  })

  it('claims once and makes every exact replay ambiguity-safe', async () => {
    const backend = await backendWithJournal()

    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toEqual({ kind: 'claimed', claimRef: CLAIM_REF })
    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toEqual({ kind: 'started' })
    await expect(readJournal(backend)).resolves.toMatchObject({
      state: 'started',
      claimRef: CLAIM_REF,
      startedAt: NOW,
    })
  })

  it('returns unavailable for missing or malformed completed journal rows', async () => {
    const missing = convexTest(schema, convexModules)
    await expect(missing.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toEqual({ kind: 'unavailable' })
    for (const observationJson of [undefined, '{']) {
      const backend = await backendWithJournal({
        state: 'completed',
        ...(observationJson === undefined ? {} : { observationJson }),
      })
      await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
        .resolves.toEqual({ kind: 'unavailable' })
    }
  })

  it('replays an exact pending issue without revalidating or replacing the one-time token', async () => {
    const backend = await backendWithJournal()

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs())))
      .resolves.toMatchObject({
        kind: 'issued',
        ticket: {
          ticketRef: TICKET_REF,
          effectRef: EFFECT_REF,
          invocationRef: 'invocation:test',
          owningAccountRef: `acc_${'1'.repeat(32)}`,
          activeAccountRef: `acc_${'1'.repeat(32)}`,
          secret: { secretRef: SECRET_REF, activeGeneration: `sgn_${'3'.repeat(32)}` },
        },
        ticketClaimsDigest: CLAIMS_DIGEST,
        signingSecret: { secretRef: `sec_${'8'.repeat(32)}` },
      })
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs({
      journalTokenDigest: DIGEST('a'),
    })))).resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_unavailable' })
  })

  it('preserves an intentionally absent optional readiness digest through issue and replay', async () => {
    const { backend, args } = await freshIssueAuthority()
    await backend.run(async (ctx) => {
      const lease = await ctx.db.query('capabilityProviderConnectionLeases')
        .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique()
      if (lease === null) throw new Error('lease_fixture_missing')
      await ctx.db.patch(lease._id, { readinessDigest: undefined })
    })
    const { readinessDigest: _readinessDigest, ...absentArgs } = args
    const issued = await backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, absentArgs))
    expect(issued).toMatchObject({ kind: 'issued' })
    if (issued.kind !== 'issued') throw new Error('ticket_fixture_missing')
    expect(issued.ticket).not.toHaveProperty('readinessDigest')
    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, absentArgs)))
      .resolves.toEqual(issued)
  })

  it.each(['started', 'completed'] as const)(
    'replays %s after live authority rows disappear while denying stable-identity substitution',
    async (state) => {
      const observation = succeededObservation()
      const backend = await backendWithJournal({
        state,
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        ...(state === 'completed'
          ? { observationJson: JSON.stringify(observation), completedAt: NOW - 50 }
          : {}),
      })
      await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs())))
        .resolves.toMatchObject(state === 'started'
          ? { kind: 'started', ticketRef: TICKET_REF }
          : { kind: 'completed', ticketRef: TICKET_REF })
      for (const hostile of [
        { requestDigest: DIGEST('a') },
        { invocationDigest: DIGEST('b') },
        { operationKeyDigest: DIGEST('c') },
        { invocationRef: 'invocation:other' },
        { attemptRef: 'attempt:other' },
        { leaseRef: 'lease:other' },
        { providerRef: 'provider:other' },
        { signingSecretRef: `sec_${'0'.repeat(32)}` },
      ]) {
        await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(
          ctx,
          issueArgs(hostile),
        ))).resolves.toEqual({ kind: 'unavailable', reason: 'effect_journal_identity_mismatch' })
      }
    },
  )

  it('terminally aborts an expired pending issue before any fresh authority decision', async () => {
    const backend = await backendWithJournal({ expiresAt: NOW })

    await expect(backend.run(async (ctx) => issueProviderConsequenceTicketHandler(ctx, issueArgs())))
      .resolves.toEqual({ kind: 'unavailable', reason: 'lease_authority_unavailable' })
    await expect(readJournal(backend)).resolves.toMatchObject({
      state: 'aborted',
      abortedAt: NOW,
    })
  })

  it.each([
    ['token', { journalTokenDigest: DIGEST('a') }],
    ['effect', { effectRef: 'connection-effect:other' }],
    ['request', { requestDigest: DIGEST('b') }],
    ['invocation', { invocationDigest: DIGEST('c') }],
    ['claims', { ticketClaimsDigest: DIGEST('d') }],
    ['expiry', { expiresAt: NOW + 10_001 }],
  ])('denies substituted %s identity without consuming the ticket', async (_label, override) => {
    const backend = await backendWithJournal()

    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs(override))))
      .resolves.toEqual({ kind: 'unavailable' })
    await expect(readJournal(backend)).resolves.toMatchObject({ state: 'pending' })
  })

  it('terminally aborts an expired unclaimed ticket and never lets it restart', async () => {
    const backend = await backendWithJournal({ expiresAt: NOW })

    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, {
      ...claimArgs(),
      expiresAt: NOW,
    }))).resolves.toEqual({ kind: 'unavailable' })
    await expect(readJournal(backend)).resolves.toMatchObject({ state: 'aborted', abortedAt: NOW })
    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, {
      ...claimArgs(),
      expiresAt: NOW,
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each(['started', 'completed'] as const)(
    'denies %s replay when the token or full ticket claims do not match',
    async (state) => {
      const observation = succeededObservation()
      const backend = await backendWithJournal({
        state,
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        ...(state === 'completed'
          ? {
              observationJson: JSON.stringify(observation),
              observationDigest: canonicalDigest(observation),
              completedAt: NOW - 50,
            }
          : {}),
      })
      for (const override of [
        { journalTokenDigest: DIGEST('a') },
        { ticketClaimsDigest: DIGEST('b') },
        { invocationDigest: DIGEST('c') },
        { requestDigest: DIGEST('d') },
      ]) {
        await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(
          ctx,
          claimArgs(override),
        ))).resolves.toEqual({ kind: 'unavailable' })
      }
    },
  )

  it('completes only the claimed request, replays the exact observation, and rejects conflicts', async () => {
    const backend = await backendWithJournal()
    await backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs()))
    const observation = succeededObservation()
    const completeArgs = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
      observationJson: JSON.stringify(observation),
    }

    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, completeArgs)))
      .resolves.toEqual({ kind: 'completed' })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, completeArgs)))
      .resolves.toEqual({ kind: 'completed' })
    await expect(backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs())))
      .resolves.toMatchObject({ kind: 'completed', observation })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
      ...completeArgs,
      observationJson: JSON.stringify({ ...observation, outputJson: '{"serviceReference":"other"}' }),
    }))).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('executes the registered completion HTTP action and the same journal handler exactly once', async () => {
    const journalTokenDigest = `sha256:${createHash('sha256').update(HTTP_JOURNAL_TOKEN).digest('hex')}`
    const backend = await backendWithJournal({
      state: 'started',
      claimRef: CLAIM_REF,
      startedAt: NOW - 100,
      journalTokenDigest,
    })
    type CompleteProviderConsequenceArgs = FunctionArgs<
      typeof internal.capabilityProviderConsequenceJournal.completeProviderConsequence
    >
    const runMutation = async (
      reference: FunctionReference<'mutation'>,
      args: CompleteProviderConsequenceArgs,
    ) => {
      expect(getFunctionName(reference)).toBe(
        getFunctionName(internal.capabilityProviderConsequenceJournal.completeProviderConsequence),
      )
      return await backend.mutation(
        internal.capabilityProviderConsequenceJournal.completeProviderConsequence,
        args,
      )
    }
    const ctx = { runMutation } as unknown as ActionCtx
    const observation = succeededObservation()
    const request = () => new Request('https://deployment.convex.site/internal/provider-consequence/journal/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HTTP_JOURNAL_TOKEN}`,
      },
      body: JSON.stringify({
        ticketRef: TICKET_REF,
        claimRef: CLAIM_REF,
        observation,
      }),
    })

    await expect(completeProviderConsequenceRuntime(ctx, request()))
      .resolves.toMatchObject({ status: 200 })
    const first = await readJournal(backend)
    expect(first).toMatchObject({
      state: 'completed',
      observationDigest: canonicalDigest(observation),
    })

    await expect(completeProviderConsequenceRuntime(ctx, request()))
      .resolves.toMatchObject({ status: 200 })
    await expect(readJournal(backend)).resolves.toEqual(first)

    const conflict = new Request('https://deployment.convex.site/internal/provider-consequence/journal/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${HTTP_JOURNAL_TOKEN}`,
      },
      body: JSON.stringify({
        ticketRef: TICKET_REF,
        claimRef: CLAIM_REF,
        observation: succeededObservation(DIGEST('f')),
      }),
    })
    await expect(completeProviderConsequenceRuntime(ctx, conflict))
      .resolves.toMatchObject({ status: 409 })
    await expect(readJournal(backend)).resolves.toEqual(first)
  })

  it('rejects completion when the journal or exact claim identity is missing', async () => {
    const missing = convexTest(schema, convexModules)
    const args = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
      observationJson: JSON.stringify(succeededObservation()),
    }
    await expect(missing.run(async (ctx) => completeProviderConsequenceHandler(ctx, args)))
      .resolves.toEqual({ kind: 'unavailable' })
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
      ...args, claimRef: 'provider-claim:other',
    }))).resolves.toEqual({ kind: 'unavailable' })
    for (const observationJson of ['{', JSON.stringify(succeededObservation(DIGEST('f')))]) {
      await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
        ...args,
        observationJson,
      }))).resolves.toEqual({ kind: 'unavailable' })
    }
  })

  it('aborts only before release and makes the abort exact-replay idempotent', async () => {
    const backend = await backendWithJournal()
    await backend.run(async (ctx) => claimProviderConsequenceHandler(ctx, claimArgs()))

    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: DIGEST('a'),
      claimRef: CLAIM_REF,
    }))).resolves.toEqual({ kind: 'unavailable' })
    const exact = {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      claimRef: CLAIM_REF,
    }
    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, exact)))
      .resolves.toEqual({ kind: 'aborted' })
    await expect(backend.run(async (ctx) => abortProviderConsequenceHandler(ctx, exact)))
      .resolves.toEqual({ kind: 'aborted' })
    await expect(backend.run(async (ctx) => completeProviderConsequenceHandler(ctx, {
      ...exact,
      observationJson: JSON.stringify(succeededObservation()),
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('authorizes provider-direct x402 only from the started journal and exact invocation identity', async () => {
    const backend = await backendWithJournal({
      state: 'started',
      claimRef: CLAIM_REF,
      startedAt: NOW,
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityOperationInvocations', {
        invocationRef: 'invocation:test',
        principalId: `prn_${'2'.repeat(32)}`,
        ownerId: 'owner:test',
        credentialId: 'credential:test',
        applicationRef: 'application:test',
        operationRef: 'operation:test',
        idempotencyKey: 'idempotency:test',
        environment: 'sandbox',
        grantRef: 'grant:test',
        grantGeneration: 3,
        policyDigest: DIGEST('8'),
        grantExpiresAt: NOW + 20_000,
        inputDigest: DIGEST('9'),
        requestDigest: REQUEST_DIGEST,
        state: 'pending',
        attemptRef: 'attempt:test',
        updatedAt: NOW,
        createdAt: NOW,
      })
    })
    const exactArgs = {
      paymentIdentifier: OPERATION_KEY_DIGEST,
      operationKeyDigest: OPERATION_KEY_DIGEST,
      invocationRef: 'invocation:test',
      operationRef: 'operation:test',
      attemptRef: 'attempt:test',
      effectGeneration: 1,
      providerRef: 'provider:test',
      credentialRef: PAYMENT_SECRET_REF,
    }

    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      operation: 'reserve_external_spend',
      args: exactArgs,
    }))).resolves.toMatchObject({
      kind: 'authorized',
      principalId: `prn_${'2'.repeat(32)}`,
      credentialRef: PAYMENT_SECRET_REF,
      environment: 'sandbox',
    })
    for (const hostile of [
      { paymentIdentifier: DIGEST('a') },
      { invocationRef: 'invocation:other' },
      { operationRef: 'operation:other' },
      { attemptRef: 'attempt:other' },
      { effectGeneration: 2 },
      { providerRef: 'provider:other' },
      { credentialRef: `sec_${'0'.repeat(32)}` },
    ]) {
      await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
        ticketRef: TICKET_REF,
        journalTokenDigest: TOKEN_DIGEST,
        operation: 'reserve_external_spend',
        args: { ...exactArgs, ...hostile },
      }))).resolves.toEqual({ kind: 'unavailable' })
    }
    const persisted = await readJournal(backend)
    expect(JSON.stringify(persisted)).not.toContain(JOURNAL_TOKEN)
    expect(persisted).toMatchObject({
      secretRef: SECRET_REF,
      paymentSecretRef: PAYMENT_SECRET_REF,
      journalTokenDigest: TOKEN_DIGEST,
    })
  })

  it('fails closed for malformed, expired, unstored, and unbound x402 callback identity', async () => {
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    for (const args of [null, [], 'caller-proof']) {
      await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
        ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
        operation: 'reserve_external_spend', args,
      }))).resolves.toEqual({ kind: 'unavailable' })
    }
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
      operation: 'read_authorization', args: {},
    }))).resolves.toEqual({ kind: 'unavailable' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('providerConsequenceJournal')
        .withIndex('by_ticketRef', (query) => query.eq('ticketRef', TICKET_REF)).unique()
      if (row === null) throw new Error('journal_fixture_missing')
      await ctx.db.patch(row._id, { expiresAt: NOW })
    })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
      operation: 'reserve_external_spend', args: {},
    }))).resolves.toEqual({ kind: 'unavailable' })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST,
      operation: 'observe_attempt', args: { custodyRef: 'missing', authorizationDigest: DIGEST('a') },
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['authorization digest', { authorizationDigest: DIGEST('0') }],
    ['dispatch', { dispatchRef: 'invocation:other' }],
    ['attempt', { attemptRef: 'attempt:other' }],
    ['effect generation', { effectGeneration: 2 }],
    ['operation', { operationRef: 'operation:other' }],
    ['credential', { credentialRef: `sec_${'0'.repeat(32)}` }],
  ] as const)('rejects stored x402 attempt %s drift', async (_label, patch) => {
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyX402PaymentAttempts', {
        dispatchRef: 'invocation:test',
        attemptRef: 'attempt:test',
        effectGeneration: 1,
        operationRef: 'operation:test',
        paymentIdentifier: OPERATION_KEY_DIGEST,
        operationKeyDigest: OPERATION_KEY_DIGEST,
        challengeDigest: DIGEST('a'),
        challengeJson: '{}',
        selectedRequirementJson: '{}',
        providerEndpoint: 'https://provider.example/pay',
        credentialRef: SECRET_REF,
        scheme: 'exact',
        network: 'eip155:8453',
        asset: 'asset:test',
        payTo: 'payee:test',
        amountUnits: '1',
        currency: 'USD',
        exponent: 2,
        custodyRef: 'custody:test',
        authorizationDigest: DIGEST('b'),
        state: 'prepared',
        preparedAt: NOW,
        evidenceRefs: [],
        ...patch,
      })
    })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      operation: 'read_authorization',
      args: { custodyRef: 'custody:test', authorizationDigest: DIGEST('b') },
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('accepts an exact stored x402 attempt before requiring the canonical invocation row', async () => {
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyX402PaymentAttempts', {
        dispatchRef: 'invocation:test', attemptRef: 'attempt:test', effectGeneration: 1,
        operationRef: 'operation:test', paymentIdentifier: OPERATION_KEY_DIGEST,
        operationKeyDigest: OPERATION_KEY_DIGEST, challengeDigest: DIGEST('a'),
        challengeJson: '{}', selectedRequirementJson: '{}', providerEndpoint: 'https://provider.example/pay',
        credentialRef: SECRET_REF, scheme: 'exact', network: 'eip155:8453', asset: 'asset:test',
        payTo: 'payee:test', amountUnits: '1', currency: 'USD', exponent: 2,
        custodyRef: 'custody:test', authorizationDigest: DIGEST('b'), state: 'prepared',
        preparedAt: NOW, evidenceRefs: [],
      })
    })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF, journalTokenDigest: TOKEN_DIGEST, operation: 'read_authorization',
      args: { custodyRef: 'custody:test', authorizationDigest: DIGEST('b') },
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('denies x402 when its exact journal has no bound invocation row', async () => {
    const backend = await backendWithJournal({ state: 'started', claimRef: CLAIM_REF, startedAt: NOW })
    await expect(backend.run(async (ctx) => authorizeProviderConsequenceX402RpcHandler(ctx, {
      ticketRef: TICKET_REF,
      journalTokenDigest: TOKEN_DIGEST,
      operation: 'reserve_external_spend',
      args: { dispatchRef: 'invocation:test' },
    }))).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered provider begin route and claimProviderConsequence sink',
    async (caseKind) => {
      const backend = await backendWithJournal({ journalTokenDigest: HTTP_JOURNAL_TOKEN_DIGEST })
      const callTrace: string[] = []
      const path = '/internal/provider-consequence/journal/begin'
      const response = await beginProviderConsequenceRuntime(
        providerActionContext(backend, callTrace),
        providerRequest(path, {
          ticketRef: TICKET_REF,
          effectRef: caseKind === 'wrong_account' ? 'connection-effect:other-account' : EFFECT_REF,
          requestDigest: REQUEST_DIGEST,
          invocationDigest: INVOCATION_DIGEST,
          ticketClaimsDigest: CLAIMS_DIGEST,
          expiresAt: caseKind === 'stale_generation' ? NOW + 9_999 : NOW + 10_000,
        }, providerToken(caseKind)),
      )
      const row = await readJournal(backend)

      expect(registeredProviderPost(path)).toBe(beginProviderConsequenceRuntime)
      expect(response.status).toBe(caseKind === 'missing_workload' ? 401 : 200)
      await expect(response.json()).resolves.toEqual(caseKind === 'workload'
        ? { kind: 'claimed', claimRef: CLAIM_REF }
        : { kind: 'unavailable' })
      expect(callTrace).toEqual(caseKind === 'missing_workload'
        ? []
        : ['capabilityProviderConsequenceJournal:claimProviderConsequence'])
      expect(row).toMatchObject(caseKind === 'workload'
        ? { state: 'started', claimRef: CLAIM_REF }
        : { state: 'pending' })
      expect(await backend.run(async (ctx) => await ctx.db.query('moneyTransactions').take(1))).toEqual([])
    },
  )

  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered provider attest route and attestProviderConsequenceTicket sink',
    async (caseKind) => {
      const backend = await backendWithJournal({ journalTokenDigest: HTTP_JOURNAL_TOKEN_DIGEST })
      await backend.run(async (ctx) => {
        await ctx.db.insert('secretPointers', {
          secretRef: `sec_${'8'.repeat(32)}`,
          owningAccountRef: caseKind === 'wrong_account' ? `acc_${'0'.repeat(32)}` : `acc_${'9'.repeat(32)}`,
          activeGeneration: `sgn_${'9'.repeat(32)}`,
          revision: 2,
          createdAt: NOW,
          updatedAt: NOW,
          lastAction: {
            operation: 'provision',
            snapshotRef: 'snapshot:signing',
            accountRef: `acc_${'9'.repeat(32)}`,
            actorPrincipalRef: `prn_${'9'.repeat(32)}`,
            grantRef: 'grant:signing',
            grantGeneration: 1,
            correlationRef: 'correlation:signing',
            idempotencyRef: 'idempotency:signing',
            occurredAt: NOW,
          },
        })
      })
      const callTrace: string[] = []
      const path = '/internal/provider-consequence/journal/attest'
      const response = await attestProviderConsequenceRuntime(
        providerActionContext(backend, callTrace),
        providerRequest(path, {
          ticketRef: TICKET_REF,
          ticketClaimsDigest: CLAIMS_DIGEST,
          expiresAt: NOW + 10_000,
          signingSecretRef: `sec_${'8'.repeat(32)}`,
          signingSecretGeneration: caseKind === 'stale_generation'
            ? `sgn_${'0'.repeat(32)}`
            : `sgn_${'9'.repeat(32)}`,
          signingSecretPointerRevision: 2,
        }, providerToken(caseKind)),
      )

      expect(registeredProviderPost(path)).toBe(attestProviderConsequenceRuntime)
      expect(response.status).toBe(caseKind === 'workload' ? 200 : caseKind === 'missing_workload' ? 401 : 409)
      await expect(response.json()).resolves.toEqual(caseKind === 'workload'
        ? { kind: 'attested' }
        : { kind: 'unavailable' })
      expect(callTrace).toEqual(caseKind === 'missing_workload'
        ? []
        : ['capabilityProviderConsequenceJournal:attestProviderConsequenceTicket'])
      expect(await readJournal(backend)).toMatchObject({ state: 'pending' })
      expect(await backend.run(async (ctx) => await ctx.db.query('moneyTransactions').take(1))).toEqual([])
    },
  )

  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered provider abort route and abortProviderConsequence sink',
    async (caseKind) => {
      const backend = await backendWithJournal({
        state: 'started',
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        journalTokenDigest: HTTP_JOURNAL_TOKEN_DIGEST,
      })
      const callTrace: string[] = []
      const path = '/internal/provider-consequence/journal/abort'
      const response = await abortProviderConsequenceRuntime(
        providerActionContext(backend, callTrace),
        providerRequest(path, {
          ticketRef: TICKET_REF,
          claimRef: caseKind === 'wrong_account' || caseKind === 'stale_generation'
            ? 'provider-claim:other-authority'
            : CLAIM_REF,
        }, providerToken(caseKind)),
      )
      const row = await readJournal(backend)

      expect(registeredProviderPost(path)).toBe(abortProviderConsequenceRuntime)
      expect(response.status).toBe(caseKind === 'workload' ? 200 : caseKind === 'missing_workload' ? 401 : 409)
      await expect(response.json()).resolves.toEqual(caseKind === 'workload'
        ? { kind: 'aborted' }
        : { kind: 'unavailable' })
      expect(callTrace).toEqual(caseKind === 'missing_workload'
        ? []
        : ['capabilityProviderConsequenceJournal:abortProviderConsequence'])
      expect(row).toMatchObject({ state: caseKind === 'workload' ? 'aborted' : 'started' })
      expect(await backend.run(async (ctx) => await ctx.db.query('moneyTransactions').take(1))).toEqual([])
    },
  )

  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered provider complete route and completeProviderConsequence sink',
    async (caseKind) => {
      const backend = await backendWithJournal({
        state: 'started',
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        journalTokenDigest: HTTP_JOURNAL_TOKEN_DIGEST,
      })
      const callTrace: string[] = []
      const path = '/internal/provider-consequence/journal/complete'
      const response = await completeProviderConsequenceRuntime(
        providerActionContext(backend, callTrace),
        providerRequest(path, {
          ticketRef: TICKET_REF,
          claimRef: caseKind === 'wrong_account' ? 'provider-claim:other-account' : CLAIM_REF,
          observation: succeededObservation(caseKind === 'stale_generation' ? DIGEST('f') : REQUEST_DIGEST),
        }, providerToken(caseKind)),
      )
      const row = await readJournal(backend)

      expect(registeredProviderPost(path)).toBe(completeProviderConsequenceRuntime)
      expect(response.status).toBe(caseKind === 'workload' ? 200 : caseKind === 'missing_workload' ? 401 : 409)
      await expect(response.json()).resolves.toEqual(caseKind === 'workload'
        ? { kind: 'completed' }
        : { kind: 'unavailable' })
      expect(callTrace).toEqual(caseKind === 'missing_workload'
        ? []
        : ['capabilityProviderConsequenceJournal:completeProviderConsequence'])
      expect(row).toMatchObject({ state: caseKind === 'workload' ? 'completed' : 'started' })
      expect(await backend.run(async (ctx) => await ctx.db.query('moneyTransactions').take(1))).toEqual([])
    },
  )

  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through the registered provider x402 route and authorizeProviderConsequenceX402Rpc sink',
    async (caseKind) => {
      const backend = await backendWithJournal({
        state: 'started',
        claimRef: CLAIM_REF,
        startedAt: NOW - 100,
        journalTokenDigest: HTTP_JOURNAL_TOKEN_DIGEST,
      })
      await seedProviderX402RuntimeRows(backend, caseKind)
      const callTrace: string[] = []
      const path = '/internal/provider-consequence/x402'
      const response = await providerConsequenceX402Runtime(
        providerActionContext(backend, callTrace),
        providerRequest(path, {
          ticketRef: TICKET_REF,
          operation: 'read_authorization',
          args: {
            custodyRef: 'custody:test',
            authorizationDigest: DIGEST('b'),
          },
        }, providerToken(caseKind)),
      )
      const body = await response.json() as { kind?: string; value?: { custodyRef?: string } }

      expect(registeredProviderPost(path)).toBe(providerConsequenceX402Runtime)
      expect(response.status).toBe(caseKind === 'workload' ? 200 : caseKind === 'missing_workload' ? 401 : 409)
      expect(body).toMatchObject(caseKind === 'workload'
        ? { kind: 'result', value: { custodyRef: 'custody:test' } }
        : { kind: 'unavailable' })
      expect(callTrace).toEqual(caseKind === 'missing_workload'
        ? []
        : caseKind === 'workload'
          ? [
              'capabilityProviderConsequenceJournal:authorizeProviderConsequenceX402Rpc',
              'moneyX402PaymentAttempts:readX402PaymentAuthorization',
            ]
          : ['capabilityProviderConsequenceJournal:authorizeProviderConsequenceX402Rpc'])
      expect(await readJournal(backend)).toMatchObject({ state: 'started' })
      expect(await backend.run(async (ctx) => await ctx.db.query('moneyTransactions').take(1))).toEqual([])
      expect(await backend.run(async (ctx) => await ctx.db.query('moneyX402PaymentAttempts').take(2)))
        .toHaveLength(1)
    },
  )
})

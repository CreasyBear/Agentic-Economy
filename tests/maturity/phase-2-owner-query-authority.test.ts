import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { accountRefForOwner, accountRefForProvider } from '@/modules/money/public'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  capabilityPublicationInput,
  installCanonicalProviderConnectionFixture,
  preparedPublicationArgs,
  providerAuthority,
  seedCatalogOffering,
} from '../integration/capability-publication-harness'
import { withSourceWrite } from '../helpers/source-write-admission'

const EXPECTED_QUERY_CALLERS = [
  'agentAccessPolicy:listOwnerGrantReadbacks',
  'capabilityOperationInvocations:listPendingOperationApprovals',
  'capabilityProviderConnections:listOwner',
  'capabilityProviderConnections:readOwner',
  'capabilitySupply:inspectBindingControlState',
  'capabilitySupply:queryCapabilityGraph',
  'capabilitySupply:readCapabilityPublication',
  'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel',
  'catalog:getCurrentOwnerOfferingSupply',
  'catalog:getCurrentOwnerPublicCatalog',
  'chatMessages:listMessages',
  'chatShares:getShareState',
  'chatThreads:getThread',
  'chatThreads:listThreads',
  'chatThreads:searchThreads',
  'moneyLedger:listCreditActivity',
  'moneyLedger:readCreditAccount',
  'moneyLedger:readCreditTopupCommand',
  'moneyLedger:readKeyUsage',
  'moneyLedger:readOwnerPayoutAccount',
  'moneyLedger:readOwnerPayoutTransfer',
  'moneyLedger:readOwnerProviderEarnings',
  'qualifiedUse:readOwnerQualifiedUse',
  'security:readAdminAuditEvents',
  'security:readAdminIndexHealth',
] as const

const CURRENCY = 'USD'
const EXPIRY_NOW = 10_000

type OwnerClient = Awaited<ReturnType<typeof publishedBusinessOwner>>['owner']

type QueryFixture = Readonly<{
  backend: ConvexFixtureBackend
  businessId: Id<'businesses'>
  businessRef: string
  bindingId: string
  connectionRef: string
  publicationRef: string
  agentPrincipalRef: string
  agentCredentialRef: string
  topupCommandRef: string
  topupIdempotencyKey: string
  owner: OwnerClient
  otherBusinessId: Id<'businesses'>
  otherOwner: OwnerClient
  credential: Readonly<{
    bindingRef: string
    credentialRef: string
    generation: number
    expiresAt: number
    scheduleNonce: string
  }>
}>

type QueryClient = Pick<OwnerClient, 'query'>

function ownerQueries(input: Readonly<{
  businessId: Id<'businesses'>
  businessRef: string
  bindingId: string
  connectionRef: string
  publicationRef: string
  agentPrincipalRef: string
  agentCredentialRef: string
  topupCommandRef: string
  topupIdempotencyKey: string
}>) {
  return [
    {
      ref: 'capabilityOperationInvocations:listPendingOperationApprovals',
      run: (client: QueryClient) =>
        client.query(
          api.capabilityOperationInvocations.listPendingOperationApprovals,
          {},
        ),
    },
    {
      ref: 'agentAccessPolicy:listOwnerGrantReadbacks',
      run: (client: QueryClient) =>
        client.query(api.agentAccessPolicy.listOwnerGrantReadbacks, {}),
    },
    {
      ref: 'capabilitySupply:readCapabilityPublication',
      run: (client: QueryClient) =>
        client.query(api.capabilitySupply.readCapabilityPublication, {
          publicationRef: input.publicationRef,
        }),
    },
    {
      ref: 'capabilitySupply:queryCapabilityGraph',
      run: (client: QueryClient) =>
        client.query(api.capabilitySupply.queryCapabilityGraph, {
          networkId: 'ae:public',
          includeInactive: true,
          limit: 10,
        }),
    },
    {
      ref: 'capabilitySupply:inspectBindingControlState',
      run: (client: QueryClient) =>
        client.query(api.capabilitySupply.inspectBindingControlState, {
          bindingId: input.bindingId,
        }),
    },
    {
      ref: 'catalog:getCurrentOwnerPublicCatalog',
      run: (client: QueryClient) =>
        client.query(api.catalog.getCurrentOwnerPublicCatalog, {}),
    },
    {
      ref: 'moneyLedger:readCreditAccount',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readCreditAccount, {
          principalId: input.agentPrincipalRef,
          currency: CURRENCY,
        }),
    },
    {
      ref: 'moneyLedger:listCreditActivity',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.listCreditActivity, {
          principalId: input.agentPrincipalRef,
          credentialId: input.agentCredentialRef,
          currency: CURRENCY,
          paginationOpts: { numItems: 10, cursor: null },
        }),
    },
    {
      ref: 'moneyLedger:readKeyUsage',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readKeyUsage, {
          principalId: input.agentPrincipalRef,
          credentialId: input.agentCredentialRef,
          currency: CURRENCY,
        }),
    },
    {
      ref: 'moneyLedger:readCreditTopupCommand',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readCreditTopupCommand, {
          commandRef: input.topupCommandRef,
          idempotencyKey: input.topupIdempotencyKey,
        }),
    },
    {
      ref: 'catalog:getCurrentOwnerOfferingSupply',
      run: (client: QueryClient) =>
        client.query(api.catalog.getCurrentOwnerOfferingSupply, {}),
    },
    {
      ref: 'capabilityProviderConnections:readOwner',
      run: (client: QueryClient) =>
        client.query(api.capabilityProviderConnections.readOwner, {
          connectionRef: input.connectionRef,
        }),
    },
    {
      ref: 'capabilityProviderConnections:listOwner',
      run: (client: QueryClient) =>
        client.query(api.capabilityProviderConnections.listOwner, {}),
    },
    {
      ref: 'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel',
      run: (client: QueryClient) =>
        client.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
          businessId: input.businessId,
        }),
    },
    {
      ref: 'moneyLedger:readOwnerPayoutAccount',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readOwnerPayoutAccount, {
          businessId: input.businessRef,
          currency: CURRENCY,
        }),
    },
    {
      ref: 'moneyLedger:readOwnerPayoutTransfer',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readOwnerPayoutTransfer, {
          businessId: input.businessRef,
          currency: CURRENCY,
          payoutRef: 'payout:owner-query-authority',
          idempotencyKey: 'idempotency:owner-query-authority',
        }),
    },
    {
      ref: 'moneyLedger:readOwnerProviderEarnings',
      run: (client: QueryClient) =>
        client.query(api.moneyLedger.readOwnerProviderEarnings, {}),
    },
    {
      ref: 'qualifiedUse:readOwnerQualifiedUse',
      run: (client: QueryClient) =>
        client.query(api.qualifiedUse.readOwnerQualifiedUse, { limit: 10 }),
    },
    {
      ref: 'security:readAdminAuditEvents',
      run: (client: QueryClient) =>
        client.query(api.security.readAdminAuditEvents, {}),
    },
    {
      ref: 'security:readAdminIndexHealth',
      run: (client: QueryClient) =>
        client.query(api.security.readAdminIndexHealth, {}),
    },
  ] as const
}

describe('Phase 2 public owner-query authority', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mechanically inventories all twenty-five public query callers of resolveBusinessActor', () => {
    expect(discoverPublicBusinessActorQueryCallers()).toEqual(
      EXPECTED_QUERY_CALLERS,
    )
  })

  it('preserves current account-scoped reads through every non-chat query caller', async () => {
    const fixture = await currentQueryFixture('current')
    const queries = ownerQueries(fixture)
    const results = Object.fromEntries(
      await Promise.all(
        queries.map(async ({ ref, run }) => [ref, await run(fixture.owner)]),
      ),
    )

    expect(results).toMatchObject({
      'agentAccessPolicy:listOwnerGrantReadbacks': [
        { credentialId: fixture.agentCredentialRef },
      ],
      'capabilityOperationInvocations:listPendingOperationApprovals': [
        {
          invocationRef: 'operation-invocation:v1:owner-query:current',
          operationRef: 'operation:v1:owner-query:current',
        },
      ],
      'catalog:getCurrentOwnerPublicCatalog': { kind: 'available' },
      'catalog:getCurrentOwnerOfferingSupply': { kind: 'available' },
      'capabilityProviderConnections:readOwner': {
        connectionRef: fixture.connectionRef,
      },
      'capabilitySupply:readCapabilityPublication': {
        publicationRef: fixture.publicationRef,
        bindingId: fixture.bindingId,
      },
      'capabilitySupply:queryCapabilityGraph': {
        kind: 'available',
      },
      'capabilitySupply:inspectBindingControlState': {
        kind: 'available',
        bindingId: fixture.bindingId,
      },
      'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel': {
        kind: 'available',
        businessId: fixture.businessRef,
      },
      'moneyLedger:readOwnerPayoutAccount': {
        businessId: fixture.businessRef,
        currency: CURRENCY,
        state: 'ready',
      },
      'moneyLedger:readOwnerPayoutTransfer': {
        kind: 'refused',
        code: 'payout_not_ready',
      },
      'moneyLedger:readOwnerProviderEarnings': {
        kind: 'available',
        businessId: fixture.businessRef,
      },
      'qualifiedUse:readOwnerQualifiedUse': {
        kind: 'found',
        businessId: fixture.businessRef,
      },
      'moneyLedger:readCreditAccount': {
        kind: 'ok',
        principalId: fixture.agentPrincipalRef,
      },
      'moneyLedger:listCreditActivity': {
        kind: 'ok',
      },
      'moneyLedger:readKeyUsage': {
        kind: 'ok',
        credentialId: fixture.agentCredentialRef,
      },
      'moneyLedger:readCreditTopupCommand': {
        kind: 'accepted',
        command: {
          commandRef: fixture.topupCommandRef,
          principalId: fixture.agentPrincipalRef,
        },
      },
      'security:readAdminAuditEvents': {
        kind: 'allowed',
        surface: 'audit_events',
      },
      'security:readAdminIndexHealth': {
        kind: 'allowed',
        surface: 'index_health',
      },
    })
    expect(results['capabilityProviderConnections:listOwner']).toEqual([
      expect.objectContaining({ connectionRef: fixture.connectionRef }),
    ])
  })

  it('denies exact materialized credential expiry through all owner query callers under test', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(EXPIRY_NOW)
    const fixture = await currentQueryFixture('expired', {
      credentialExpiresAt: EXPIRY_NOW + 1_000,
    })
    await expect(
      fixture.owner.query(api.agentAccessPolicy.listOwnerGrantReadbacks, {}),
    ).resolves.toEqual([
      expect.objectContaining({ credentialId: fixture.agentCredentialRef }),
    ])

    vi.setSystemTime(fixture.credential.expiresAt)
    await expect(
      fixture.backend.mutation(
        internal.interactiveCredentialLifecycle.expireInteractiveCredential,
        {
          bindingRef: fixture.credential.bindingRef,
          credentialRef: fixture.credential.credentialRef,
          expectedGeneration: fixture.credential.generation,
          expectedExpiresAt: fixture.credential.expiresAt,
          scheduleNonce: fixture.credential.scheduleNonce,
        },
      ),
    ).resolves.toEqual({ kind: 'expired' })

    await expectAllOwnerQueriesDenied(fixture.owner, fixture)
  })

  it('denies exact credential revocation through all owner query callers under test', async () => {
    const fixture = await currentQueryFixture('revoked')
    await fixture.backend.run(async (ctx) => {
      const credential = await ctx.db
        .query('credentials')
        .withIndex('by_credentialRef', (query) =>
          query.eq('credentialRef', fixture.credential.credentialRef),
        )
        .unique()
      if (credential === null) throw new Error('credential_fixture_missing')
      await ctx.db.patch(credential._id, {
        lifecycle: 'revoked',
        revokedAt: Date.now(),
        revision: credential.revision + 1,
        updatedAt: Date.now(),
      })
    })

    await expectAllOwnerQueriesDenied(fixture.owner, fixture)
  })

  it('does not disclose one Account through another authenticated Account', async () => {
    const fixture = await currentQueryFixture('cross-account')
    const results = Object.fromEntries(
      await Promise.all(
        ownerQueries(fixture).map(async ({ ref, run }) => [
          ref,
          await run(fixture.otherOwner),
        ]),
      ),
    )
    const serialized = JSON.stringify(results)

    expect(serialized).not.toContain(fixture.businessRef)
    expect(serialized).not.toContain(fixture.connectionRef)
    expect(serialized).not.toContain(fixture.publicationRef)
    expect(serialized).not.toContain(fixture.agentCredentialRef)
    expect(results).toMatchObject({
      'agentAccessPolicy:listOwnerGrantReadbacks': [],
      'capabilityOperationInvocations:listPendingOperationApprovals': [],
      'catalog:getCurrentOwnerPublicCatalog': { kind: 'not_found' },
      'capabilityProviderConnections:readOwner': null,
      'capabilityProviderConnections:listOwner': [],
      'capabilitySupply:readCapabilityPublication': null,
      'capabilitySupply:queryCapabilityGraph': {
        kind: 'unavailable',
        reason: 'authorization_denied',
      },
      'capabilitySupply:inspectBindingControlState': {
        kind: 'refused',
        reason: 'authorization_denied',
      },
      'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel': {
        kind: 'not_found',
      },
      'moneyLedger:readOwnerPayoutAccount': null,
      'moneyLedger:readCreditAccount': {
        kind: 'refused',
        code: 'billing_identity_missing',
      },
      'moneyLedger:listCreditActivity': {
        kind: 'refused',
        code: 'billing_identity_missing',
        items: [],
      },
      'moneyLedger:readKeyUsage': {
        kind: 'refused',
        code: 'billing_identity_missing',
        items: [],
      },
      'moneyLedger:readCreditTopupCommand': {
        kind: 'refused',
        code: 'billing_identity_missing',
      },
      'moneyLedger:readOwnerPayoutTransfer': {
        kind: 'refused',
        code: 'billing_identity_missing',
      },
      'moneyLedger:readOwnerProviderEarnings': {
        kind: 'available',
        businessId: String(fixture.otherBusinessId),
      },
      'qualifiedUse:readOwnerQualifiedUse': {
        kind: 'found',
        businessId: String(fixture.otherBusinessId),
      },
      'security:readAdminAuditEvents': {
        kind: 'denied',
        surface: 'audit_events',
        rows: [],
      },
      'security:readAdminIndexHealth': {
        kind: 'denied',
        surface: 'index_health',
        rows: [],
      },
    })
  })

  it('rejects caller-shaped Clerk, provider, credential, Account, and proof fields at every query validator', async () => {
    const fixture = await currentQueryFixture('caller-shaped')
    const hostile = {
      clerkUserId: 'user_forged',
      providerIdentifier: 'https://identity.example|user_forged',
      credentialRef: fixture.credential.credentialRef,
      accountRef: fixture.credential.bindingRef,
      authorityProof: { kind: 'caller_shaped', accepted: true },
    }

    for (const query of hostileOwnerQueries(fixture, hostile)) {
      await expect(query.run()).rejects.toThrow(/extra field|Unexpected field|Object contains extra field/u)
    }
  })
})

async function expectAllOwnerQueriesDenied(
  owner: OwnerClient,
  fixture: Pick<
    QueryFixture,
    | 'businessId'
    | 'businessRef'
    | 'bindingId'
    | 'connectionRef'
    | 'publicationRef'
    | 'agentPrincipalRef'
    | 'agentCredentialRef'
    | 'topupCommandRef'
    | 'topupIdempotencyKey'
  >,
) {
  const results = Object.fromEntries(
    await Promise.all(
      ownerQueries(fixture).map(async ({ ref, run }) => [ref, await run(owner)]),
    ),
  )
  expect(results).toEqual({
    'agentAccessPolicy:listOwnerGrantReadbacks': [],
    'capabilityOperationInvocations:listPendingOperationApprovals': [],
    'catalog:getCurrentOwnerPublicCatalog': {
      kind: 'not_found',
      reason: 'not_public',
    },
    'catalog:getCurrentOwnerOfferingSupply': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'capabilityProviderConnections:readOwner': null,
    'capabilityProviderConnections:listOwner': [],
    'capabilitySupply:readCapabilityPublication': null,
    'capabilitySupply:queryCapabilityGraph': {
      kind: 'unavailable',
      reason: 'authorization_denied',
    },
    'capabilitySupply:inspectBindingControlState': {
      kind: 'refused',
      reason: 'authorization_denied',
    },
    'capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'moneyLedger:readOwnerPayoutAccount': null,
    'moneyLedger:readCreditAccount': {
      kind: 'refused',
      code: 'billing_identity_missing',
    },
    'moneyLedger:listCreditActivity': {
      kind: 'refused',
      code: 'billing_identity_missing',
      items: [],
    },
    'moneyLedger:readKeyUsage': {
      kind: 'refused',
      code: 'billing_identity_missing',
      items: [],
    },
    'moneyLedger:readCreditTopupCommand': {
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    },
    'moneyLedger:readOwnerPayoutTransfer': {
      kind: 'refused',
      code: 'billing_identity_missing',
      retryable: false,
    },
    'moneyLedger:readOwnerProviderEarnings': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'qualifiedUse:readOwnerQualifiedUse': {
      kind: 'error',
      code: 'unauthenticated',
    },
    'security:readAdminAuditEvents': {
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      surface: 'audit_events',
      generatedAt: 0,
      publicMessage: 'Admin readback requires active source-owned membership.',
      rows: [],
    },
    'security:readAdminIndexHealth': {
      kind: 'denied',
      httpStatus: 401,
      reason: 'missing_membership',
      surface: 'index_health',
      generatedAt: 0,
      publicMessage: 'Admin readback requires active source-owned membership.',
      rows: [],
    },
  })
}

async function currentQueryFixture(
  suffix: string,
  options: Readonly<{ credentialExpiresAt?: number }> = {},
): Promise<QueryFixture> {
  const backend = convexTestWithMarketComponents()
  const primary = await publishedBusinessOwner(backend, `owner-query-${suffix}`)
  const other = await publishedBusinessOwner(backend, `owner-query-${suffix}-other`)
  const businessRef = String(primary.businessId)
  const authority = providerAuthority(`owner-query-${suffix}`)
  const providerAccountRef = `account:owner-query:${suffix}`
  const agentPrincipalRef = `prn_${canonicalDigest({
    kind: 'owner-query-agent:v1',
    suffix,
  }).slice('sha256:'.length, 'sha256:'.length + 32)}`
  const agentCredentialRef = `crd_${canonicalDigest({
    kind: 'owner-query-agent-credential:v1',
    suffix,
  }).slice('sha256:'.length, 'sha256:'.length + 32)}`
  const bindingId = `binding:owner-query-${suffix}:http`
  const topupCommandRef = `money-command:owner-query:${suffix}`
  const topupIdempotencyKey = `money-idempotency:owner-query:${suffix}`
  const installed = await installCanonicalProviderConnectionFixture(backend, {
    businessId: primary.businessId,
    ...authority,
    providerAccountRef,
    adapterId: 'http-json:v1',
    secretRef: null,
    scopes: [`capability:owner-query:${suffix}`],
    resources: [`resource:owner-query:${suffix}`],
    evidenceRefs: [`test:owner-query:${suffix}`],
    commandId: `command:owner-query:${suffix}`,
  })
  if (installed.kind !== 'applied') {
    throw new Error(`owner_query_connection_fixture_${installed.kind}`)
  }
  await seedCatalogOffering(backend, primary.businessId, `owner-query-${suffix}`)
  const published = await primary.owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(
      backend,
      capabilityPublicationInput(primary.businessId, `owner-query-${suffix}`),
    ),
  )
  if ('reason' in published) {
    throw new Error(`owner_query_publication_fixture_${published.reason}`)
  }
  await backend.run(async (ctx) => {
    const exactAmount = {
      currency: CURRENCY,
      units: '1000',
      exponent: 2,
    }
    const budgetPolicyRef = `budget-policy:owner-query:${suffix}`
    const ratePolicyRef = `rate-policy:owner-query:${suffix}`
    await ctx.db.insert('adminMemberships', {
      clerkUserId: `user_owner-query-${suffix}`,
      tokenIdentifier: `https://identity.example|user_owner-query-${suffix}`,
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'owner-query-test',
      grantedAt: 1,
    })
    await ctx.db.insert('principals', {
      principalRef: agentPrincipalRef,
      kind: 'agent',
      displayName: `Owner query agent ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: agentPrincipalRef,
      ownerId: primary.canonicalAccountRef,
      credentialId: agentCredentialRef,
      applicationRef: `application:owner-query:${suffix}`,
      environment: 'production',
      scopes: ['market_operations:invoke'],
      authorityMode: 'approve_each',
      grantGeneration: 1,
      policyDigest: `sha256:owner-query-agent-policy:${suffix}`,
      lifecycle: 'active',
      expiresAt: 8_000_000_000_000,
      recordedAt: 1,
      lastSeenAt: 1,
    })
    await ctx.db.insert('agentAccessGrants', {
      format: 'ae.agent-access-grant:v1',
      grantRef: `grant:owner-query:${suffix}`,
      principalId: agentPrincipalRef,
      ownerId: primary.canonicalAccountRef,
      applicationRef: `application:owner-query:${suffix}`,
      credentialId: agentCredentialRef,
      environment: 'production',
      operationAccess: 'all_admitted',
      authorityMode: 'bounded_mandate',
      policy: {
        format: 'ae.agent-access-policy:v1',
        operationAccess: 'all_admitted',
        environment: 'production',
        budget: {
          budgetPolicyRef,
          generation: 1,
          currency: CURRENCY,
          exponent: 2,
          maximumSpendPerInvocation: exactAmount,
          maximumDailySpend: exactAmount,
          maximumMonthlySpend: exactAmount,
          maximumConcurrentInvocations: 1,
        },
        rate: {
          ratePolicyRef,
          generation: 1,
          maximumCallsPerMinute: 10,
          maximumCallsPerHour: 100,
        },
      },
      budgetPolicyRef,
      ratePolicyRef,
      lifecycle: 'active',
      generation: 1,
      policyDigest: `sha256:owner-query-policy:${suffix}`,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 8_000_000_000_000,
    })
    await ctx.db.insert('moneyPayoutAccounts', {
      businessId: businessRef,
      currency: CURRENCY,
      exponent: 2,
      stripeAccountId: `acct_owner_query_${suffix}`,
      state: 'ready',
      detailsSubmitted: true,
      recipientCapabilityActive: true,
      requirementsDigest: 'sha256:owner-query-requirements',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('moneyAccounts', {
      accountRef: accountRefForProvider(businessRef, CURRENCY),
      accountKind: 'provider_earnings',
      businessId: businessRef,
      currency: CURRENCY,
      exponent: 2,
      balanceUnits: '0',
      heldUnits: '0',
      recoveryDueUnits: '0',
      version: 1,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('moneyAccounts', {
      accountRef: accountRefForOwner(primary.canonicalAccountRef, CURRENCY),
      accountKind: 'operator_credit',
      accountId: primary.canonicalAccountRef,
      currency: CURRENCY,
      exponent: 2,
      balanceUnits: '0',
      heldUnits: '0',
      recoveryDueUnits: '0',
      version: 0,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    })
    const invocationRef = `operation-invocation:v1:owner-query:${suffix}`
    const operationRef = `operation:v1:owner-query:${suffix}`
    await ctx.db.insert('capabilityOperationInvocations', {
      invocationRef,
      principalId: agentPrincipalRef,
      ownerId: primary.canonicalAccountRef,
      credentialId: agentCredentialRef,
      applicationRef: `application:owner-query:${suffix}`,
      operationRef,
      idempotencyKey: `idempotency:owner-query-approval:${suffix}`,
      environment: 'production',
      grantRef: `grant:owner-query:${suffix}`,
      grantGeneration: 1,
      policyDigest: `sha256:owner-query-policy:${suffix}`,
      grantExpiresAt: 8_000_000_000_000,
      operationJson: JSON.stringify({ operationRef }),
      inputJson: JSON.stringify({ suffix }),
      inputDigest: canonicalDigest({ suffix }),
      requestDigest: canonicalDigest({ operationRef, suffix }),
      state: 'pending',
      result: {
        kind: 'needs_authority',
        invocationRef,
        operationRef,
        authorityRequest: {
          kind: 'approve_each',
          operationRef,
          consequence: 'external_effect',
          retryClass: 'reconcile_before_retry',
          dataFields: ['/suffix'],
        },
      },
      createdAt: 2,
      updatedAt: 2,
    })
  })

  const topup = await primary.owner.mutation(
    api.moneyLedger.reserveCreditTopup,
    await withSourceWrite('billing', {
      principalId: agentPrincipalRef,
      accountRef: accountRefForOwner(primary.canonicalAccountRef, CURRENCY),
      amount: { currency: CURRENCY, units: '1000', exponent: 2 },
      commandRef: topupCommandRef,
      idempotencyKey: topupIdempotencyKey,
      inputDigest: `sha256:owner-query-topup:${suffix}`,
      successReturnRef: 'https://ae.example/account/credits',
      operationKey: 'moneyLedger:reserveCreditTopup',
      correlationId: topupCommandRef,
    }),
  )
  if (topup.kind !== 'accepted') {
    throw new Error(`owner_query_topup_fixture_${topup.code}`)
  }

  const credential = await backend.run(async (ctx) => {
    const business = await ctx.db.get(primary.businessId)
    if (business === null) throw new Error('owner_query_business_missing')
    const owner = await ctx.db.get(business.ownerId)
    if (owner?.canonicalPrincipalRef === undefined) {
      throw new Error('owner_query_canonical_owner_missing')
    }
    const binding = await ctx.db
      .query('externalIdentityBindings')
      .withIndex('by_principalRef_and_lifecycle', (query) =>
        query
          .eq('principalRef', owner.canonicalPrincipalRef as string)
          .eq('lifecycle', 'active'),
      )
      .unique()
    if (binding === null) throw new Error('owner_query_binding_missing')
    const row = await ctx.db
      .query('credentials')
      .withIndex('by_bindingRef_and_generation_and_lifecycle', (query) =>
        query
          .eq('bindingRef', binding.bindingRef)
          .eq('generation', binding.credentialGeneration)
          .eq('lifecycle', 'active'),
      )
      .unique()
    if (row === null) throw new Error('owner_query_credential_missing')
    const expiresAt = options.credentialExpiresAt ?? row.expiresAt
    const scheduleNonce = canonicalDigest({
      kind: 'interactive_credential_expiry:v1',
      bindingRef: binding.bindingRef,
      credentialRef: row.credentialRef,
      generation: row.generation,
      expiresAt,
    })
    if (options.credentialExpiresAt !== undefined) {
      await ctx.db.patch(row._id, {
        expiresAt,
        expiryMaterialization: {
          state: 'scheduled',
          credentialGeneration: row.generation,
          credentialExpiresAt: expiresAt,
          scheduleNonce,
          scheduleRef: `scheduled:${row.credentialRef}:${expiresAt}`,
          materializedAt: Date.now(),
        },
        updatedAt: Date.now(),
      })
    }
    return {
      bindingRef: binding.bindingRef,
      credentialRef: row.credentialRef,
      generation: row.generation,
      expiresAt,
      scheduleNonce,
    }
  })

  const owner = options.credentialExpiresAt === undefined
    ? primary.owner
    : backend.withIdentity({
        subject: `user_owner-query-${suffix}`,
        issuer: 'https://identity.example',
        exp: credential.expiresAt / 1_000,
      })

  return {
    backend,
    businessId: primary.businessId,
    businessRef,
    bindingId,
    connectionRef: authority.connectionRef,
    publicationRef: published.publicationRef,
    agentPrincipalRef,
    agentCredentialRef,
    topupCommandRef,
    topupIdempotencyKey,
    owner,
    otherBusinessId: other.businessId,
    otherOwner: other.owner,
    credential,
  }
}

function hostileOwnerQueries(
  fixture: QueryFixture,
  hostile: Record<string, unknown>,
) {
  return [
    {
      run: () =>
        fixture.backend.query(
          api.agentAccessPolicy.listOwnerGrantReadbacks,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(
          api.capabilityOperationInvocations.listPendingOperationApprovals,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.capabilitySupply.readCapabilityPublication, {
          publicationRef: fixture.publicationRef,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.capabilitySupply.queryCapabilityGraph, {
          networkId: 'ae:public',
          includeInactive: true,
          limit: 10,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.capabilitySupply.inspectBindingControlState, {
          bindingId: fixture.bindingId,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(
          api.catalog.getCurrentOwnerPublicCatalog,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(
          api.catalog.getCurrentOwnerOfferingSupply,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.capabilityProviderConnections.readOwner, {
          connectionRef: fixture.connectionRef,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(
          api.capabilityProviderConnections.listOwner,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(
          api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
          { businessId: fixture.businessId, ...hostile } as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readOwnerPayoutAccount, {
          businessId: fixture.businessRef,
          currency: CURRENCY,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readCreditAccount, {
          principalId: fixture.agentPrincipalRef,
          currency: CURRENCY,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.listCreditActivity, {
          principalId: fixture.agentPrincipalRef,
          credentialId: fixture.agentCredentialRef,
          currency: CURRENCY,
          paginationOpts: { numItems: 10, cursor: null },
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readKeyUsage, {
          principalId: fixture.agentPrincipalRef,
          credentialId: fixture.agentCredentialRef,
          currency: CURRENCY,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readCreditTopupCommand, {
          commandRef: fixture.topupCommandRef,
          idempotencyKey: fixture.topupIdempotencyKey,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.moneyLedger.readOwnerPayoutTransfer, {
          businessId: fixture.businessRef,
          currency: CURRENCY,
          payoutRef: 'payout:owner-query-authority',
          idempotencyKey: 'idempotency:owner-query-authority',
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(
          api.moneyLedger.readOwnerProviderEarnings,
          hostile as never,
        ),
    },
    {
      run: () =>
        fixture.backend.query(api.qualifiedUse.readOwnerQualifiedUse, {
          limit: 10,
          ...hostile,
        } as never),
    },
    {
      run: () =>
        fixture.backend.query(api.security.readAdminAuditEvents, hostile as never),
    },
    {
      run: () =>
        fixture.backend.query(api.security.readAdminIndexHealth, hostile as never),
    },
  ]
}

function discoverPublicBusinessActorQueryCallers(): string[] {
  const convexRoot = fileURLToPath(new URL('../../convex/', import.meta.url))
  const files = collectTypeScriptFiles(convexRoot).filter(
    (path) => !path.includes('/_generated/'),
  )
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
  })
  const checker = program.getTypeChecker()
  const callers: string[] = []

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(convexRoot) || source.fileName.includes('/_generated/')) {
      continue
    }
    source.forEachChild((node) => {
      if (!ts.isVariableStatement(node) || !hasExportModifier(node)) return
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
          continue
        }
        if (!isPublicQueryInitializer(declaration.initializer)) continue
        const handler = queryHandler(declaration.initializer)
        if (handler === undefined) continue
        if (!reachesResolveBusinessActor(handler, checker, convexRoot, new Set())) {
          continue
        }
        const moduleName = relative(convexRoot, source.fileName).replace(/\.ts$/u, '')
        callers.push(`${moduleName}:${declaration.name.text}`)
      }
    })
  }
  return callers.sort()
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectTypeScriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [path]
      : []
  })
}

function hasExportModifier(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0
}

function isPublicQueryInitializer(node: ts.Expression): node is ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && (node.expression.text === 'query' || node.expression.text === 'queryGeneric')
}

function queryHandler(call: ts.CallExpression): ts.Expression | undefined {
  const config = call.arguments[0]
  if (config === undefined || !ts.isObjectLiteralExpression(config)) return undefined
  const property = config.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate)
      && ts.isIdentifier(candidate.name)
      && candidate.name.text === 'handler',
  )
  return property?.initializer
}

function reachesResolveBusinessActor(
  root: ts.Node,
  checker: ts.TypeChecker,
  convexRoot: string,
  visited: Set<ts.Node>,
): boolean {
  if (visited.has(root)) return false
  visited.add(root)
  if (ts.isIdentifier(root)) {
    if (root.text === 'resolveBusinessActor') return true
    return declarationsFor(root, checker).some(
      (declaration) =>
        declaration.getSourceFile().fileName.startsWith(convexRoot)
        && reachesResolveBusinessActor(
          declaration,
          checker,
          convexRoot,
          visited,
        ),
    )
  }
  let found = false
  const visit = (node: ts.Node) => {
    if (found) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'resolveBusinessActor') {
        found = true
        return
      }
      for (const declaration of declarationsFor(node.expression, checker)) {
        if (
          declaration.getSourceFile().fileName.startsWith(convexRoot)
          && reachesResolveBusinessActor(declaration, checker, convexRoot, visited)
        ) {
          found = true
          return
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

function declarationsFor(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): readonly ts.Declaration[] {
  const symbol = checker.getSymbolAtLocation(identifier)
  if (symbol === undefined) return []
  const resolved = (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol
  return resolved.declarations ?? []
}

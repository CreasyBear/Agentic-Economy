import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { InteractiveAuthorityError } from '../../../convex/interactiveAuthority'
import { resolveInteractiveAuthorityContext } from '../../../convex/interactiveAuthority'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createAgentAccessGrant } from '@/modules/agent-access/policy'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_OWNERSHIP_REF as OWNERSHIP_REF,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const TEAMMATE_PRINCIPAL_REF = `prn_${'a'.repeat(32)}`
const TEAMMATE_MEMBERSHIP_REF = `mem_${'a'.repeat(32)}`
const TEAMMATE_TOKEN_IDENTIFIER = 'https://clerk.example.test|user_teammate'
const ORG_BINDING_REF = `eob_${'o'.repeat(32)}`
const CLERK_ORG_ID = 'org_w14_test'

const DISPLAY_NAME = 'Canonical account'
const ACCOUNT_REVISION = 4
const OWNERSHIP_REVISION = 3

const freshFva = [1, 1]
const noMfaFva = [1, -1]
const staleMfaFva = [1, 999]

type WorkspaceFenceReason =
  | 'unsettled_provider_obligations'
  | 'unwithdrawn_earnings'
  | 'open_calls'
  | 'unreleased_call_holds'
  | 'in_flight_funding'
  | 'open_reconciliation'

type WorkspaceDecommissionEligibility = Readonly<{
  accountRef: string
  displayName: string
  accountRevision: number
  ownershipRevision: number
  callerIsOwner: boolean
  canClose: boolean
  canTransfer: boolean
  fences: readonly WorkspaceFenceReason[]
  transferCandidates: readonly Readonly<{
    principalRef: string
    displayName: string
    membershipRef: string
  }>[]
}>

type MfaReverificationRefusal = Readonly<{
  kind: 'refused'
  code: 'mfa_reverification_required'
}>

type CloseWorkspaceReceipt =
  | MfaReverificationRefusal
  | Readonly<{ kind: 'closed'; accountRef: string; accountRevision: number }>
  | Readonly<{ kind: 'replayed'; accountRef: string; accountRevision: number }>

type TransferWorkspaceReceipt =
  | MfaReverificationRefusal
  | Readonly<{
    kind: 'transferred'
    accountRef: string
    previousOwnershipRef: string
    currentOwnershipRef: string
    accountRevision: number
  }>
  | Readonly<{ kind: 'replayed'; accountRef: string; currentOwnershipRef: string; accountRevision: number }>

const readEligibilityRef = makeFunctionReference<
  'query',
  Record<string, never>,
  WorkspaceDecommissionEligibility
>('workspaceAccounts:readWorkspaceDecommissionEligibility')

const closeWorkspaceRef = makeFunctionReference<
  'mutation',
  Readonly<{
    confirmationName: string
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    correlationRef: string
    idempotencyRef: string
  }>,
  CloseWorkspaceReceipt
>('workspaceAccounts:closeWorkspace')

const transferWorkspaceOwnershipRef = makeFunctionReference<
  'mutation',
  Readonly<{
    successorPrincipalRef: string
    expectedAccountRevision: number
    expectedOwnershipRevision: number
    correlationRef: string
    idempotencyRef: string
  }>,
  TransferWorkspaceReceipt
>('workspaceAccounts:transferWorkspaceOwnership')

const readDeletionEligibilityRef = makeFunctionReference<
  'query',
  Record<string, never>,
  Readonly<{ kind: 'eligible' } | { kind: 'blocked'; reason: string }>
>('personalAccount:readDeletionEligibility')

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, { fva: freshFva, ...overrides })

const teammateIdentity = () =>
  samIdentity(TEAMMATE_TOKEN_IDENTIFIER, { subject: 'user_teammate', fva: freshFva })

const correlationRef = (label: string) => `test:workspace-decommission:${label}`
const idempotencyRef = (label: string) => `idem:workspace-decommission:${label}`

function closePayload(overrides: Partial<{
  confirmationName: string
  expectedAccountRevision: number
  expectedOwnershipRevision: number
  correlationRef: string
  idempotencyRef: string
}> = {}) {
  return {
    confirmationName: DISPLAY_NAME,
    expectedAccountRevision: ACCOUNT_REVISION,
    expectedOwnershipRevision: OWNERSHIP_REVISION,
    correlationRef: correlationRef('close'),
    idempotencyRef: idempotencyRef('close'),
    ...overrides,
  }
}

function transferPayload(overrides: Partial<{
  successorPrincipalRef: string
  expectedAccountRevision: number
  expectedOwnershipRevision: number
  correlationRef: string
  idempotencyRef: string
}> = {}) {
  return {
    successorPrincipalRef: TEAMMATE_PRINCIPAL_REF,
    expectedAccountRevision: ACCOUNT_REVISION,
    expectedOwnershipRevision: OWNERSHIP_REVISION,
    correlationRef: correlationRef('transfer'),
    idempotencyRef: idempotencyRef('transfer'),
    ...overrides,
  }
}

async function readEligibility(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<WorkspaceDecommissionEligibility> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readEligibilityRef, {})
}

async function closeWorkspace(
  backend: InteractiveAuthorityBackend,
  input = closePayload(),
  presentedIdentity: UserIdentity = identity(),
): Promise<CloseWorkspaceReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(closeWorkspaceRef, input)
}

async function transferWorkspaceOwnership(
  backend: InteractiveAuthorityBackend,
  input = transferPayload(),
  presentedIdentity: UserIdentity = identity(),
): Promise<TransferWorkspaceReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(transferWorkspaceOwnershipRef, input)
}

async function expectRefusal(run: () => Promise<unknown>, code: string): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function seedTeammateMembership(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: TEAMMATE_PRINCIPAL_REF,
      kind: 'human',
      displayName: 'Sarah Connor',
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('memberships', {
      membershipRef: TEAMMATE_MEMBERSHIP_REF,
      accountRef: ACCOUNT_REF,
      memberPrincipalRef: TEAMMATE_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_REF,
        correlationRef: `create:${TEAMMATE_MEMBERSHIP_REF}`,
        idempotencyRef: `create:${TEAMMATE_MEMBERSHIP_REF}`,
      },
    })
  })
}

async function seedTeammateInteractiveAuthority(backend: InteractiveAuthorityBackend): Promise<void> {
  const bindingRef = `eib_${'t'.repeat(32)}`
  const credentialRef = `crd_${'t'.repeat(32)}`
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: TEAMMATE_PRINCIPAL_REF,
      providerNamespace: 'clerk/user',
      providerIdentifier: TEAMMATE_TOKEN_IDENTIFIER,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: 'bind:teammate',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('credentials', {
      credentialRef,
      bindingRef,
      principalRef: TEAMMATE_PRINCIPAL_REF,
      type: 'provider_token',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: 'credential:teammate',
      revision: 1,
      issuedAt: NOW,
      expiresAt: NOW + 60_000,
      updatedAt: NOW,
    })
    await ctx.db.insert('interactiveSessionSelections', {
      principalRef: TEAMMATE_PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      revision: 1,
      selectedAt: NOW,
      lastCorrelationRef: correlationRef('teammate-selection'),
    })
  })
}

async function seedSessionSelection(
  backend: InteractiveAuthorityBackend,
  principalRef: string,
  activeAccountRef: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('interactiveSessionSelections', {
      principalRef,
      activeAccountRef,
      revision: 1,
      selectedAt: NOW,
      lastCorrelationRef: correlationRef('session'),
    })
  })
}

async function seedOrgBinding(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accountExternalOrganizationBindings', {
      bindingRef: ORG_BINDING_REF,
      accountRef: ACCOUNT_REF,
      providerNamespace: 'clerk/organization',
      providerIdentifier: CLERK_ORG_ID,
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function seedBuyerObligation(
  backend: InteractiveAuthorityBackend,
  state: 'accrued' | 'held' | 'payable' | 'settled' | 'reversed' | 'disputed',
  callRef = 'call:w14:buyer',
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyProviderObligations', {
      obligationRef: `obligation:${callRef}`,
      callRef,
      toolRef: 'tool:w14',
      providerRef: 'biz:provider',
      buyerAccountRef: ACCOUNT_REF,
      buyerAsset: 'AUD',
      buyerExponent: 6,
      buyerAmountUnits: '1000000',
      providerAsset: 'USDC',
      providerExponent: 6,
      providerAmountUnits: '500000',
      settlementMethod: 'managed_x402',
      state,
      payoutEligibility: 'ineligible_x402',
      evidenceRefs: ['evidence:w14'],
      createdAt: NOW,
      updatedAt: NOW,
      ...(state === 'settled' ? { settledAt: NOW } : {}),
      ...(state === 'reversed' ? { reversedAt: NOW } : {}),
    })
  })
}

async function seedSupplierBusiness(backend: InteractiveAuthorityBackend): Promise<string> {
  return await backend.run(async (ctx) => {
    const businessId = await ctx.db.insert('businesses', {
      owningAccountRef: ACCOUNT_REF,
      slug: 'w14-supplier',
      name: 'W14 Supplier',
      normalizedName: 'w14 supplier',
      category: 'services',
      businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
      publicStatus: 'published',
      trustTier: 'listed',
      sourceHash: canonicalDigest({ kind: 'w14-supplier' }),
      createdAt: NOW,
      updatedAt: NOW,
    })
    return String(businessId)
  })
}

async function seedSupplierPayableObligation(backend: InteractiveAuthorityBackend): Promise<string> {
  const providerRef = await seedSupplierBusiness(backend)
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyProviderObligations', {
      obligationRef: 'obligation:w14:supplier',
      callRef: 'call:w14:supplier',
      toolRef: 'tool:w14:supplier',
      providerRef,
      buyerAccountRef: `acc_${'x'.repeat(32)}`,
      buyerAsset: 'AUD',
      buyerExponent: 6,
      buyerAmountUnits: '1000000',
      providerAsset: 'USDC',
      providerExponent: 6,
      providerAmountUnits: '500000',
      settlementMethod: 'managed_x402',
      state: 'payable',
      payoutEligibility: 'ineligible_x402',
      evidenceRefs: ['evidence:w14:supplier'],
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
  return providerRef
}

async function seedPayout(
  backend: InteractiveAuthorityBackend,
  state: 'held_threshold' | 'transfer_pending' | 'paid',
  businessId: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyPayouts', {
      payoutRef: `payout:w14:${state}`,
      businessId,
      owningAccountRef: ACCOUNT_REF,
      authorityPrincipalRef: PRINCIPAL_REF,
      authorityGrantRef: 'grant:w14',
      authorityGrantGeneration: 1,
      authorityResourceRefs: ['resource:w14'],
      currency: 'AUD',
      exponent: 6,
      grossAccrualUnits: '1000000',
      rakeUnits: '100000',
      providerNetUnits: '900000',
      minimumPayoutUnits: '500000',
      cadence: 'daily',
      state,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-02',
      idempotencyKey: `payout:w14:${state}`,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function seedCall(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    callRef: string
    state: 'pending' | 'reconciliation_required' | 'completed'
    formanceFinancialState?: 'reservation_pending' | 'reserved' | 'possibly_submitted' | 'outcome_unknown' | 'settled'
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityCalls', {
      callRef: input.callRef,
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      credentialId: 'credential:w14',
      applicationRef: 'application:w14',
      toolRef: 'tool:w14',
      idempotencyKey: `idempotency:${input.callRef}`,
      environment: 'sandbox',
      grantRef: 'grant:w14',
      grantGeneration: 1,
      policyDigest: canonicalDigest({ kind: 'grant', callRef: input.callRef }),
      grantExpiresAt: NOW + 60_000,
      inputDigest: canonicalDigest({ kind: 'input', callRef: input.callRef }),
      requestDigest: canonicalDigest({ kind: 'request', callRef: input.callRef }),
      state: input.state,
      dispatchState: input.state === 'pending' ? 'enqueued' : 'completed',
      ...(input.formanceFinancialState === undefined
        ? {}
        : { formanceFinancialState: input.formanceFinancialState }),
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function seedFunding(
  backend: InteractiveAuthorityBackend,
  state: 'pending' | 'outcome_unknown',
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyFundingCommands', {
      commandRef: `funding:w14:${state}`,
      accountRef: ACCOUNT_REF,
      legalCustomerRef: `legal:${ACCOUNT_REF}`,
      actorPrincipalRef: PRINCIPAL_REF,
      environment: 'sandbox',
      currency: 'AUD',
      exponent: 6,
      principalUnits: '5000000',
      serviceFeeUnits: '250000',
      taxUnits: '30000',
      totalUnits: '5280000',
      commercialPolicyDigest: canonicalDigest({ kind: 'policy' }),
      commercialPolicyRefs: ['commercial-policy:sandbox'],
      idempotencyKey: `funding:w14:${state}`,
      inputDigest: canonicalDigest({ kind: 'input', state }),
      successReturnRef: 'owner/credit',
      providerRecoveryDeadlineAt: NOW + 60_000,
      state,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function seedOpenReconciliationCase(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyReconciliationCases', {
      caseRef: 'money-case:w14',
      accountRef: ACCOUNT_REF,
      kind: 'settlement_difference',
      status: 'open',
      scopeType: 'account',
      scopeRef: ACCOUNT_REF,
      reasonCode: 'settlement_reference_mismatch',
      evidenceRefs: ['evidence:w14:reconciliation'],
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function seedAgentGrant(backend: InteractiveAuthorityBackend): Promise<string> {
  const machineAgentRef = `prn_${'m'.repeat(32)}`
  const grantRef = 'grant:w14:agent'
  const grantDecision = createAgentAccessGrant({
    grantRef,
    principalId: machineAgentRef,
    ownerId: ACCOUNT_REF,
    applicationRef: 'agentic-economy',
    credentialId: 'key_w14_agent',
    environment: 'sandbox',
    toolAccess: 'all_admitted',
    authorityMode: 'read_only',
    spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    lifecycle: 'active',
    generation: 1,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: NOW + 60_000,
  })
  if (grantDecision.kind === 'refused') throw new Error(grantDecision.code)

  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: machineAgentRef,
      kind: 'agent',
      displayName: 'W14 machine agent',
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
    await ctx.db.insert('agentAccessGrants', grantDecision.grant)
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: ACCOUNT_REF,
      actorPrincipalRef: PRINCIPAL_REF,
      subjectPrincipalRef: machineAgentRef,
      scopes: ['market_tools:call'],
      resourceRefs: ['*'],
      budgetLimit: 10,
      budgetUsed: 0,
      expiresAt: NOW + 120_000,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_REF,
        correlationRef: correlationRef('delegation'),
        idempotencyRef: idempotencyRef('delegation'),
      },
    })
  })
  return grantRef
}

async function readAccount(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT_REF))
    .unique())
}

async function listOwnerships(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('accountOwnerships')
    .filter((filter) => filter.eq(filter.field('accountRef'), ACCOUNT_REF))
    .collect())
}

async function listMemberships(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('memberships')
    .filter((filter) => filter.eq(filter.field('accountRef'), ACCOUNT_REF))
    .collect())
}

async function listSessionSelectionsForAccount(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('interactiveSessionSelections')
    .filter((filter) => filter.eq(filter.field('activeAccountRef'), ACCOUNT_REF))
    .collect())
}

async function readOrgBinding(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const bindings = await ctx.db.query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', ACCOUNT_REF)
        .eq('lifecycle', 'revoked'))
      .collect()
    return bindings.find((row) => row.bindingRef === ORG_BINDING_REF) ?? null
  })
}

async function readAgentGrant(backend: InteractiveAuthorityBackend, grantRef: string) {
  return await backend.run(async (ctx) => await ctx.db.query('agentAccessGrants')
    .filter((filter) => filter.eq(filter.field('grantRef'), grantRef))
    .unique())
}

async function readDelegationGrant(backend: InteractiveAuthorityBackend, grantRef: string) {
  return await backend.run(async (ctx) => await ctx.db.query('authorityDelegationGrants')
    .filter((filter) => filter.eq(filter.field('grantRef'), grantRef))
    .unique())
}

async function listAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
}

async function countObligations(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => (await ctx.db.query('moneyProviderObligations').collect()).length)
}

async function countCalls(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => (await ctx.db.query('capabilityCalls').collect()).length)
}


describe('workspaceAccounts readWorkspaceDecommissionEligibility (W-14)', () => {
  it('E1: owner, empty workspace -> canClose true, canTransfer false, fences empty', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readEligibility(backend)).resolves.toEqual({
      accountRef: ACCOUNT_REF,
      displayName: DISPLAY_NAME,
      accountRevision: ACCOUNT_REVISION,
      ownershipRevision: OWNERSHIP_REVISION,
      callerIsOwner: true,
      canClose: true,
      canTransfer: false,
      fences: [],
      transferCandidates: [],
    })
  })

  it('E2: owner + one active member -> canClose true, canTransfer true, one candidate', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: true,
      canTransfer: true,
      fences: [],
      transferCandidates: [expect.objectContaining({
        principalRef: TEAMMATE_PRINCIPAL_REF,
        displayName: 'Sarah Connor',
        membershipRef: TEAMMATE_MEMBERSHIP_REF,
      })],
    })
  })

  it('E3: member (not owner) -> callerIsOwner false, cannot close or transfer', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expect(readEligibility(backend)).resolves.toMatchObject({
      callerIsOwner: false,
      canClose: false,
      canTransfer: false,
      transferCandidates: [],
    })
  })

  it.each(['accrued', 'held', 'payable', 'disputed'] as const)(
    'E4: buyer obligation %s fences close',
    async (state) => {
      const backend = createBackend()
      await seedAuthority(backend)
      await seedBuyerObligation(backend, state, `call:w14:${state}`)

      await expect(readEligibility(backend)).resolves.toMatchObject({
        canClose: false,
        fences: ['unsettled_provider_obligations'],
      })
    },
  )

  it.each(['settled', 'reversed'] as const)(
    'E5: buyer obligation %s does not fence',
    async (state) => {
      const backend = createBackend()
      await seedAuthority(backend)
      await seedBuyerObligation(backend, state, `call:w14:${state}`)

      await expect(readEligibility(backend)).resolves.toMatchObject({
        canClose: true,
        fences: [],
      })
    },
  )

  it('E6: supplier business with payable obligation fences unsettled_provider_obligations', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSupplierPayableObligation(backend)

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: false,
      fences: ['unsettled_provider_obligations'],
    })
  })

  it.each(['held_threshold', 'transfer_pending'] as const)(
    'E7: payout %s fences unwithdrawn_earnings',
    async (state) => {
      const backend = createBackend()
      await seedAuthority(backend)
      const businessId = await seedSupplierBusiness(backend)
      await seedPayout(backend, state, businessId)

      await expect(readEligibility(backend)).resolves.toMatchObject({
        canClose: false,
        fences: expect.arrayContaining(['unwithdrawn_earnings']),
      })
    },
  )

  it('E8: payout paid does not add earnings fence', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const businessId = await seedSupplierBusiness(backend)
    await seedPayout(backend, 'paid', businessId)

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: true,
      fences: [],
    })
  })

  it('E9: call pending fences open_calls', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedCall(backend, { callRef: 'call:w14:pending', state: 'pending' })

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: false,
      fences: ['open_calls'],
    })
  })

  it('E10: call reconciliation_required fences open_calls', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedCall(backend, { callRef: 'call:w14:recon', state: 'reconciliation_required' })

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: false,
      fences: ['open_calls'],
    })
  })

  it('E11: reserved formance hold fences unreleased_call_holds', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedCall(backend, {
      callRef: 'call:w14:hold',
      state: 'completed',
      formanceFinancialState: 'reserved',
    })

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: false,
      fences: ['unreleased_call_holds'],
    })
  })

  it.each(['pending', 'outcome_unknown'] as const)(
    'E12: funding %s fences in_flight_funding',
    async (state) => {
      const backend = createBackend()
      await seedAuthority(backend)
      await seedFunding(backend, state)

      await expect(readEligibility(backend)).resolves.toMatchObject({
        canClose: false,
        fences: ['in_flight_funding'],
      })
    },
  )

  it('E13: open reconciliation case fences open_reconciliation', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedOpenReconciliationCase(backend)

    await expect(readEligibility(backend)).resolves.toMatchObject({
      canClose: false,
      fences: ['open_reconciliation'],
    })
  })

  it('E14: unauthenticated query refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(() => backend.query(readEligibilityRef, {}), 'identity_invalid')
  })

  it('E15: closed account as active selection refuses account_inactive', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { accountLifecycle: 'closed' })
    await seedSessionSelection(backend, PRINCIPAL_REF, ACCOUNT_REF)

    await expectRefusal(() => readEligibility(backend), 'account_inactive')
  })
})

describe('workspaceAccounts closeWorkspace (W-14)', () => {
  it('C1: happy path closes account, ends ownership and memberships', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)

    const receipt = await closeWorkspace(backend)
    expect(receipt).toMatchObject({ kind: 'closed', accountRef: ACCOUNT_REF })

    const account = await readAccount(backend)
    expect(account).toMatchObject({ lifecycle: 'closed' })

    const ownerships = await listOwnerships(backend)
    expect(ownerships.every((row) => row.lifecycle === 'ended')).toBe(true)

    const memberships = await listMemberships(backend)
    expect(memberships.every((row) => row.lifecycle === 'ended')).toBe(true)
  })

  it('C2: session selections for closed account are removed', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await seedSessionSelection(backend, PRINCIPAL_REF, ACCOUNT_REF)
    await seedSessionSelection(backend, TEAMMATE_PRINCIPAL_REF, ACCOUNT_REF)

    await closeWorkspace(backend)

    expect(await listSessionSelectionsForAccount(backend)).toEqual([])
  })

  it('C3: active agent grant and delegation are revoked', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const grantRef = await seedAgentGrant(backend)

    await closeWorkspace(backend)

    expect(await readAgentGrant(backend, grantRef)).toMatchObject({ lifecycle: 'revoked' })
    expect(await readDelegationGrant(backend, grantRef)).toMatchObject({ lifecycle: 'revoked' })
  })

  it('C4: org binding revoked', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedOrgBinding(backend)

    await closeWorkspace(backend)

    expect(await readOrgBinding(backend)).toMatchObject({ lifecycle: 'revoked' })
  })

  it('C5: audit account.workspace.closed recorded', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await closeWorkspace(backend)

    expect(await listAuditEvents(backend)).toEqual([expect.objectContaining({
      eventType: 'account.workspace.closed',
      actorRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
    })])
  })

  it('C6: wrong typed name refuses workspace_confirmation_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(
      () => closeWorkspace(backend, closePayload({ confirmationName: 'Acme' })),
      'workspace_confirmation_mismatch',
    )
    expect(await readAccount(backend)).toMatchObject({ lifecycle: 'active' })
  })

  it('C7: whitespace and case mismatch refuse workspace_confirmation_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(
      () => closeWorkspace(backend, closePayload({ confirmationName: '  canonical account  ' })),
      'workspace_confirmation_mismatch',
    )
    await expectRefusal(
      () => closeWorkspace(backend, closePayload({ confirmationName: 'canonical account' })),
      'workspace_confirmation_mismatch',
    )
  })

  it('C8: unsettled obligation refuses workspace_has_unsettled_obligations', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedBuyerObligation(backend, 'payable')

    await expect(closeWorkspace(backend)).rejects.toMatchObject({
      name: 'InteractiveAuthorityError',
      code: 'workspace_has_unsettled_obligations',
      fences: expect.arrayContaining(['unsettled_provider_obligations']),
    })
  })

  it('C9: non-owner refuses ownership_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    await expectRefusal(() => closeWorkspace(backend), 'ownership_mismatch')
  })

  it('C10: stale account revision refuses account_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(
      () => closeWorkspace(backend, closePayload({ expectedAccountRevision: ACCOUNT_REVISION - 1 })),
      'account_revision_conflict',
    )
  })

  it('C11: stale ownership revision refuses ownership_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(
      () => closeWorkspace(backend, closePayload({ expectedOwnershipRevision: OWNERSHIP_REVISION - 1 })),
      'ownership_revision_conflict',
    )
  })

  it('C12: idempotent replay with same idempotencyRef returns replayed', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const payload = closePayload({ idempotencyRef: idempotencyRef('replay-close') })

    expect(await closeWorkspace(backend, payload)).toMatchObject({ kind: 'closed' })
    expect(await closeWorkspace(backend, payload)).toEqual(expect.objectContaining({ kind: 'replayed' }))
    expect((await listOwnerships(backend)).filter((row) => row.lifecycle === 'ended')).toHaveLength(1)
  })

  it('C13: same idempotencyRef with changed payload refuses', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const sharedIdempotency = idempotencyRef('conflict-close')
    await closeWorkspace(backend, closePayload({ idempotencyRef: sharedIdempotency }))

    await expectRefusal(
      () => closeWorkspace(backend, closePayload({
        idempotencyRef: sharedIdempotency,
        confirmationName: `${DISPLAY_NAME} `,
      })),
      'idempotency_conflict',
    )
  })

  it.each([
    ['absent', identity({ fva: undefined })],
    ['malformed', identity({ fva: [1] })],
    ['without a second factor', identity({ fva: noMfaFva })],
    ['with stale factors', identity({ fva: staleMfaFva })],
  ])('C14: signed fva %s refuses before any close write even when workspace MFA policy is off', async (
    _label,
    presentedIdentity,
  ) => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(closeWorkspace(backend, closePayload(), presentedIdentity)).resolves.toEqual({
      kind: 'refused',
      code: 'mfa_reverification_required',
    })
    await expect(readAccount(backend)).resolves.toMatchObject({ lifecycle: 'active' })
  })

  it('C15: close validator rejects fabricated client factor evidence', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const forgedPayload = {
      ...closePayload(),
      factorEvidence: { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 },
    }

    await expect(
      backend.withIdentity(identity()).mutation(closeWorkspaceRef, forgedPayload),
    ).rejects.toThrow(/factorEvidence|extra field/i)
  })

  it('C16: already closed account refuses workspace_already_closed', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await closeWorkspace(backend, closePayload({ idempotencyRef: idempotencyRef('first-close') }))

    await expectRefusal(
      () => closeWorkspace(backend, closePayload({ idempotencyRef: idempotencyRef('second-close') })),
      'workspace_already_closed',
    )
  })

  it('C17: interactive authority on closed account throws account_inactive', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSessionSelection(backend, PRINCIPAL_REF, ACCOUNT_REF)
    await closeWorkspace(backend)

    await expect(backend.run(async (ctx) =>
      resolveInteractiveAuthorityContext(ctx.db, identity()))).rejects.toEqual(
      new InteractiveAuthorityError('account_inactive'),
    )
  })

  it('C18: sole-owner personal account deletion eligible after close', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await closeWorkspace(backend)

    const session = backend.withIdentity(identity())
    await expect(session.query(readDeletionEligibilityRef, {})).resolves.toEqual({ kind: 'eligible' })
  })

  it('C19: commercial records are not physically deleted', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedBuyerObligation(backend, 'settled')
    await seedCall(backend, { callRef: 'call:w14:c19', state: 'completed' })
    const obligationsBefore = await countObligations(backend)
    const callsBefore = await countCalls(backend)

    await closeWorkspace(backend)

    expect(await countObligations(backend)).toBe(obligationsBefore)
    expect(await countCalls(backend)).toBe(callsBefore)
  })
})

describe('workspaceAccounts transferWorkspaceOwnership (W-14)', () => {
  it('T1: owner transfers to active member with changeKind transfer', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)

    const receipt = await transferWorkspaceOwnership(backend)
    expect(receipt).toMatchObject({
      kind: 'transferred',
      accountRef: ACCOUNT_REF,
      previousOwnershipRef: OWNERSHIP_REF,
    })

    const ownerships = await listOwnerships(backend)
    const current = ownerships.find((row) => row.lifecycle === 'active')
    expect(current).toMatchObject({
      ownerPrincipalRef: TEAMMATE_PRINCIPAL_REF,
      changeKind: 'transfer',
    })
    const account = await readAccount(backend)
    expect(account?.currentOwnershipRef).toBe(current?.ownershipRef)
  })

  it('T2: incumbent kept as active member', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)

    await transferWorkspaceOwnership(backend)

    const memberships = await listMemberships(backend)
    expect(memberships.some((row) =>
      row.memberPrincipalRef === PRINCIPAL_REF && row.lifecycle === 'active')).toBe(true)
  })

  it('T3: existing memberships unchanged aside from ownership', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    const before = await listMemberships(backend)

    await transferWorkspaceOwnership(backend)

    const after = await listMemberships(backend)
    expect(after).toHaveLength(before.length + 1)
    const teammateAfter = after.find((row) => row.membershipRef === TEAMMATE_MEMBERSHIP_REF)
    expect(teammateAfter).toBeDefined()
    expect(teammateAfter?.memberPrincipalRef).toBe(TEAMMATE_PRINCIPAL_REF)
    expect(teammateAfter?.lifecycle).toBe('active')
  })

  it('T4: audit account.workspace.ownership_transferred recorded', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)

    await transferWorkspaceOwnership(backend)

    expect(await listAuditEvents(backend)).toEqual([expect.objectContaining({
      eventType: 'account.workspace.ownership_transferred',
      actorRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
    })])
  })

  it('T5: successor same as incumbent refuses successor_same_as_incumbent', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(
      () => transferWorkspaceOwnership(backend, transferPayload({
        successorPrincipalRef: PRINCIPAL_REF,
      })),
      'successor_same_as_incumbent',
    )
  })

  it('T6: successor without membership refuses successor_not_active_member', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectRefusal(
      () => transferWorkspaceOwnership(backend),
      'successor_not_active_member',
    )
  })

  it('T7: ended successor membership refuses successor_not_active_member', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await backend.run(async (ctx) => {
      const membership = await ctx.db.query('memberships')
        .filter((filter) => filter.eq(filter.field('membershipRef'), TEAMMATE_MEMBERSHIP_REF))
        .unique()
      if (membership === null) throw new Error('membership_missing')
      await ctx.db.patch(membership._id, { lifecycle: 'ended' })
    })

    await expectRefusal(() => transferWorkspaceOwnership(backend), 'successor_not_active_member')
  })

  it('T8: inactive successor principal refuses successor_principal_inactive', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await backend.run(async (ctx) => {
      const principal = await ctx.db.query('principals')
        .filter((filter) => filter.eq(filter.field('principalRef'), TEAMMATE_PRINCIPAL_REF))
        .unique()
      if (principal === null) throw new Error('principal_missing')
      await ctx.db.patch(principal._id, { lifecycle: 'suspended' })
    })

    await expectRefusal(() => transferWorkspaceOwnership(backend), 'successor_principal_inactive')
  })

  it('T9: non-owner caller refuses ownership_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })
    await seedTeammateMembership(backend)

    await expectRefusal(() => transferWorkspaceOwnership(backend), 'ownership_mismatch')
  })

  it('T10: suspended account refuses account_inactive', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { accountLifecycle: 'suspended' })
    await seedTeammateMembership(backend)

    await expectRefusal(() => transferWorkspaceOwnership(backend), 'account_inactive')
  })

  it('T11: payable obligation still allows transfer', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await seedBuyerObligation(backend, 'payable')

    await expect(transferWorkspaceOwnership(backend)).resolves.toMatchObject({ kind: 'transferred' })
  })

  it('T12: after transfer old owner cannot close workspace', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await transferWorkspaceOwnership(backend)

    await expectRefusal(() => closeWorkspace(backend), 'ownership_mismatch')
  })

  it('T13: after transfer successor can close when fences clear', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    await seedTeammateInteractiveAuthority(backend)
    const transferReceipt = await transferWorkspaceOwnership(backend)
    expect(transferReceipt.kind).toBe('transferred')

    const eligibility = await readEligibility(backend, teammateIdentity())
    const receipt = await closeWorkspace(backend, closePayload({
      expectedAccountRevision: eligibility.accountRevision,
      expectedOwnershipRevision: eligibility.ownershipRevision,
      idempotencyRef: idempotencyRef('successor-close'),
    }), teammateIdentity())
    expect(receipt).toMatchObject({ kind: 'closed', accountRef: ACCOUNT_REF })
  })

  it('T14: idempotent replay returns replayed', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    const payload = transferPayload({ idempotencyRef: idempotencyRef('replay-transfer') })

    expect(await transferWorkspaceOwnership(backend, payload)).toMatchObject({ kind: 'transferred' })
    expect(await transferWorkspaceOwnership(backend, payload)).toEqual(expect.objectContaining({ kind: 'replayed' }))
  })

  it('T15: transfer validator rejects fabricated client factor evidence', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedTeammateMembership(backend)
    const forgedPayload = {
      ...transferPayload(),
      factorEvidence: { firstFactorAgeMinutes: 1, secondFactorAgeMinutes: 1 },
    }

    await expect(
      backend.withIdentity(identity()).mutation(transferWorkspaceOwnershipRef, forgedPayload),
    ).rejects.toThrow(/factorEvidence|extra field/i)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import * as networkServer from '@/modules/network-guard/server'
import * as networkPublic from '@/modules/network-guard/public'

import { admitDiscoveredToolFixture } from '../../helpers/discovered-tool-fixture'
import { inspectLiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { readManagedX402InspectionTarget } from '../../../convex/capabilitySupplyCurrentTool'
import { quote } from '../../../convex/capabilityQuotes'
import { projectToolQuoteRefusal } from '@/modules/capability-execution/quote'
import { api, internal } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  buildAgentAccessPolicy,
  createAgentAccessGrant,
  type AgentAccessGrant,
  type AgentAccessPolicy,
} from '@/modules/agent-access/policy'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  COMMERCIAL_POLICY_FAMILIES,
  PACKAGE4_FORMANCE_REQUIREMENTS,
  splitInclusiveAudTax,
} from '@/modules/money/public'
import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from '../../integration/capability-publication-harness'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'

type QuotePrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'production'
  scopes: string[]
  authorityMode: 'spending_policy'
}>

type QuoteAgent = Readonly<{
  principal: QuotePrincipal
  grant: AgentAccessGrant
  policy: AgentAccessPolicy
}>

type PublishedQuoteTool = Readonly<{
  businessId: Id<'businesses'>
  accountRef: string
  publicationRef: string
  publicationRevision: number
  toolRef: string
  offeringId: string
  bindingId: string
  contractRef: Readonly<{
    capabilityId: string
    version: number
    contractDigest: string
  }>
}>

type PreparedSubjects = Readonly<{
  kind: 'prepared'
  accountRef: string
  principalRef: string
  budgetGeneration: number
  budgetUnits: string
  legalCustomerRef: string
  legalCustomerGeneration: number
  legalExposureUnits: string
  policyDigest: string
  policyGeneration: number
  buyerTaxBps: number
  treasury?: Readonly<{
    custodyRef: string
    custodyGeneration: number
    network: string
    targetUnits: string
    evidenceRef: string
    evidenceDigest: string
  }>
}>

const validCustodyEnvironment = Object.freeze({
  AE_X402_CUSTODY_ENABLED: 'true',
  AE_X402_CUSTODY_MAX_ATOMIC: '10000',
  AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
  CDP_API_KEY_ID: 'key-id',
  CDP_API_KEY_SECRET: 'key-secret',
  CDP_WALLET_SECRET: 'wallet-secret',
  AE_X402_CDP_ACCOUNT_NAME: 'agentic-economy-x402',
  AE_X402_CDP_EXPECTED_EVM_ADDRESS: '0x0000000000000000000000000000000000000001',
  AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
  AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
  AE_X402_CDP_POLICY_RULES_DIGEST: `sha256:${'a'.repeat(64)}`,
  AE_X402_CDP_CREDENTIAL_GENERATION: '7',
})
const validCustodyConfiguration = cdpX402CustodyConfigurationFromEnvironment(validCustodyEnvironment)
if (validCustodyConfiguration === undefined) throw new Error('quote_test_custody_configuration_invalid')
const activeCustodyRef = cdpX402CustodyBudgetRef(validCustodyConfiguration, 'production')
const activeCustodyGeneration = validCustodyConfiguration.credentialGeneration
const activeCustodyNetwork = (() => {
  const network = x402PaymentProfileForEnvironment('production')?.network
  if (network === undefined) throw new Error('quote_test_payment_profile_invalid')
  return network
})()

async function withCustodyEnvironment<T>(
  callback: () => Promise<T>,
  overrides: Readonly<Record<string, string | undefined>> = {},
): Promise<T> {
  const environment = { ...validCustodyEnvironment, ...overrides }
  const previous = new Map<string, string | undefined>()
  for (const [name, value] of Object.entries(environment)) {
    previous.set(name, process.env[name])
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    return await callback()
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function recordTreasuryObservation(
  backend: ConvexFixtureBackend,
  suffix: string,
  overrides: Readonly<{
    custodyRef?: string
    custodyGeneration?: number
    network?: string
    totalUnits?: string
    bufferUnits?: string
    observedAt?: number
  }> = {},
): Promise<void> {
  const observedAt = overrides.observedAt ?? 1_800_000_000_000
  const result = await backend.mutation(internal.moneyTreasury.recordObservation, {
    environment: 'production',
    custodyRef: overrides.custodyRef ?? activeCustodyRef,
    custodyGeneration: overrides.custodyGeneration ?? activeCustodyGeneration,
    network: overrides.network ?? activeCustodyNetwork,
    asset: 'USDC',
    exponent: 6,
    observationRef: `treasury-observation:quote:${suffix}`,
    totalUnits: overrides.totalUnits ?? '10000000',
    bufferUnits: overrides.bufferUnits ?? '1000000',
    evidenceRef: `cdp-balance:quote:${suffix}`,
    evidenceDigest: canonicalDigest({ observedAt, suffix }),
    observedAt,
  })
  expect(result).toMatchObject({
    kind: 'accepted',
    replayed: false,
  })
}

async function insertMalformedTreasuryObservation(
  backend: ConvexFixtureBackend,
  suffix: string,
  observedAt: number,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyTreasuryObservations', {
      environment: 'production',
      custodyRef: activeCustodyRef,
      custodyGeneration: activeCustodyGeneration,
      network: activeCustodyNetwork,
      asset: 'USDC',
      exponent: 6,
      observationRef: `treasury-observation:quote:${suffix}`,
      totalUnits: 'not-units',
      bufferUnits: '1000000',
      evidenceRef: `cdp-balance:quote:${suffix}`,
      evidenceDigest: 'not-a-digest',
      observedAt,
      recordedAt: observedAt,
    })
  })
}

function testRef(kind: string, material: string): string {
  return `${kind}_${canonicalDigest({ format: 'quote-handler-test-ref:v1', kind, material }).slice(7, 39)}`
}

async function publishCurrentTool(
  backend: ConvexFixtureBackend,
  suffix: string,
): Promise<PublishedQuoteTool> {
  const { businessId, owner, canonicalAccountRef } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'POST')
  const source = capabilityPublicationInput(businessId, suffix)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, {
      ...source,
      binding: {
        ...source.binding,
        authority: { kind: 'public_upstream' },
      },
    }),
  )
  if ('reason' in published) throw new Error(`quote_publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:quote:readiness:${suffix}`,
    correlationId: `test:quote:${suffix}`,
    reasonCode: 'source_test_readiness',
    evidenceRefs: ['test:quote-readiness'],
  })
  if (observed.kind !== 'observed') throw new Error(`quote_readiness_refused:${observed.reason}`)
  return {
    businessId,
    accountRef: canonicalAccountRef,
    publicationRef: published.publicationRef,
    publicationRevision: published.publicationRevision,
    toolRef: published.toolRef,
    offeringId: published.offeringId,
    bindingId: published.bindingId,
    contractRef: published.contractRef,
  }
}

async function observeHealthyReadiness(
  backend: ConvexFixtureBackend,
  fixture: PublishedQuoteTool,
  suffix: string,
): Promise<void> {
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: fixture.publicationRef,
    expectedRevision: fixture.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:quote:readiness:refresh:${suffix}`,
    correlationId: `test:quote:refresh:${suffix}`,
    reasonCode: 'source_test_readiness',
    evidenceRefs: ['test:quote-readiness-refresh'],
  })
  if (observed.kind !== 'observed') throw new Error(`quote_readiness_refresh_refused:${observed.reason}`)
}

async function seedCommercialPolicies(
  backend: ConvexFixtureBackend,
  suffix: string,
  now: number,
): Promise<void> {
  await backend.run(async (ctx) => {
    for (const [index, family] of COMMERCIAL_POLICY_FAMILIES.entries()) {
      await ctx.db.insert('moneyCommercialPolicies', {
        policyRef: `commercial-policy:quote:${suffix}:${family}:1`,
        family,
        environment: 'production',
        revision: 1,
        lifecycle: 'active',
        effectiveAt: now - 1,
        expiresAt: now + 7 * 24 * 60 * 60 * 1_000,
        evidenceRef: `approval:quote:${suffix}:${family}:1`,
        evidenceDigest: canonicalDigest({ family, index, kind: 'quote-approval' }),
        control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS[family],
        approvedByPrincipalRef: 'principal:quote-approver',
        activeAccountRef: 'account:quote-approver',
        authorityGeneration: 1,
        correlationRef: `correlation:quote:${suffix}:${family}:1`,
        idempotencyRef: `idempotency:quote:${suffix}:${family}:1`,
        commandDigest: canonicalDigest({ family, index, kind: 'quote-policy-command' }),
        activatedAt: now - 1,
        updatedAt: now - 1,
      })
    }
  })
}

async function seedAgent(
  backend: ConvexFixtureBackend,
  owner: Readonly<{ canonicalAccountRef: string }>,
  toolRef: string,
  suffix: string,
  maximumSpendPerCallUnits: string,
): Promise<QuoteAgent> {
  const now = Date.now()
  const principalId = testRef('prn', suffix)
  const credentialId = `credential:quote:${suffix}`
  const grantRef = testRef('grt', suffix)
  const expiresAt = now + 24 * 60 * 60 * 1_000
  const principal: QuotePrincipal = {
    principalId,
    ownerId: owner.canonicalAccountRef,
    credentialId,
    applicationRef: 'agentic-economy',
    environment: 'production',
    scopes: [MARKET_TOOLS_CALL_SCOPE],
    authorityMode: 'spending_policy',
  }
  const amount = (units: string) => ({ currency: 'AUD' as const, units, exponent: 6 as const })
  const policy = buildAgentAccessPolicy({
    environment: 'production',
    currency: 'AUD',
    exponent: 6,
    maximumSpendPerCall: amount(maximumSpendPerCallUnits),
    maximumDailySpend: amount('20000000'),
    maximumMonthlySpend: amount('200000000'),
  })
  const grantDecision = createAgentAccessGrant({
    grantRef,
    principalId,
    ownerId: owner.canonicalAccountRef,
    applicationRef: principal.applicationRef,
    credentialId,
    environment: principal.environment,
    toolAccess: 'all_admitted',
    toolRefs: [],
    authorityMode: principal.authorityMode,
    spendingPolicy: policy,
    lifecycle: 'active',
    generation: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  })
  if (grantDecision.kind !== 'accepted') throw new Error(`quote_grant_refused:${grantDecision.code}`)
  const grant = grantDecision.grant
  const action = {
    actorPrincipalRef: principalId,
    activeAccountRef: owner.canonicalAccountRef,
    correlationRef: `correlation:quote:${suffix}`,
    idempotencyRef: `idempotency:quote:${suffix}`,
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef: testRef('eib', suffix),
      principalRef: principalId,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:quote:${suffix}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('credentials', {
      credentialRef: testRef('crd', suffix),
      bindingRef: testRef('eib', suffix),
      principalRef: principalId,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:quote:${suffix}`,
      revision: 1,
      issuedAt: now,
      expiresAt,
      updatedAt: now,
    })
    await ctx.db.insert('principals', {
      principalRef: principalId,
      kind: 'agent',
      displayName: `Quote agent ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('memberships', {
      membershipRef: testRef('mem', suffix),
      accountRef: owner.canonicalAccountRef,
      memberPrincipalRef: principalId,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: owner.canonicalAccountRef,
      actorPrincipalRef: principalId,
      subjectPrincipalRef: principalId,
      scopes: [...principal.scopes],
      resourceRefs: [toolRef],
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: action,
    })
  })
  const recordedPrincipal = await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, {
    ...principal,
    ownerId: owner.canonicalAccountRef,
    ownerTokenIdentifier: `token:quote:${suffix}`,
    grantGeneration: 1,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    lifecycle: 'active',
    expiresAt,
    seenAt: now,
  })
  if (recordedPrincipal.kind !== 'recorded') throw new Error(`quote_principal_refused:${recordedPrincipal.kind}`)
  const recordedGrant = await backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant })
  if (recordedGrant.kind !== 'recorded') throw new Error(`quote_grant_write_refused:${recordedGrant.kind}`)
  return { principal, grant, policy }
}

async function prepareSubjects(
  backend: ConvexFixtureBackend,
  agent: QuoteAgent,
  toolRef: string,
  input: Record<string, string>,
  suffix: string,
): Promise<PreparedSubjects> {
  const result = await backend.mutation(
    internal.capabilityQuotes.prepareFinancialSubjects,
    await withSourceWrite('protected_action', {
      operationKey: `test:quote:prepare:${suffix}`,
      correlationId: `test:quote:prepare:${suffix}`,
      principal: agent.principal,
      toolRef,
      input,
    }),
  )
  if (result.kind !== 'prepared') throw new Error(`quote_subjects_refused:${result.code}`)
  return result
}

function formanceSnapshot(
  subjects: PreparedSubjects,
  overrides: Readonly<{ accountAvailableUnits?: string; budgetGeneration?: number }> = {},
) {
  return {
    accountRef: subjects.accountRef,
    policyDigest: subjects.policyDigest,
    accountAvailableUnits: overrides.accountAvailableUnits ?? '20000000',
    principalRef: subjects.principalRef,
    budgetGeneration: overrides.budgetGeneration ?? subjects.budgetGeneration,
    budgetAvailableUnits: subjects.budgetUnits,
    legalCustomerRef: subjects.legalCustomerRef,
    legalCustomerGeneration: subjects.legalCustomerGeneration,
    legalExposureAvailableUnits: subjects.legalExposureUnits,
    policyGeneration: subjects.policyGeneration,
    formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
    buyerTaxBps: subjects.buyerTaxBps,
    observedAt: Date.now(),
  }
}

describe('legal customer binding refusals', () => {
  it('forwards legal_customer_required when the legal customer cannot be bound', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-legal-customer'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const owner = { canonicalAccountRef: fixture.accountRef }
    const input = { request: 'Perth' }
    const agent = await seedAgent(backend, owner, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)

    // Rebinding is blocked, so `resolveAndBindLegalCustomer` refuses.
    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('moneyLegalCustomerBindings')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', fixture.accountRef))
        .unique()
      if (binding === null) throw new Error('quote_legal_customer_binding_missing')
      await ctx.db.patch(binding._id, { legalCustomerRef: 'principal:someone-else' })
    })

    const refused = await backend.mutation(
      internal.capabilityQuotes.prepareFinancialSubjects,
      await withSourceWrite('protected_action', {
        operationKey: `test:quote:prepare:${suffix}:blocked`,
        correlationId: `test:quote:prepare:${suffix}:blocked`,
        principal: agent.principal,
        toolRef: fixture.toolRef,
        input,
      }),
    )

    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'commercial_policy_unavailable',
      reason: 'legal_customer_required',
    })

    const projected = projectToolQuoteRefusal({
      toolRef: fixture.toolRef,
      input,
      code: 'commercial_policy_unavailable',
      retryable: true,
      correlationRef: `test:quote:prepare:${suffix}:blocked`,
      ...(refused.kind === 'refused' && refused.reason !== undefined
        ? { reason: refused.reason }
        : {}),
    })
    expect(projected.continuation?.action).toBe('funding.handoff.config')
  })
})

describe('direct Quote handlers', () => {
  it('refuses production Quote preparation and issuance in hosted alpha before upstream actions', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-hosted-alpha'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    const upstream = vi.fn(async () => { throw new Error('production_quote_upstream_released') })
    const handler = (quote as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
    vi.stubEnv('AE_SERVICE_MODE', 'hosted_alpha')
    try {
      const args = { principal: agent.principal, toolRef: fixture.toolRef, input,
        operationKey: `${suffix}:blocked`, correlationId: `${suffix}:blocked` }
      await expect(handler({ runMutation: backend.mutation, runAction: upstream },
        await withSourceWrite('protected_action', args))).resolves.toMatchObject({
        kind: 'refused', code: 'tool_unsupported',
      })
      await expect(backend.mutation(internal.capabilityQuotes.issueQuote, {
        ...args, formance: formanceSnapshot(subjects),
      })).resolves.toMatchObject({ kind: 'refused', code: 'tool_unsupported', retryable: false })
      expect(upstream).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('refuses issuance when the current Tool environment changes after Quote preparation', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-environment-drift'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)

    await backend.run(async ctx => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', fixture.toolRef).eq('disposition', 'current'))
        .unique()
      if (publication === null) throw new Error('quote_drift_publication_missing')
      expect(publication.runtimeEnvironment).toBe('production')
      await ctx.db.patch(publication._id, { runtimeEnvironment: 'sandbox' })
    })

    await expect(backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:issue`, correlationId: `${suffix}:issue`,
      principal: agent.principal, toolRef: fixture.toolRef, input,
      formance: formanceSnapshot(subjects),
    })).resolves.toMatchObject({
      kind: 'refused', code: 'tool_unsupported', retryable: false,
      reason: 'The current Tool environment is not permitted for this purchase.',
    })
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
  })

  it('issues current Quote material, projects policy, refuses stale budgets and per-Call limits, and preserves identities', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-handler'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const owner = { canonicalAccountRef: fixture.accountRef }

    const input = { request: 'Perth' }
    const agent = await seedAgent(backend, owner, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    expect(subjects.budgetGeneration).toBe(agent.grant.generation)
    expect(subjects.budgetUnits).toBe(agent.policy.budget.maximumMonthlySpend.units)
    expect(subjects.policyGeneration).toBe(1)

    const issueCorrelationId = `test:quote:issue:${suffix}`
    const issued = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:issue:${suffix}`,
      correlationId: issueCorrelationId,
      principal: agent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(subjects),
    })
    expect(issued.kind).toBe('committed')
    if (issued.kind !== 'committed') throw new Error(`quote_issue_refused:${issued.code}`)

    const stored = await backend.run(async (ctx) => await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', issued.quoteRef))
      .unique())
    expect(stored).not.toBeNull()
    if (stored === null) throw new Error('quote_persistence_missing')
    expect(stored).toMatchObject({
      quoteRef: issued.quoteRef,
      principalId: agent.principal.principalId,
      accountRef: agent.principal.ownerId,
      credentialId: agent.principal.credentialId,
      toolRef: fixture.toolRef,
      toolVersion: issued.toolVersion,
      toolMaterialDigest: expect.any(String),
      currentToolDigest: expect.any(String),
      budgetPolicyRef: agent.policy.budget.budgetPolicyRef,
      budgetGeneration: agent.policy.budget.generation,
      maximumSpendPerCallUnits: agent.policy.budget.maximumSpendPerCall.units,
      state: 'issued',
    })
    expect(stored.commercialPolicyDigest).toBe(subjects.policyDigest)

    const sale = splitInclusiveAudTax(stored.decisionAudUnits, subjects.buyerTaxBps)
    if (sale === undefined) throw new Error('quote_tax_split_missing')
    const evidenceMaterial = {
      format: 'ae.operation-commitment:v1',
      principalId: agent.principal.principalId,
      accountRef: agent.principal.ownerId,
      credentialId: agent.principal.credentialId,
      grantRef: agent.grant.grantRef,
      grantGeneration: agent.grant.generation,
      grantPolicyDigest: agent.grant.spendingPolicyDigest,
      operationRef: fixture.toolRef,
      operationRevision: stored.toolVersion,
      operationMaterialDigest: stored.toolMaterialDigest,
      currentOperationDigest: stored.currentToolDigest,
      inputDigest: canonicalDigest(input),
      pricingDigest: stored.pricingDigest,
      decisionAudUnits: stored.decisionAudUnits,
      budgetPolicyRef: agent.policy.budget.budgetPolicyRef,
      budgetGeneration: agent.policy.budget.generation,
      maximumSpendPerInvocationUnits: agent.policy.budget.maximumSpendPerCall.units,
      formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      legalCustomerRef: subjects.legalCustomerRef,
      legalCustomerGeneration: subjects.legalCustomerGeneration,
      buyerRevenueUnits: sale.revenueUnits,
      buyerTaxUnits: sale.taxUnits,
      accountAvailableUnits: '20000000',
      budgetAvailableUnits: subjects.budgetUnits,
      legalExposureAvailableUnits: subjects.legalExposureUnits,
      commercialPolicyDigest: subjects.policyDigest,
      expiresAt: stored.expiresAt,
    }
    const expectedEvidenceDigest = canonicalDigest(evidenceMaterial)
    const expectedQuoteRef = `operation-commitment:v1:${canonicalDigest({
      ...evidenceMaterial,
      createdAt: stored.createdAt,
      correlationId: issueCorrelationId,
    }).slice(7)}`
    expect(stored.evidenceDigest).toBe(expectedEvidenceDigest)
    expect(issued.evidenceDigest).toBe(expectedEvidenceDigest)
    expect(stored.quoteRef).toBe(expectedQuoteRef)

    const liveRead = await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal,
      quoteRef: issued.quoteRef,
      idempotencyKey: `invoke:${issued.quoteRef}`,
      now: stored.expiresAt - 1,
    })
    expect(liveRead).toEqual({
      toolRef: fixture.toolRef,
      input,
      decisionPrice: issued.price,
      quoteRef: issued.quoteRef,
      evidenceDigest: expectedEvidenceDigest,
    })
    const expiredRead = await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal,
      quoteRef: issued.quoteRef,
      idempotencyKey: `invoke:${issued.quoteRef}`,
      now: stored.expiresAt,
    })
    expect(expiredRead).toBeNull()

    const replayCallRef = `call:replay:${suffix}`
    const replayResult = { kind: 'refused' as const, toolRef: fixture.toolRef, code: 'operation_not_ready' as const, retryable: false }
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityCalls', {
        callRef: replayCallRef, quoteRef: stored.quoteRef,
        principalId: stored.principalId, ownerId: stored.accountRef, credentialId: stored.credentialId,
        applicationRef: stored.applicationRef, environment: stored.environment, toolRef: stored.toolRef,
        idempotencyKey: `invoke:${issued.quoteRef}`, grantRef: stored.grantRef,
        grantGeneration: stored.grantGeneration, policyDigest: stored.grantPolicyDigest,
        grantExpiresAt: agent.grant.expiresAt, inputDigest: stored.inputDigest,
        requestDigest: canonicalDigest({ replay: suffix }), state: 'refused', result: replayResult,
        createdAt: Date.now(), updatedAt: Date.now(),
      })
      await ctx.db.patch(stored._id, { state: 'consumed', consumedCallRef: replayCallRef,
        expiresAt: Date.now() - 1, x402RequirementDigest: canonicalDigest('old-provider-requirement') })
    })
    expect(await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal, quoteRef: issued.quoteRef,
      idempotencyKey: `invoke:${issued.quoteRef}`, now: Date.now(),
    })).toMatchObject({ consumedCallRef: replayCallRef })
    expect(await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal, quoteRef: issued.quoteRef,
      idempotencyKey: 'another-key', now: Date.now(),
    })).toBeNull()
    const send = vi.spyOn(networkServer, 'sendGuardedHttpRequest').mockRejectedValue(new Error('provider_unavailable'))
    try {
      expect(await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
        operationKey: `replay:${suffix}`, correlationId: `replay:${suffix}`,
        principal: agent.principal, quoteRef: issued.quoteRef, idempotencyKey: `invoke:${issued.quoteRef}`,
      }))).toEqual(replayResult)
      await backend.run(async ctx => {
        const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', replayCallRef)).unique()
        if (call === null) throw new Error('replay_call_missing')
        await ctx.db.patch(call._id, { state: 'pending', result: undefined })
      })
      expect(await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
        operationKey: `replay:pending:${suffix}`, correlationId: `replay:pending:${suffix}`,
        principal: agent.principal, quoteRef: issued.quoteRef, idempotencyKey: `invoke:${issued.quoteRef}`,
      }))).toEqual({ kind: 'pending', callRef: replayCallRef, toolRef: fixture.toolRef, retryAfterMs: 1000 })
      expect(send).not.toHaveBeenCalled()
    } finally { send.mockRestore() }

    const budgetGenerationMismatch = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:budget-generation:${suffix}`,
      correlationId: `test:quote:budget-generation:${suffix}`,
      principal: agent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(subjects, { budgetGeneration: subjects.budgetGeneration + 1 }),
    })
    expect(budgetGenerationMismatch).toMatchObject({
      kind: 'refused',
      code: 'inspection_unavailable',
      retryable: true,
    })

    const fundingRefusal = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:funding:${suffix}`,
      correlationId: `test:quote:funding:${suffix}`,
      principal: agent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(subjects, { accountAvailableUnits: '0' }),
    })
    expect(fundingRefusal).toMatchObject({ kind: 'refused', code: 'insufficient_balance' })
    if (fundingRefusal.kind !== 'refused') throw new Error('quote_funding_refusal_missing')
    if (fundingRefusal.continuation?.action !== 'funding.handoff.create') {
      throw new Error('quote_funding_continuation_missing')
    }
    const expectedFundingIdempotencyKey = `funding:${canonicalDigest({
      format: 'ae.operation-inspect-funding:v1',
      principalRef: agent.principal.principalId,
      operationRef: fixture.toolRef,
      inputDigest: canonicalDigest(input),
      exactPriceUnits: issued.price.units,
      currentBalanceUnits: '0',
      budgetGeneration: agent.grant.generation,
    }).slice(7)}`
    expect(fundingRefusal.continuation.input.idempotencyKey).toBe(expectedFundingIdempotencyKey)

    const lowBudgetAgent = await seedAgent(
      backend,
      owner,
      fixture.toolRef,
      `${suffix}-low-call-limit`,
      '100',
    )
    const lowBudgetSubjects = await prepareSubjects(
      backend,
      lowBudgetAgent,
      fixture.toolRef,
      input,
      `${suffix}-low-call-limit`,
    )
    const perCallRefusal = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:per-call:${suffix}`,
      correlationId: `test:quote:per-call:${suffix}`,
      principal: lowBudgetAgent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(lowBudgetSubjects),
    })
    expect(perCallRefusal).toMatchObject({
      kind: 'refused',
      code: 'budget_exceeded',
      reason: 'per_call_limit',
    })
    await backend.run(async ctx => {
      const tax = await ctx.db.query('moneyCommercialPolicies')
        .withIndex('by_policyRef', q => q.eq('policyRef', `commercial-policy:quote:${suffix}:tax:1`)).unique()
      if (tax === null) throw new Error('tax_policy_missing')
      await ctx.db.patch(tax._id, { control: { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, callTaxBps: 1000 } })
    })
    expect(await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:policy-drift:${suffix}`, correlationId: `test:quote:policy-drift:${suffix}`,
      principal: agent.principal, toolRef: fixture.toolRef, input, formance: formanceSnapshot(subjects),
    })).toMatchObject({ kind: 'refused', code: 'inspection_unavailable', retryable: true })
  })

  it('authorizes an unprobed discovered request, prices its live requirement and pins the challenge and rate', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await admitDiscoveredToolFixture(backend, { withoutExample: true })
    const owner = await publishedBusinessOwner(backend, 'managed-quote-buyer')
    await seedCommercialPolicies(backend, 'managed-quote', Date.now())
    const agent = await seedAgent(backend, owner, fixture.toolRef, 'managed-quote', '20000000')
    const input = { from: 'UTC', to: 'America/New_York', time: '12:00' }
    const preparationArgs = await withSourceWrite('protected_action', {
      operationKey: 'managed-quote:invalid', correlationId: 'managed-quote:invalid',
      principal: agent.principal, toolRef: fixture.toolRef, input: { invalid: 'input' },
    })
    const upstream = vi.fn(async () => { throw new Error('invalid_request_released') })
    const handler = (quote as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
    const refused = await handler({ runMutation: backend.mutation, runAction: upstream }, preparationArgs)
    expect(refused).toMatchObject({ kind: 'refused', code: 'input_invalid' })
    expect(upstream).not.toHaveBeenCalled()
    const unauthorized = await handler({ runMutation: backend.mutation, runAction: upstream }, await withSourceWrite('protected_action', {
      ...preparationArgs, operationKey: 'managed-quote:unauthorized', correlationId: 'managed-quote:unauthorized',
      principal: { ...agent.principal, credentialId: 'unknown-credential' }, input,
    }))
    expect(unauthorized).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    expect(upstream).not.toHaveBeenCalled()

    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, 'managed-quote')
    expect(subjects.buyerTaxBps).toBe(0)
    const targetJson = await backend.run(async (ctx) => JSON.stringify(await readManagedX402InspectionTarget(ctx, fixture.toolRef)))
    const target = targetJson === undefined ? undefined : JSON.parse(targetJson) as NonNullable<Awaited<ReturnType<typeof readManagedX402InspectionTarget>>>
    expect(target).toBeDefined()
    if (target === undefined) throw new Error('inspection_target_missing')
    const challenge = {
      ...structuredClone(fixture.paymentRequired),
      accepts: fixture.paymentRequired.accepts.map(requirement => {
        if (requirement.network !== activeCustodyNetwork) throw new Error('managed_quote_fixture_network_mismatch')
        return { ...requirement, network: activeCustodyNetwork, amount: '250' }
      }),
    }
    const live = await inspectLiveX402Requirement(target, input, {
      validatePublicTarget: async () => true,
      send: async () => new Response(null, { status: 402, headers: { 'payment-required': encodePaymentRequiredHeader(challenge) } }),
    })
    expect(live.kind).toBe('observed')
    if (live.kind !== 'observed') throw new Error('live_requirement_missing')
    expect(await backend.mutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, {
      toolRef: fixture.toolRef, targetDigest: target.targetDigest,
      requirementDigest: live.requirement.requirementDigest, observedAt: live.requirement.observedAt,
    })).toBe(true)
    const referenceRate = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.3854', fetchedAt: Date.now() }
    const issued = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: 'managed-quote:issue', correlationId: 'managed-quote:issue',
      principal: agent.principal, toolRef: fixture.toolRef, input, liveX402Requirement: live.requirement, referenceRate,
      formance: { ...formanceSnapshot(subjects), treasury: {
        custodyRef: activeCustodyRef, custodyGeneration: activeCustodyGeneration,
        network: activeCustodyNetwork, availableUnits: '10000000',
        evidenceRef: 'treasury:managed-quote', evidenceDigest: canonicalDigest({ treasury: 'managed-quote' }),
      } },
    })
    expect(issued).toMatchObject({ kind: 'committed', price: { units: '347' }, sourceRequirement: { units: '250' } })
    if (issued.kind !== 'committed') throw new Error(`managed_quote_refused:${issued.code}`)
    const stored = await backend.run((ctx) => ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', issued.quoteRef)).unique())
    expect(stored).toMatchObject({ sourceUsdcUnits: '250', decisionAudUnits: '347', buyerRevenueUnits: '347', buyerTaxUnits: '0', x402PaymentRequiredJson: live.requirement.paymentRequiredJson })
    expect(JSON.parse(stored!.rateEvidenceJson!).referenceRate).toEqual(referenceRate)
  })

  it.each(['revocation', 'withdrawal'] as const)('rechecks %s after inspection preparation and before releasing input', async change => {
    const backend = convexTestWithMarketComponents()
    const fixture = await admitDiscoveredToolFixture(backend, { withoutExample: true })
    const owner = await publishedBusinessOwner(backend, `inspection-${change}`)
    await seedCommercialPolicies(backend, `inspection-${change}`, Date.now())
    const agent = await seedAgent(backend, owner, fixture.toolRef, `inspection-${change}`, '20000000')
    const input = { from: 'UTC', to: 'America/New_York', time: '12:00' }
    await prepareSubjects(backend, agent, fixture.toolRef, input, `inspection-${change}`)
    const send = vi.spyOn(networkServer, 'sendGuardedHttpRequest').mockRejectedValue(new Error('unauthorized_input_released'))
    const targetCheck = vi.spyOn(networkPublic, 'isPublicHttpTarget').mockImplementation(async () => {
      await backend.run(async ctx => {
        if (change === 'revocation') {
          const credential = await ctx.db.query('credentials').withIndex('by_credentialRef', q => q.eq('credentialRef', testRef('crd', `inspection-${change}`))).unique()
          if (credential === null) throw new Error('inspection_credential_missing')
          await ctx.db.patch(credential._id, { lifecycle: 'revoked' })
        } else {
          const publication = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', fixture.toolRef).eq('disposition', 'current')).unique()
          if (publication === null) throw new Error('inspection_publication_missing')
          await ctx.db.patch(publication._id, { disposition: 'withdrawn' })
        }
      })
      return true
    })
    try {
      expect(await backend.action(internal.capabilityCallLiveX402.inspect, {
        principal: agent.principal, toolRef: fixture.toolRef, input,
      })).toEqual({ kind: 'refused' })
      expect(targetCheck).toHaveBeenCalledOnce()
      expect(send).not.toHaveBeenCalled()
    } finally { targetCheck.mockRestore(); send.mockRestore() }
  })

  it('selects the newest observation for the configured active custody', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-same-custody'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-old`, {
      totalUnits: '10000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_000,
    })
    await recordTreasuryObservation(backend, `${suffix}-new`, {
      totalUnits: '20000000',
      bufferUnits: '3000000',
      observedAt: 1_800_000_000_001,
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toMatchObject({
      custodyRef: activeCustodyRef,
      custodyGeneration: activeCustodyGeneration,
      network: activeCustodyNetwork,
      targetUnits: '17000000',
      evidenceRef: `cdp-balance:quote:${suffix}-new`,
    })
  })

  it('ignores old generations and other custody rows without an environment fallback', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-identity-filter'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-active`, {
      totalUnits: '10000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_000,
    })
    await recordTreasuryObservation(backend, `${suffix}-old-generation`, {
      custodyGeneration: activeCustodyGeneration - 1,
      totalUnits: '90000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_002,
    })
    await recordTreasuryObservation(backend, `${suffix}-other-custody`, {
      custodyRef: 'custody:quote:other',
      totalUnits: '80000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_003,
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toMatchObject({
      targetUnits: '9000000',
      evidenceRef: `cdp-balance:quote:${suffix}-active`,
    })
  })

  it('fails closed when no observation matches the active custody tuple', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-no-active-match'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-old-generation`, {
      custodyGeneration: activeCustodyGeneration - 1,
      observedAt: 1_800_000_000_000,
    })
    await recordTreasuryObservation(backend, `${suffix}-other-custody`, {
      custodyRef: 'custody:quote:other',
      observedAt: 1_800_000_000_001,
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toBeUndefined()
  })

  it.each([
    ['missing custody configuration', { AE_X402_CUSTODY_ENABLED: undefined }],
    ['invalid custody generation', { AE_X402_CDP_CREDENTIAL_GENERATION: 'not-a-number' }],
  ] as const)('fails closed with %s', async (_label, overrides) => {
    const backend = convexTestWithMarketComponents()
    const suffix = `treasury-invalid-config-${_label.replaceAll(' ', '-')}`
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, suffix)

    const subjects = await withCustodyEnvironment(
      () => prepareSubjects(backend, agent, fixture.toolRef, { request: 'Perth' }, suffix),
      overrides,
    )
    expect(subjects.treasury).toBeUndefined()
  })

  it.each([
    ['malformed newest evidence', 'malformed'],
    ['negative newest capacity', 'negative'],
  ] as const)('does not fall back from %s to older evidence', async (_label, kind) => {
    const backend = convexTestWithMarketComponents()
    const suffix = `treasury-no-fallback-${kind}`
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-old`, {
      totalUnits: '10000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_000,
    })
    if (kind === 'malformed') {
      await insertMalformedTreasuryObservation(backend, `${suffix}-new`, 1_800_000_000_001)
    } else {
      await recordTreasuryObservation(backend, `${suffix}-new`, {
        totalUnits: '100',
        bufferUnits: '200',
        observedAt: 1_800_000_000_001,
      })
    }

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toBeUndefined()
  })

  it('rejects an active observation with an unexpected payment network', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-network-mismatch'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, suffix, {
      network: 'eip155:1',
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toBeUndefined()
  })
})

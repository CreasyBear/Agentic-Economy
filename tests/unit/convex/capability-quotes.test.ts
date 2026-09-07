import { describe, expect, it } from 'vitest'

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
}>

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

describe('direct Quote handlers', () => {
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
  })
})

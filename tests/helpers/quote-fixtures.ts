import { expect } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { MutationCtx } from '../../convex/_generated/server'
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
  spendingPeriodAdjustmentReference,
  type SpendingPeriods,
} from '@/modules/money/public'
import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import {
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from './convex-fixtures'
import { withSourceWrite } from './source-write-admission'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from '../integration/capability-publication-harness'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from './commercial-policy-fixtures'

export type QuotePrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'production'
  scopes: string[]
  authorityMode: 'spending_policy'
}>

export type QuoteAgent = Readonly<{
  principal: QuotePrincipal
  grant: AgentAccessGrant
  policy: AgentAccessPolicy
}>

export type PublishedQuoteTool = Readonly<{
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

export type PreparedSubjects = Readonly<{
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
  spendingPeriods: SpendingPeriods
  treasury?: Readonly<{
    custodyRef: string
    custodyGeneration: number
    network: string
    targetUnits: string
    evidenceRef: string
    evidenceDigest: string
  }>
}>

export const validCustodyEnvironment = Object.freeze({
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
export const validCustodyConfiguration = cdpX402CustodyConfigurationFromEnvironment(validCustodyEnvironment)
if (validCustodyConfiguration === undefined) throw new Error('quote_test_custody_configuration_invalid')
export const activeCustodyRef = cdpX402CustodyBudgetRef(validCustodyConfiguration, 'production')
export const activeCustodyGeneration = validCustodyConfiguration.credentialGeneration
export const activeCustodyNetwork = (() => {
  const network = x402PaymentProfileForEnvironment('production')?.network
  if (network === undefined) throw new Error('quote_test_payment_profile_invalid')
  return network
})()

export async function withCustodyEnvironment<T>(
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

export async function recordTreasuryObservation(
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

export async function insertMalformedTreasuryObservation(
  backend: ConvexFixtureBackend,
  suffix: string,
  observedAt: number,
): Promise<void> {
  await backend.run(async (ctx: MutationCtx) => {
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

export function testRef(kind: string, material: string): string {
  return `${kind}_${canonicalDigest({ format: 'quote-handler-test-ref:v1', kind, material }).slice(7, 39)}`
}

export async function publishCurrentTool(
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

export async function observeHealthyReadiness(
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

export async function seedCommercialPolicies(
  backend: ConvexFixtureBackend,
  suffix: string,
  now: number,
): Promise<void> {
  await backend.run(async (ctx: MutationCtx) => {
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

export async function seedAgent(
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
  await backend.run(async (ctx: MutationCtx) => {
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

export async function prepareSubjects(
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
  for (const command of result.spendingPeriodCommands) {
    const transactionRefs = command.previousLimitUnits === command.targetLimitUnits
      ? []
      : [spendingPeriodAdjustmentReference(command)]
    await backend.mutation(internal.agentSpendingPeriods.acknowledge, {
      command,
      transactionRefs,
    })
  }
  const spendingPeriods = result.spendingPeriods
  if (spendingPeriods === undefined) throw new Error('quote_period_snapshot_missing')
  return { ...result, spendingPeriods }
}

export function formanceSnapshot(
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
    spendingPeriods: subjects.spendingPeriods,
    dailyPeriodAvailableUnits: '20000000',
    monthlyPeriodAvailableUnits: '20000000',
    dailyPeriodObservedAt: Date.now(),
    monthlyPeriodObservedAt: Date.now(),
    observedAt: Date.now(),
  }
}

import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { action, env, internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { readCurrentPublishedTool } from './capabilitySupplyCurrentTool'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'
import { principalAndSourceArgs, principalValue } from './lib/callLifecycle/contracts'
import { resolveCurrentAgentAuthority } from './lib/callLifecycle/authorityHandlers'
import { inspectLiveX402RequirementRef } from './lib/liveX402RequirementRef'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import {
  materializeRuntimePublishedTool,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { currentToolDigest } from '@/modules/capability-execution/current-tool-quote'
import {
  TOOL_MARKET_DESCRIBE_PATH,
  TOOL_MARKET_LIST_PATH,
  TOOL_MARKET_SEARCH_PATH,
} from '@/modules/common/market-tool-paths'
import {
  normalizeStoredAgentAccessGrant,
  projectAgentAccessGrant,
} from '@/modules/agent-access/policy'
import {
  audFundingPolicyFromCommercialControls,
  normalizePricingConfig,
  PACKAGE4_FORMANCE_REQUIREMENTS,
  quoteManagedX402BuyerAud,
  splitInclusiveAudTax,
} from '@/modules/money/public'
import { FUNDING_HANDOFF_CREATE_PATH } from '@/modules/money/funding-handoff.actions'
import { jsonObject } from '@/modules/capability-execution/convex'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import {
  TOOL_QUOTE_PATH,
  projectToolQuoteRefusal,
  type ToolQuoteRefusalCode,
} from '@/modules/capability-execution/quote'
import { resolveAndBindLegalCustomer } from './lib/moneyLegalCustomer'
import { toolProviderRouteabilityIsFrozen } from './lib/providerOffboardingFreeze'

const quoteRefusalCode = v.union(
  v.literal('tool_not_found'),
  v.literal('tool_not_current'),
  v.literal('tool_not_ready'),
  v.literal('tool_unsupported'),
  v.literal('input_invalid'),
  v.literal('grant_not_found'),
  v.literal('budget_exceeded'),
  v.literal('insufficient_balance'),
  v.literal('treasury_capacity_unavailable'),
  v.literal('pricing_setup_required'),
  v.literal('commercial_policy_unavailable'),
  v.literal('inspection_unavailable'),
)
const exactAud = v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) })
const exactUsdc = v.object({ currency: v.literal('USDC'), units: v.string(), exponent: v.literal(6) })
const quoteContinuation = v.union(
  v.object({
    action: v.literal('registry.tools.list'), method: v.literal('POST'),
    path: v.literal(TOOL_MARKET_LIST_PATH), input: v.object({ limit: v.literal(10) }),
  }),
  v.object({
    action: v.literal('registry.tools.search'), method: v.literal('POST'),
    path: v.literal(TOOL_MARKET_SEARCH_PATH), input: v.object({ query: v.string(), limit: v.literal(10) }),
  }),
  v.object({
    action: v.literal('registry.tools.describe'), method: v.literal('POST'),
    path: v.literal(TOOL_MARKET_DESCRIBE_PATH), input: v.object({ toolRef: v.string() }),
  }),
  v.object({
    action: v.literal('tool.quote'), method: v.literal('POST'),
    path: v.literal(TOOL_QUOTE_PATH), input: v.object({ toolRef: v.string(), input: jsonObject }),
    retryAfterMs: v.union(v.literal(5000), v.literal(30000)),
  }),
  v.object({
    action: v.literal('funding.handoff.create'), method: v.literal('POST'),
    path: v.literal(FUNDING_HANDOFF_CREATE_PATH),
    input: v.object({ principalAmount: exactAud, idempotencyKey: v.string() }),
  }),
)
const requiredAction = v.object({
  action: v.string(),
  blockedCapabilities: v.array(v.literal('tool.call')),
  cta: v.union(v.literal('/agent-access'), v.literal('/support'), v.null()),
  ctaLabel: v.string(), description: v.string(), iconUrl: v.null(),
  status: v.union(v.literal('required'), v.literal('pending')), title: v.string(),
})
const quoteResult = v.union(
  v.object({
    kind: v.literal('committed'),
    quoteRef: v.string(),
    toolRef: v.string(),
    toolVersion: v.number(),
    expiresAt: v.number(),
    normalizedInput: jsonObject,
    price: exactAud,
    sourceRequirement: v.optional(exactUsdc),
    account: v.object({ accountRef: v.string(), available: exactAud }),
    budget: v.object({ principalRef: v.string(), maximumPerCall: exactAud }),
    policyRefs: v.array(v.string()),
    evidenceDigest: v.string(),
    continuation: v.object({
      action: v.literal('tool.call'),
      method: v.literal('POST'),
      path: v.literal('/api/v1/tools/call'),
      input: v.object({ quoteRef: v.string(), idempotencyKey: v.string() }),
    }),
  }),
  v.object({
    kind: v.literal('refused'),
    toolRef: v.string(),
    code: quoteRefusalCode,
    reason: v.optional(v.string()),
    retryable: v.boolean(),
    correlationRef: v.string(),
    continuation: v.optional(quoteContinuation),
    requiredActions: v.optional(v.array(requiredAction)),
  }),
)

type QuoteResult = Infer<typeof quoteResult>
type QuoteArgs = Readonly<{
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
  principal: Infer<typeof principalValue>
  toolRef: string
  input: Record<string, JsonValue>
  liveX402Requirement?: LiveX402Requirement
}>

const formanceFinancialSnapshot = v.object({
  accountRef: v.string(),
  accountAvailableUnits: v.string(),
  principalRef: v.string(),
  budgetGeneration: v.number(),
  budgetAvailableUnits: v.string(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  legalExposureAvailableUnits: v.string(),
  policyGeneration: v.number(),
  formanceSchemaVersion: v.string(),
  buyerTaxBps: v.number(),
  observedAt: v.number(),
  treasury: v.optional(v.object({
    custodyRef: v.string(),
    custodyGeneration: v.number(),
    network: v.string(),
    availableUnits: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
  })),
})

const financialSubjectsResult = v.union(
  v.object({
    kind: v.literal('prepared'),
    accountRef: v.string(),
    principalRef: v.string(),
    budgetGeneration: v.number(),
    budgetUnits: v.string(),
    legalCustomerRef: v.string(),
    legalCustomerGeneration: v.number(),
    legalExposureUnits: v.string(),
    policyDigest: v.string(),
    policyGeneration: v.number(),
    buyerTaxBps: v.number(),
    financialMode: v.union(v.literal('none'), v.literal('formance')),
    treasury: v.optional(v.object({
      custodyRef: v.string(),
      custodyGeneration: v.number(),
      network: v.string(),
      targetUnits: v.string(),
      evidenceRef: v.string(),
      evidenceDigest: v.string(),
    })),
  }),
  v.object({ kind: v.literal('refused'), code: quoteRefusalCode, reason: v.optional(v.string()) }),
)

type FinancialSubjectsResult = Infer<typeof financialSubjectsResult>

const TREASURY_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const TREASURY_UNITS_PATTERN = /^(?:0|[1-9]\d{0,15})$/u

function cdpX402CustodyEnvironment(): StringEnvironment {
  return {
    CDP_API_KEY_ID: env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: env.CDP_API_KEY_SECRET,
    CDP_WALLET_SECRET: env.CDP_WALLET_SECRET,
    AE_X402_CDP_ACCOUNT_NAME: env.AE_X402_CDP_ACCOUNT_NAME,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: env.AE_X402_CDP_EXPECTED_EVM_ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: env.AE_X402_CDP_ACCOUNT_POLICY_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: env.AE_X402_CDP_PROJECT_POLICY_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: env.AE_X402_CDP_POLICY_RULES_DIGEST,
    AE_X402_CDP_CREDENTIAL_GENERATION: env.AE_X402_CDP_CREDENTIAL_GENERATION,
    AE_X402_CUSTODY_ENABLED: env.AE_X402_CUSTODY_ENABLED,
    AE_X402_CUSTODY_MAX_ATOMIC: env.AE_X402_CUSTODY_MAX_ATOMIC,
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: env.AE_X402_CUSTODY_DAILY_MAX_ATOMIC,
  }
}

function treasurySpendableUnits(
  observation: Doc<'moneyTreasuryObservations'>,
  expected: Readonly<{
    environment: 'sandbox' | 'production'
    custodyRef: string
    custodyGeneration: number
    network: string
  }>,
): string | undefined {
  if (
    observation.environment !== expected.environment
    || observation.custodyRef !== expected.custodyRef
    || observation.custodyGeneration !== expected.custodyGeneration
    || observation.network !== expected.network
    || observation.asset !== 'USDC'
    || observation.exponent !== 6
    || !TREASURY_REF_PATTERN.test(observation.custodyRef)
    || !TREASURY_REF_PATTERN.test(observation.observationRef)
    || !TREASURY_REF_PATTERN.test(observation.evidenceRef)
    || !isCanonicalDigest(observation.evidenceDigest)
    || !TREASURY_UNITS_PATTERN.test(observation.totalUnits)
    || !TREASURY_UNITS_PATTERN.test(observation.bufferUnits)
  ) return undefined
  try {
    const spendableUnits = BigInt(observation.totalUnits) - BigInt(observation.bufferUnits)
    return spendableUnits > 0n ? spendableUnits.toString() : undefined
  } catch {
    return undefined
  }
}

const refuse = (
  args: Pick<QuoteArgs, 'toolRef' | 'input' | 'correlationId'>,
  code: ToolQuoteRefusalCode,
  retryable: boolean,
  options: Readonly<{
    reason?: string
    capabilityId?: string
    funding?: Readonly<{
      principalAmount: { currency: 'AUD'; units: string; exponent: 6 }
      idempotencyKey: string
    }>
  }> = {},
): QuoteResult => projectToolQuoteRefusal({
  toolRef: args.toolRef,
  input: args.input,
  code,
  retryable,
  correlationRef: args.correlationId,
  ...options,
}) as unknown as QuoteResult

function toolPricing(tool: PublishedTool, now: number) {
  const normalized = normalizePricingConfig(tool.pricingConfig)
  if (normalized.kind === 'invalid') return undefined
  if (normalized.config.kind === 'fixed_aud') {
    return {
      kind: 'ready' as const,
      config: normalized.config,
      price: { currency: 'AUD' as const, exponent: 6 as const, units: normalized.config.amountUnits },
    }
  }
  const sourceRequirement = {
    currency: 'USDC' as const,
    exponent: 6 as const,
    units: normalized.config.sourceRequirement.atomicUnits,
  }
  const quoted = quoteManagedX402BuyerAud({
    environment: tool.runtimeEnvironment,
    requiredUsdcAtomicUnits: sourceRequirement.units,
    observedAt: now,
  })
  return quoted.kind === 'refused'
    ? quoted
    : {
        kind: 'ready' as const,
        config: normalized.config,
        price: quoted.evidence.sourceAmount,
        sourceRequirement,
        rateEvidence: quoted.evidence,
      }
}

async function prepareFinancialSubjectsHandler(
  ctx: MutationCtx,
  args: QuoteArgs,
): Promise<FinancialSubjectsResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'protected_action')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'inspection_unavailable' }
  const now = Date.now()
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', toolRef: args.toolRef },
  )
  if (authority === null) return { kind: 'refused', code: 'grant_not_found' }
  if (await toolProviderRouteabilityIsFrozen(ctx, args.toolRef)) {
    return { kind: 'refused', code: 'tool_not_ready' }
  }
  const operation = await readCurrentPublishedTool(ctx, args.toolRef, now)
  if (operation === undefined) return { kind: 'refused', code: 'tool_not_found' }
  const pricing = toolPricing(operation, now)
  if (pricing === undefined) return { kind: 'refused', code: 'tool_unsupported' }
  if (pricing.kind === 'refused') return { kind: 'refused', code: 'pricing_setup_required' }
  const grantRow = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authority.grantRef))
    .unique()
  const grant = grantRow === null ? undefined : normalizeStoredAgentAccessGrant(grantRow as never)
  if (grant === undefined || grant.generation !== authority.grantGeneration) {
    return { kind: 'refused', code: 'grant_not_found' }
  }
  const grantReadback = projectAgentAccessGrant(grant)
  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: authority.principal.environment,
    now,
    ...(authority.principal.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') return { kind: 'refused', code: 'commercial_policy_unavailable' }
  const legalCustomer = await resolveAndBindLegalCustomer(ctx, authority.principal.ownerId, now)
  if (legalCustomer.kind === 'refused') return { kind: 'refused', code: 'commercial_policy_unavailable' }
  const binding = await ctx.db.query('moneyLegalCustomerBindings')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', authority.principal.ownerId))
    .unique()
  if (binding === null || binding.legalCustomerRef !== legalCustomer.legalCustomerRef) {
    return { kind: 'refused', code: 'commercial_policy_unavailable' }
  }
  const environment = authority.principal.environment
  const custodyConfiguration = cdpX402CustodyConfigurationFromEnvironment(
    cdpX402CustodyEnvironment(),
  )
  const paymentProfile = x402PaymentProfileForEnvironment(environment)
  const custodyRef = custodyConfiguration === undefined || paymentProfile === undefined
    ? undefined
    : cdpX402CustodyBudgetRef(custodyConfiguration, environment)
  const custodyGeneration = custodyConfiguration?.credentialGeneration
  const observation = custodyRef === undefined || custodyGeneration === undefined
    ? undefined
    : (await ctx.db.query('moneyTreasuryObservations')
        .withIndex('by_custody_and_observedAt', (query) => query
          .eq('environment', environment)
          .eq('custodyRef', custodyRef)
          .eq('custodyGeneration', custodyGeneration))
        .order('desc')
        .take(1))[0]
  const treasuryTarget = observation === undefined
    || custodyRef === undefined
    || custodyGeneration === undefined
    || paymentProfile === undefined
    ? undefined
    : treasurySpendableUnits(observation, {
        environment,
        custodyRef,
        custodyGeneration,
        network: paymentProfile.network,
      })
  const fundingPolicy = audFundingPolicyFromCommercialControls(policy.controls)
  const monthly = grantReadback.budget.maximumMonthlySpend
  if (monthly.currency !== 'AUD' || monthly.exponent !== 6) {
    return { kind: 'refused', code: 'budget_exceeded' }
  }
  return {
    kind: 'prepared',
    accountRef: authority.principal.ownerId,
    principalRef: authority.principal.principalId,
    budgetGeneration: grantReadback.budget.generation,
    budgetUnits: monthly.units,
    legalCustomerRef: legalCustomer.legalCustomerRef,
    legalCustomerGeneration: binding.version,
    legalExposureUnits: fundingPolicy.legalCustomerMaximumAccessibleUnits.toString(),
    policyDigest: policy.policyDigest,
    policyGeneration: 1,
    buyerTaxBps: policy.controls.tax.serviceFeeTaxBps,
    financialMode: pricing.config.kind === 'fixed_aud' && pricing.price.units === '0'
      ? 'none'
      : 'formance',
    ...(observation === undefined || treasuryTarget === undefined
      ? {}
      : {
          treasury: {
            custodyRef: observation.custodyRef,
            custodyGeneration: observation.custodyGeneration,
            network: observation.network,
            targetUnits: treasuryTarget,
            evidenceRef: observation.evidenceRef,
            evidenceDigest: observation.evidenceDigest,
          },
        }),
  }
}

async function issueQuoteHandler(
  ctx: MutationCtx,
  args: QuoteArgs & Readonly<{ formance: Infer<typeof formanceFinancialSnapshot> }>,
): Promise<QuoteResult> {
  // The coordinating action has already consumed this source-write admission in
  // prepareFinancialSubjects. Internal mutations must not consume the same nonce twice.
  const now = Date.now()
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', toolRef: args.toolRef },
  )
  if (authority === null) return refuse(args, 'grant_not_found', false)
  if (await toolProviderRouteabilityIsFrozen(ctx, args.toolRef)) {
    return refuse(args, 'tool_not_ready', false)
  }
  const operation = await readCurrentPublishedTool(ctx, args.toolRef, now)
  if (operation === undefined) return refuse(args, 'tool_not_found', false)
  let descriptor
  try {
    descriptor = materializeRuntimePublishedTool(operation)
  } catch {
    return refuse(args, 'tool_unsupported', false)
  }
  if (!isBoundedJsonValue(args.input) || !descriptor.validateInput(args.input)) {
    return refuse(args, 'input_invalid', false)
  }
  const currentDigest = currentToolDigest({ toolRef: args.toolRef, tool: operation })
  if (currentDigest === undefined) return refuse(args, 'tool_not_current', false, {
    capabilityId: operation.contract.ref.capabilityId,
  })

  const policyGate = await readCommercialPolicyGate(ctx.db, {
    environment: operation.runtimeEnvironment,
    now,
    ...(operation.runtimeEnvironment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policyGate.kind === 'refused') {
    return refuse(args, 'commercial_policy_unavailable', false)
  }

  const grantRow = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authority.grantRef))
    .unique()
  if (grantRow === null) return refuse(args, 'grant_not_found', false)
  const grant = normalizeStoredAgentAccessGrant(grantRow as never)
  if (grant === undefined || grant.generation !== authority.grantGeneration) {
    return refuse(args, 'grant_not_found', false)
  }
  const grantReadback = projectAgentAccessGrant(grant)
  if (args.formance.accountRef !== authority.principal.ownerId
    || args.formance.principalRef !== authority.principal.principalId
    || args.formance.budgetGeneration !== grantReadback.budget.generation
    || args.formance.policyGeneration !== 1
    || args.formance.formanceSchemaVersion !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion
    || args.formance.observedAt > now
    || now - args.formance.observedAt > 15_000) {
    return refuse(args, 'inspection_unavailable', true)
  }

  const pricing = toolPricing(operation, now)
  if (pricing === undefined) return refuse(args, 'tool_unsupported', false, {
    capabilityId: operation.contract.ref.capabilityId,
  })
  if (pricing.kind === 'refused') {
    return refuse(args, 'pricing_setup_required', false)
  }
  const buyerSale = pricing.price.units === '0'
    ? { revenueUnits: '0', taxUnits: '0' }
    : splitInclusiveAudTax(pricing.price.units, args.formance.buyerTaxBps)
  if (buyerSale === undefined) return refuse(args, 'pricing_setup_required', false)
  if ((pricing.sourceRequirement === undefined) !== (args.liveX402Requirement === undefined)) {
    return refuse(args, 'tool_not_ready', true)
  }
  if (args.liveX402Requirement !== undefined) {
    try {
      if (args.liveX402Requirement.observedAt > now
        || now - args.liveX402Requirement.observedAt > 15_000
        || canonicalDigest(JSON.parse(args.liveX402Requirement.requirementJson) as never)
          !== args.liveX402Requirement.requirementDigest) {
        return refuse(args, 'tool_not_ready', true)
      }
    } catch {
      return refuse(args, 'tool_not_ready', true)
    }
  }
  const maximum = grantReadback.budget.maximumSpendPerCall
  if (maximum.currency !== 'AUD' || maximum.exponent !== 6
    || BigInt(maximum.units) < BigInt(pricing.price.units)) {
    return refuse(args, 'budget_exceeded', false, { reason: 'per_call_limit' })
  }

  const balanceUnits = args.formance.accountAvailableUnits
  if (BigInt(balanceUnits) < BigInt(pricing.price.units)) {
    const fundingPolicy = audFundingPolicyFromCommercialControls(policyGate.controls)
    const shortfall = BigInt(pricing.price.units) - BigInt(balanceUnits)
    const rounded = ((shortfall + fundingPolicy.incrementUnits - 1n) / fundingPolicy.incrementUnits)
      * fundingPolicy.incrementUnits
    const principalUnits = rounded < fundingPolicy.minimumPrincipalUnits
      ? fundingPolicy.minimumPrincipalUnits
      : rounded
    const funding = principalUnits > fundingPolicy.maximumPrincipalUnits
      ? undefined
      : {
          principalAmount: { currency: 'AUD' as const, units: principalUnits.toString(), exponent: 6 as const },
          idempotencyKey: `funding:${canonicalDigest({
            format: 'ae.operation-inspect-funding:v1',
            principalRef: authority.principal.principalId,
            operationRef: args.toolRef,
            inputDigest: canonicalDigest(args.input as never),
            exactPriceUnits: pricing.price.units,
            currentBalanceUnits: balanceUnits,
            budgetGeneration: grantReadback.budget.generation,
          }).slice(7)}`,
        }
    return refuse(args, 'insufficient_balance', false, { ...(funding === undefined ? {} : { funding }) })
  }
  if (BigInt(args.formance.budgetAvailableUnits) < BigInt(pricing.price.units)) {
    return refuse(args, 'budget_exceeded', false, { reason: 'period_budget_exhausted' })
  }
  if (BigInt(args.formance.legalExposureAvailableUnits) < BigInt(pricing.price.units)) {
    return refuse(args, 'budget_exceeded', false, { reason: 'account_limit' })
  }
  const treasury = args.formance.treasury
  if (pricing.sourceRequirement !== undefined
    && (treasury === undefined
      || treasury.network !== pricing.config.sourceRequirement.network
      || BigInt(treasury.availableUnits) < BigInt(pricing.sourceRequirement.units))) {
    return refuse(args, 'treasury_capacity_unavailable', true)
  }

  const normalizedInput = structuredClone(args.input)
  const inputDigest = canonicalDigest(normalizedInput as never)
  const expiresAt = Math.min(
    now + policyGate.controls.operations.commitmentTtlMs,
    authority.expiresAt,
    pricing.rateEvidence?.expiresAt ?? Number.MAX_SAFE_INTEGER,
  )
  const evidenceMaterial = {
    format: 'ae.operation-commitment:v1',
    principalId: authority.principal.principalId,
    accountRef: authority.principal.ownerId,
    credentialId: authority.principal.credentialId,
    grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration,
    grantPolicyDigest: authority.policyDigest,
    operationRef: args.toolRef,
    operationRevision: operation.identity.publicationRevision,
    operationMaterialDigest: operation.materialDigest,
    currentOperationDigest: currentDigest,
    inputDigest,
    pricingDigest: operation.priceDigest,
    decisionAudUnits: pricing.price.units,
    ...(pricing.sourceRequirement === undefined ? {} : { sourceUsdcUnits: pricing.sourceRequirement.units }),
    ...(args.liveX402Requirement === undefined ? {} : {
      x402RequirementDigest: args.liveX402Requirement.requirementDigest,
      x402RequirementObservedAt: args.liveX402Requirement.observedAt,
    }),
    ...(pricing.rateEvidence === undefined ? {} : { rateEvidenceDigest: pricing.rateEvidence.evidenceDigest }),
    budgetPolicyRef: grantReadback.budget.budgetPolicyRef,
    budgetGeneration: grantReadback.budget.generation,
    maximumSpendPerInvocationUnits: maximum.units,
    formanceSchemaVersion: args.formance.formanceSchemaVersion,
    legalCustomerRef: args.formance.legalCustomerRef,
    legalCustomerGeneration: args.formance.legalCustomerGeneration,
    buyerRevenueUnits: buyerSale.revenueUnits,
    buyerTaxUnits: buyerSale.taxUnits,
    accountAvailableUnits: args.formance.accountAvailableUnits,
    budgetAvailableUnits: args.formance.budgetAvailableUnits,
    legalExposureAvailableUnits: args.formance.legalExposureAvailableUnits,
    ...(treasury === undefined ? {} : {
      treasuryCustodyRef: treasury.custodyRef,
      treasuryCustodyGeneration: treasury.custodyGeneration,
      treasuryEvidenceRef: treasury.evidenceRef,
      treasurySpendableUnits: treasury.availableUnits,
    }),
    commercialPolicyDigest: policyGate.policyDigest,
    expiresAt,
  }
  const evidenceDigest = canonicalDigest(evidenceMaterial as never)
  const quoteRef = `operation-commitment:v1:${canonicalDigest({
    ...evidenceMaterial,
    createdAt: now,
    correlationId: args.correlationId,
  }).slice(7)}`
  const existingCommitment = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef))
    .unique()
  if (existingCommitment !== null
    && (existingCommitment.state !== 'issued'
      || existingCommitment.evidenceDigest !== evidenceDigest
      || existingCommitment.expiresAt <= now)) {
    return refuse(args, 'inspection_unavailable', false)
  }
  if (existingCommitment === null) await ctx.db.insert('capabilityQuotes', {
    quoteRef,
    principalId: authority.principal.principalId,
    accountRef: authority.principal.ownerId,
    credentialId: authority.principal.credentialId,
    applicationRef: authority.principal.applicationRef,
    environment: authority.principal.environment,
    grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration,
    grantPolicyDigest: authority.policyDigest,
    grantExpiresAt: authority.expiresAt,
    toolRef: args.toolRef,
    toolVersion: operation.identity.publicationRevision,
    toolMaterialDigest: operation.materialDigest,
    currentToolDigest: currentDigest,
    toolJson: JSON.stringify(operation),
    normalizedInputJson: JSON.stringify(normalizedInput),
    inputDigest,
    pricingJson: JSON.stringify(pricing.config),
    pricingDigest: operation.priceDigest,
    decisionAudUnits: pricing.price.units,
    ...(pricing.sourceRequirement === undefined ? {} : { sourceUsdcUnits: pricing.sourceRequirement.units }),
    ...(args.liveX402Requirement === undefined ? {} : {
      x402RequirementDigest: args.liveX402Requirement.requirementDigest,
      x402RequirementJson: args.liveX402Requirement.requirementJson,
      x402RequirementObservedAt: args.liveX402Requirement.observedAt,
    }),
    ...(pricing.rateEvidence === undefined ? {} : {
      rateEvidenceJson: JSON.stringify(pricing.rateEvidence),
      rateEvidenceDigest: pricing.rateEvidence.evidenceDigest,
    }),
    budgetPolicyRef: grantReadback.budget.budgetPolicyRef,
    budgetGeneration: grantReadback.budget.generation,
    maximumSpendPerCallUnits: maximum.units,
    formanceSchemaVersion: args.formance.formanceSchemaVersion,
    policyGeneration: args.formance.policyGeneration,
    legalCustomerRef: args.formance.legalCustomerRef,
    legalCustomerGeneration: args.formance.legalCustomerGeneration,
    buyerRevenueUnits: buyerSale.revenueUnits,
    buyerTaxUnits: buyerSale.taxUnits,
    accountAvailableUnits: args.formance.accountAvailableUnits,
    budgetAvailableUnits: args.formance.budgetAvailableUnits,
    legalExposureAvailableUnits: args.formance.legalExposureAvailableUnits,
    balanceUnits,
    ...(treasury === undefined ? {} : {
      treasuryCustodyRef: treasury.custodyRef,
      treasuryCustodyGeneration: treasury.custodyGeneration,
      treasuryEvidenceRef: treasury.evidenceRef,
      treasuryEvidenceDigest: treasury.evidenceDigest,
      treasurySpendableUnits: treasury.availableUnits,
    }),
    commercialPolicyRefs: [...policyGate.policyRefs],
    commercialPolicyDigest: policyGate.policyDigest,
    evidenceDigest,
    state: 'issued',
    expiresAt,
    createdAt: now,
    updatedAt: now,
  })
  return {
    kind: 'committed',
    quoteRef,
    toolRef: args.toolRef,
    toolVersion: operation.identity.publicationRevision,
    expiresAt,
    normalizedInput,
    price: pricing.price,
    ...(pricing.sourceRequirement === undefined ? {} : { sourceRequirement: pricing.sourceRequirement }),
    account: {
      accountRef: authority.principal.ownerId,
      available: { currency: 'AUD', exponent: 6, units: balanceUnits },
    },
    budget: { principalRef: authority.principal.principalId, maximumPerCall: maximum as never },
    policyRefs: [...policyGate.policyRefs],
    evidenceDigest,
    continuation: {
      action: 'tool.call',
      method: 'POST',
      path: '/api/v1/tools/call',
      input: { quoteRef, idempotencyKey: `invoke:${quoteRef}` },
    },
  }
}

export const issueQuote = internalMutation({
  args: {
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    principal: principalValue,
    toolRef: v.string(),
    input: jsonObject,
    liveX402Requirement: v.optional(v.object({
      requirementDigest: v.string(),
      requirementJson: v.string(),
      observedAt: v.number(),
    })),
    formance: formanceFinancialSnapshot,
  },
  returns: quoteResult,
  handler: issueQuoteHandler,
})

export const prepareFinancialSubjects = internalMutation({
  args: {
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    principal: principalValue,
    toolRef: v.string(),
    input: jsonObject,
  },
  returns: financialSubjectsResult,
  handler: prepareFinancialSubjectsHandler,
})

export const quote = action({
  args: { ...principalAndSourceArgs, toolRef: v.string(), input: jsonObject },
  returns: quoteResult,
  handler: async (ctx, args): Promise<QuoteResult> => {
    const live = await ctx.runAction(inspectLiveX402RequirementRef, {
      toolRef: args.toolRef,
      input: args.input,
    })
    if (live.kind === 'operation_not_found') {
      return refuse(args, 'tool_not_found', false)
    }
    if (live.kind === 'operation_unsupported') {
      return refuse(args, 'tool_unsupported', false)
    }
    if (live.kind === 'refused') return refuse(args, 'tool_not_ready', true)
    const subjects: FinancialSubjectsResult = await ctx.runMutation(
      internal.capabilityQuotes.prepareFinancialSubjects,
      args,
    )
    if (subjects.kind === 'refused') return refuse(args, subjects.code, true, {
      ...(subjects.reason === undefined ? {} : { reason: subjects.reason }),
    })
    if (subjects.financialMode === 'none') {
      return await ctx.runMutation(internal.capabilityQuotes.issueQuote, {
        ...args,
        formance: {
          accountRef: subjects.accountRef,
          accountAvailableUnits: '0',
          principalRef: subjects.principalRef,
          budgetGeneration: subjects.budgetGeneration,
          budgetAvailableUnits: subjects.budgetUnits,
          legalCustomerRef: subjects.legalCustomerRef,
          legalCustomerGeneration: subjects.legalCustomerGeneration,
          legalExposureAvailableUnits: subjects.legalExposureUnits,
          policyGeneration: subjects.policyGeneration,
          formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
          buyerTaxBps: subjects.buyerTaxBps,
          observedAt: Date.now(),
        },
      })
    }
    const capacityCommands = [
      {
        commandRef: `capacity:agent:${subjects.principalRef}:${subjects.budgetGeneration}`,
        idempotencyKey: `capacity:agent:${subjects.principalRef}:${subjects.budgetGeneration}`,
        kind: 'agent_budget' as const,
        subjectRef: subjects.principalRef,
        generation: subjects.budgetGeneration,
        targetUnits: subjects.budgetUnits,
        policyDigest: subjects.policyDigest,
        externalEvidenceDigest: subjects.policyDigest,
      },
      {
        commandRef: `capacity:legal:${subjects.legalCustomerRef}:${subjects.legalCustomerGeneration}`,
        idempotencyKey: `capacity:legal:${subjects.legalCustomerRef}:${subjects.legalCustomerGeneration}`,
        kind: 'legal_customer_exposure' as const,
        subjectRef: subjects.legalCustomerRef,
        generation: subjects.legalCustomerGeneration,
        targetUnits: subjects.legalExposureUnits,
        policyDigest: subjects.policyDigest,
        externalEvidenceDigest: subjects.policyDigest,
      },
      ...(live.kind === 'observed' && subjects.treasury !== undefined
        ? [{
            commandRef: `capacity:treasury:${subjects.treasury.custodyRef}:${subjects.treasury.custodyGeneration}`,
            idempotencyKey: `capacity:treasury:${subjects.treasury.custodyRef}:${subjects.treasury.custodyGeneration}`,
            kind: 'treasury_usdc' as const,
            subjectRef: subjects.treasury.custodyRef,
            generation: subjects.treasury.custodyGeneration,
            targetUnits: subjects.treasury.targetUnits,
            policyDigest: subjects.policyDigest,
            externalEvidenceDigest: subjects.treasury.evidenceDigest,
          }]
        : []),
    ]
    if (live.kind === 'observed' && subjects.treasury === undefined) {
      return refuse(args, 'treasury_capacity_unavailable', true)
    }
    for (const capacity of capacityCommands) {
      const synced = await ctx.runAction(internal.moneyFormance.syncCapacity, capacity)
      if (synced.kind !== 'completed') {
        return refuse(args, 'inspection_unavailable', synced.kind !== 'refused')
      }
    }
    const [account, budget, exposure, treasury] = await Promise.all([
      ctx.runAction(internal.moneyFormance.readDisplayBalance, {
        balanceKind: 'account_aud', subjectRef: subjects.accountRef,
      }),
      ctx.runAction(internal.moneyFormance.readDisplayBalance, {
        balanceKind: 'agent_budget', subjectRef: subjects.principalRef,
        generation: subjects.budgetGeneration,
      }),
      ctx.runAction(internal.moneyFormance.readDisplayBalance, {
        balanceKind: 'legal_customer_exposure', subjectRef: subjects.legalCustomerRef,
        generation: subjects.legalCustomerGeneration,
      }),
      subjects.treasury === undefined
        ? Promise.resolve(undefined)
        : ctx.runAction(internal.moneyFormance.readDisplayBalance, {
            balanceKind: 'treasury_usdc', subjectRef: subjects.treasury.custodyRef,
            generation: subjects.treasury.custodyGeneration,
          }),
    ])
    if (account.kind !== 'available'
      || budget.kind !== 'available'
      || exposure.kind !== 'available'
      || (treasury !== undefined && treasury.kind !== 'available')) {
      return refuse(args, 'inspection_unavailable', true)
    }
    const observedAt = Math.min(
      account.observedAt,
      budget.observedAt,
      exposure.observedAt,
      treasury?.observedAt ?? Number.MAX_SAFE_INTEGER,
    )
    return await ctx.runMutation(
      internal.capabilityQuotes.issueQuote,
      {
        ...args,
        ...(live.kind === 'observed' ? { liveX402Requirement: live.requirement } : {}),
        formance: {
          accountRef: subjects.accountRef,
          accountAvailableUnits: account.units,
          principalRef: subjects.principalRef,
          budgetGeneration: subjects.budgetGeneration,
          budgetAvailableUnits: budget.units,
          legalCustomerRef: subjects.legalCustomerRef,
          legalCustomerGeneration: subjects.legalCustomerGeneration,
          legalExposureAvailableUnits: exposure.units,
          policyGeneration: subjects.policyGeneration,
          formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
          buyerTaxBps: subjects.buyerTaxBps,
          observedAt,
          ...(subjects.treasury === undefined || treasury === undefined
            ? {}
            : {
                treasury: {
                  custodyRef: subjects.treasury.custodyRef,
                  custodyGeneration: subjects.treasury.custodyGeneration,
                  network: subjects.treasury.network,
                  availableUnits: treasury.units,
                  evidenceRef: subjects.treasury.evidenceRef,
                  evidenceDigest: subjects.treasury.evidenceDigest,
                },
              }),
        },
      },
    )
  },
})

const invocationMaterial = v.union(v.object({
  toolRef: v.string(),
  input: jsonObject,
  decisionPrice: exactAud,
  quoteRef: v.string(),
  evidenceDigest: v.string(),
  x402RequirementDigest: v.optional(v.string()),
}), v.null())

export const readForCall = internalQuery({
  args: {
    principal: principalValue,
    quoteRef: v.string(),
    idempotencyKey: v.string(),
    now: v.number(),
  },
  returns: invocationMaterial,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
      .unique()
    if (row === null
      || row.expiresAt <= args.now
      || row.principalId !== args.principal.principalId
      || row.accountRef !== args.principal.ownerId
      || row.credentialId !== args.principal.credentialId
      || row.applicationRef !== args.principal.applicationRef
      || row.environment !== args.principal.environment) return null
    if (row.state === 'consumed') {
      if (row.consumedCallRef === undefined) return null
      const call = await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', row.consumedCallRef!))
        .unique()
      if (call === null
        || call.quoteRef !== row.quoteRef
        || call.credentialId !== args.principal.credentialId
        || call.idempotencyKey !== args.idempotencyKey) return null
    } else if (row.state !== 'issued') return null
    try {
      const input = JSON.parse(row.normalizedInputJson) as unknown
      return isBoundedJsonValue(input) && typeof input === 'object' && input !== null && !Array.isArray(input)
        ? {
            toolRef: row.toolRef,
            input: input as Record<string, Infer<typeof jsonObject>[string]>,
            decisionPrice: { currency: 'AUD' as const, exponent: 6 as const, units: row.decisionAudUnits },
            quoteRef: row.quoteRef,
            evidenceDigest: row.evidenceDigest,
            ...(row.x402RequirementDigest === undefined
              ? {}
              : { x402RequirementDigest: row.x402RequirementDigest }),
          }
        : null
    } catch {
      return null
    }
  },
})

export const admitCall = internalMutation({
  args: {
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    principal: principalValue,
    quoteRef: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => (await requireSourceWrite(ctx, args, 'protected_action')).kind === 'accepted',
})

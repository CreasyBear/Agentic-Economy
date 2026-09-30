import { v, type Infer } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentToolDigest } from '@/modules/capability-execution/current-tool-quote'
import {
  normalizeStoredAgentAccessGrant,
  projectAgentAccessGrant,
} from '@/modules/agent-access/policy'
import { materializeRuntimePublishedTool } from '@/modules/capability-supply/public'
import { jsonObject } from '@/modules/capability-execution/convex'

import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { readAgentPaymentAdmission } from '../../money/treasury/paymentAdmission'
import { normalizePricingConfig } from '@/modules/money/public'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { principalValue } from '../callLifecycle/contracts'
import { resolveCurrentAgentAuthority } from '../callLifecycle/agentCallAuthority'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { toolProviderRouteabilityIsFrozen } from '../../capabilitySupply/providerOffboarding/freeze'
import { activeChatTurnForMoney } from '../../chat/threads/ownership'
import {
  quoteExpiresAt,
  quoteFormanceSnapshotIsCurrent,
  quoteFundingContinuation,
  quoteLiveX402IsCurrent,
  quoteOrganizationMonthlySpendAdmission,
  quotePaidPeriodAdmission,
  quotePartiesFromPublishedTool,
  toolPricing,
} from './quoteValuation'
import { readReferenceRate } from '../../money/referenceRate/store'
import { quoteEvidenceMaterial } from './quoteEvidence'
import { refuse, quoteRefusal } from './refusalHelpers'
import {
  formanceFinancialSnapshot,
  liveX402RequirementValue,
  quoteResult,
  type QuoteArgs,
  type QuoteResult,
} from './contracts'
import { env, type MutationCtx } from '../../../_generated/server'

export const issueQuoteArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
  toolRef: v.string(),
  input: jsonObject,
  turnRef: v.optional(v.string()),
  liveX402Requirement: v.optional(liveX402RequirementValue),
  formance: formanceFinancialSnapshot,
}

export const issueQuoteResult = quoteResult

export async function issueQuoteHandler(
  ctx: MutationCtx,
  args: QuoteArgs & Readonly<{ turnRef?: string; formance: Infer<typeof formanceFinancialSnapshot> }>,
): Promise<QuoteResult> {
  // The coordinating action has already consumed this source-write admission in
  // prepareFinancialSubjects. Internal mutations must not consume the same nonce twice.
  const now = Date.now()
  const deploymentEnvironment = deploymentPaymentEnvironment(env)
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', toolRef: args.toolRef },
  )
  if (authority === null) return refuse(args, 'grant_not_found', false)
  const turnRef = args.turnRef
  if (turnRef !== undefined) {
    const turn = await ctx.db.query('chatTurns')
      .withIndex('by_turnRef', (query) => query.eq('turnRef', turnRef))
      .unique()
    if (turn === null || turn.principalKind !== 'agent_key'
      || turn.principalRef !== authority.principal.principalId
      || turn.accountRef !== authority.principal.ownerId
      || turn.credentialLocator !== authority.principal.credentialId
      || turn.grantRef !== authority.grantRef
      || !await activeChatTurnForMoney(ctx, turn)) {
      return refuse(args, 'grant_not_found', false)
    }
  }
  if (deploymentEnvironment === undefined || deploymentEnvironment !== authority.principal.environment) {
    return refuse(args, 'tool_unsupported', false, { reason: 'This deployment does not admit purchases in this environment.' })
  }
  if (await toolProviderRouteabilityIsFrozen(ctx, args.toolRef)) {
    return refuse(args, 'tool_not_ready', false)
  }
  const operation = await readCurrentPublishedTool(ctx, args.toolRef, now)
  if (operation === undefined) return refuse(args, 'tool_not_found', false)
  if (operation.runtimeEnvironment !== deploymentEnvironment
    || operation.runtimeEnvironment !== authority.principal.environment) {
    return refuse(args, 'tool_unsupported', false, { reason: 'The current Tool environment is not permitted for this purchase.' })
  }
  let descriptor
  try {
    descriptor = materializeRuntimePublishedTool(operation)
  } catch (cause) {
    return degradeBackend(cause, refuse(args, 'tool_unsupported', false), { site: 'issueQuoteHandler', reason: 'invalid_response' })
  }
  if (!isBoundedJsonValue(args.input) || !descriptor.validateInput(args.input)) {
    return refuse(args, 'input_invalid', false)
  }
  const currentDigest = currentToolDigest({ toolRef: args.toolRef, tool: operation })
  if (currentDigest === undefined) return refuse(args, 'tool_not_current', false, {
    capabilityId: operation.contract.ref.capabilityId,
  })

  // Re-read after the coordinating action's external inspection; a mid-request pause must win.
  const paymentPricing = normalizePricingConfig(operation.pricingConfig)
  if (paymentPricing.kind !== 'valid') return refuse(args, 'tool_unsupported', false)
  if (paymentPricing.config.kind !== 'fixed_aud' || paymentPricing.config.amountUnits !== '0') {
    const paymentAccess = await readAgentPaymentAdmission(ctx, {
      environment: authority.principal.environment, accountRef: authority.principal.ownerId,
      grantRef: authority.grantRef, grantGeneration: authority.grantGeneration,
    }, now)
    if (paymentAccess.kind === 'refused') return refuse(args, paymentAccess.code, paymentAccess.code === 'payments_not_ready')
  }

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
  const dailyLimit = grantReadback.budget.maximumDailySpend
  const monthlyLimit = grantReadback.budget.maximumMonthlySpend
  if (!quoteFormanceSnapshotIsCurrent(
    args.formance,
    authority.principal,
    grantReadback.budget.generation,
    policyGate.policyDigest,
    now,
  )) {
    return refuse(args, 'inspection_unavailable', true)
  }

  const referenceRate = args.liveX402Requirement === undefined ? null : await readReferenceRate(ctx.db, now)
  const pricing = toolPricing(operation, now, args.liveX402Requirement, referenceRate ?? undefined)
  if (pricing === undefined) return refuse(args, 'tool_unsupported', false, {
    capabilityId: operation.contract.ref.capabilityId,
  })
  if (pricing.kind === 'refused') return pricing.code === 'pricing_setup_required'
    ? refuse(args, 'pricing_setup_required', true, {
        reason: 'AUD reference rate is missing or older than 24 hours. Retry after the next rate refresh.',
      })
    : refuse(args, 'tool_unsupported', false, { reason: 'Invalid upstream USDC amount.' })
  if (!/^(?:0|[1-9]\d*)$/u.test(pricing.price.units)) return refuse(args, 'pricing_setup_required', false)
  const buyerSale = { revenueUnits: pricing.price.units, taxUnits: '0' }
  const paid = pricing.price.units !== '0'
  const organizationMonthlyAdmission = quoteOrganizationMonthlySpendAdmission(
    args,
    pricing.price.units,
    args.formance.organizationMonthlySpend,
  )
  if (organizationMonthlyAdmission !== undefined) return quoteRefusal(organizationMonthlyAdmission)
  const spendingPeriods = paid ? args.formance.spendingPeriods : undefined
  const periodAdmission = await quotePaidPeriodAdmission(ctx, args, {
    paid,
    formance: args.formance,
    principalId: authority.principal.principalId,
    dailyLimitUnits: dailyLimit.units,
    monthlyLimitUnits: monthlyLimit.units,
    priceUnits: pricing.price.units,
    spendingPeriods,
    now,
  })
  if (periodAdmission !== undefined) return quoteRefusal(periodAdmission)
  const liveX402Admission = quoteLiveX402IsCurrent(args, pricing, args.liveX402Requirement, now)
  if (liveX402Admission !== undefined) return quoteRefusal(liveX402Admission)
  const maximum = grantReadback.budget.maximumSpendPerCall
  if (maximum.currency !== 'AUD' || maximum.exponent !== 6
    || BigInt(maximum.units) < BigInt(pricing.price.units)) {
    return refuse(args, 'budget_exceeded', false, { reason: 'per_call_limit' })
  }

  const balanceUnits = args.formance.accountAvailableUnits
  if (BigInt(balanceUnits) < BigInt(pricing.price.units)) {
    return quoteRefusal(quoteFundingContinuation(args, {
      balanceUnits,
      priceUnits: pricing.price.units,
      policyControls: policyGate.controls,
      principalRef: authority.principal.principalId,
      toolRef: args.toolRef,
      inputDigest: canonicalDigest(args.input as never),
      budgetGeneration: grantReadback.budget.generation,
    }))
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
  const expiresAt = quoteExpiresAt(now, {
    commitmentTtlMs: policyGate.controls.operations.commitmentTtlMs,
    authorityExpiresAt: authority.expiresAt,
    toolValidUntil: operation.readiness.validUntil,
    rateEvidenceExpiresAt: pricing.rateEvidence?.expiresAt,
    spendingPeriods,
  })
  if (expiresAt <= now) return refuse(args, 'inspection_unavailable', true, { reason: 'spending_period_expired' })
  const { evidenceDigest, quoteRef } = quoteEvidenceMaterial({
    now,
    correlationId: args.correlationId,
    authority,
    operation,
    toolRef: args.toolRef,
    currentDigest,
    normalizedInput,
    inputDigest,
    pricing,
    liveX402Requirement: args.liveX402Requirement,
    grantReadback,
    maximumPerCallUnits: maximum.units,
    formance: args.formance,
    buyerSale,
    spendingPeriods,
    treasury,
    commercialPolicyDigest: policyGate.policyDigest,
    expiresAt,
  })
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
      x402PaymentRequiredJson: args.liveX402Requirement.paymentRequiredJson,
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
    ...(spendingPeriods === undefined ? {} : {
      spendingPeriods,
      dailyPeriodAvailableUnits: args.formance.dailyPeriodAvailableUnits,
      monthlyPeriodAvailableUnits: args.formance.monthlyPeriodAvailableUnits,
      dailyPeriodObservedAt: args.formance.dailyPeriodObservedAt,
      monthlyPeriodObservedAt: args.formance.monthlyPeriodObservedAt,
    }),
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
    parties: quotePartiesFromPublishedTool(operation),
    continuation: {
      action: 'tool.call',
      method: 'POST',
      path: '/api/v1/tools/call',
      input: { quoteRef, idempotencyKey: `invoke:${quoteRef}` },
    },
  }
}

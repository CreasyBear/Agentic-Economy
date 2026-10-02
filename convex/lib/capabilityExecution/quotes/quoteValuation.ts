import { MANAGED_CALL_FORMANCE_SCHEMA_VERSION } from '@/modules/money/public'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { spendingPeriodsAreCurrent } from '../../money/spendingPeriods/periods'
import type { PublishedTool } from '@/modules/capability-supply/public'
import type { JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import {
  audFundingPolicyFromCommercialControls,
  evaluateOrganizationMonthlySpendFence,
  normalizePricingConfig,
  quoteManagedX402BuyerAud,
  type CommercialPolicyControls,
  type ReferenceRate,
  type SpendingPeriods,
} from '@/modules/money/public'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import {
  projectToolQuoteRefusal,
  type ToolQuoteRefusalCode,
  type ToolQuoteResult,
} from '@/modules/capability-execution/quote'

export type QuoteRefusalContext = Readonly<{
  toolRef: string
  input: Record<string, JsonValue>
  correlationId: string
}>

export type FormanceQuoteSnapshot = Readonly<{
  accountRef: string
  principalRef: string
  budgetGeneration: number
  policyGeneration: number
  policyDigest: string
  formanceSchemaVersion: string
  observedAt: number
  accountAvailableUnits: string
  budgetAvailableUnits: string
  legalExposureAvailableUnits: string
  legalCustomerRef: string
  legalCustomerGeneration: number
  buyerTaxBps: number
  spendingPeriods?: SpendingPeriods
  dailyPeriodAvailableUnits?: string
  monthlyPeriodAvailableUnits?: string
  dailyPeriodObservedAt?: number
  monthlyPeriodObservedAt?: number
  treasury?: Readonly<{
    custodyRef: string
    custodyGeneration: number
    network: string
    availableUnits: string
    evidenceRef: string
    evidenceDigest: string
  }>
}>

const TREASURY_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/u
const TREASURY_UNITS_PATTERN = /^(?:0|[1-9]\d{0,15})$/u

export function spendingPeriodPreparationIsRetryable(reason: string | undefined): boolean {
  if (reason === undefined) return true
  return reason === 'spending_period_reservation_recovery_pending'
    || reason === 'spending_period_command_pending'
    || reason === 'spending_period_adjustment_in_progress'
}

export function treasurySpendableUnits(
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'treasurySpendableUnits', reason: 'invalid_response' })
  }
}

export type QuoteRefusalResult = Extract<ToolQuoteResult, { kind: 'refused' }>

export const refuse = (
  args: QuoteRefusalContext,
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
): QuoteRefusalResult => {
  const { reason, continuation, requiredActions, ...rest } = projectToolQuoteRefusal({
    toolRef: args.toolRef,
    input: args.input,
    code,
    retryable,
    correlationRef: args.correlationId,
    ...options,
  })
  const base = {
    ...rest,
    ...(reason === undefined ? {} : { reason }),
    ...(requiredActions === undefined ? {} : { requiredActions }),
  }
  if (continuation === undefined) return base
  if (continuation.action !== 'funding.handoff.create') return { ...base, continuation }
  const funding = options.funding
  if (funding === undefined) throw new Error('capability_quote_refusal_funding_continuation_missing_funding')
  return {
    ...base,
    continuation: {
      action: 'funding.handoff.create' as const,
      method: 'POST' as const,
      path: continuation.path,
      input: { principalAmount: funding.principalAmount, idempotencyKey: funding.idempotencyKey },
    },
  }
}

export function toolPricing(
  tool: PublishedTool,
  now: number,
  live?: LiveX402Requirement,
  referenceRate?: ReferenceRate,
) {
  const normalized = normalizePricingConfig(tool.pricingConfig)
  if (normalized.kind === 'invalid') return undefined
  if (normalized.config.kind === 'fixed_aud') {
    return {
      kind: 'ready' as const,
      config: normalized.config,
      price: { currency: 'AUD' as const, exponent: 6 as const, units: normalized.config.amountUnits },
    }
  }
  let sourceUnits: string
  try {
    sourceUnits = live === undefined
      ? normalized.config.sourceRequirement.atomicUnits
      : JSON.parse(live.requirementJson).requirement.amountUnits
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'toolPricing', reason: 'invalid_response' })
  }
  if (typeof sourceUnits !== 'string' || !/^[1-9][0-9]{0,77}$/.test(sourceUnits)) return undefined
  const sourceRequirement = {
    currency: 'USDC' as const,
    exponent: 6 as const,
    units: sourceUnits,
  }
  const quoted = quoteManagedX402BuyerAud({
    environment: tool.runtimeEnvironment,
    requiredUsdcAtomicUnits: sourceRequirement.units,
    ...(referenceRate === undefined ? {} : { referenceRate }),
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

export function quotePartiesFromPublishedTool(operation: PublishedTool): Readonly<{
  seller: string
  provider: string
  paymentRecipient: string
}> {
  return {
    seller: 'Agentic Economy',
    provider: operation.identity.businessId,
    paymentRecipient: operation.identity.paymentRecipient,
  }
}

export function quoteFormanceSnapshotIsCurrent(
  formance: FormanceQuoteSnapshot,
  authority: Readonly<{ ownerId: string; principalId: string }>,
  grantBudgetGeneration: number,
  policyDigest: string,
  now: number,
): boolean {
  return formance.accountRef === authority.ownerId
    && formance.principalRef === authority.principalId
    && formance.budgetGeneration === grantBudgetGeneration
    && formance.policyGeneration === 1
    && formance.policyDigest === policyDigest
    && formance.formanceSchemaVersion === MANAGED_CALL_FORMANCE_SCHEMA_VERSION
    && formance.observedAt <= now
    && now - formance.observedAt <= 15_000
}

export type OrganizationMonthlySpendAdmissionSnapshot = Readonly<{
  enabled: boolean
  ceilingUnits?: string | undefined
  monthSpendUnits?: string | undefined
}>

export function quoteOrganizationMonthlySpendAdmission(
  refusalContext: QuoteRefusalContext,
  requestUnits: string,
  snapshot: OrganizationMonthlySpendAdmissionSnapshot | undefined,
): QuoteRefusalResult | undefined {
  if (snapshot === undefined || !snapshot.enabled) return undefined
  const fence = evaluateOrganizationMonthlySpendFence({
    enabled: true,
    ceilingUnits: snapshot.ceilingUnits,
    monthSpendUnits: snapshot.monthSpendUnits,
    requestUnits,
  })
  switch (fence.kind) {
    case 'not_applicable':
    case 'admitted':
      return undefined
    case 'refused':
      return refuse(refusalContext, 'budget_exceeded', false, { reason: fence.reason })
    case 'unavailable':
      return refuse(refusalContext, 'budget_exceeded', false, {
        reason: 'organization_monthly_spend_unavailable',
      })
    default: {
      const exhaustive: never = fence
      return exhaustive
    }
  }
}

export async function quotePaidPeriodAdmission(
  ctx: MutationCtx,
  refusalContext: QuoteRefusalContext,
  input: Readonly<{
    paid: boolean
    formance: FormanceQuoteSnapshot
    principalId: string
    dailyLimitUnits: string
    monthlyLimitUnits: string
    priceUnits: string
    spendingPeriods?: SpendingPeriods | undefined
    now: number
  }>,
): Promise<QuoteRefusalResult | undefined> {
  if (!input.paid) return undefined
  const spendingPeriods = input.spendingPeriods
  if (input.formance.formanceSchemaVersion !== MANAGED_CALL_FORMANCE_SCHEMA_VERSION
    || spendingPeriods === undefined) {
    return refuse(refusalContext, 'budget_exceeded', false, { reason: 'spending_periods_required' })
  }
  if (!await spendingPeriodsAreCurrent(ctx, {
    principalRef: input.principalId,
    dailyLimitUnits: input.dailyLimitUnits,
    monthlyLimitUnits: input.monthlyLimitUnits,
    now: input.now,
    spendingPeriods,
  })) {
    return refuse(refusalContext, 'inspection_unavailable', true, { reason: 'spending_periods_not_current' })
  }
  const dailyAvailable = input.formance.dailyPeriodAvailableUnits
  const monthlyAvailable = input.formance.monthlyPeriodAvailableUnits
  const dailyObservedAt = input.formance.dailyPeriodObservedAt
  const monthlyObservedAt = input.formance.monthlyPeriodObservedAt
  if (dailyAvailable === undefined || monthlyAvailable === undefined
    || dailyObservedAt === undefined || monthlyObservedAt === undefined
    || dailyObservedAt > input.now || monthlyObservedAt > input.now
    || input.now - dailyObservedAt > 15_000 || input.now - monthlyObservedAt > 15_000) {
    return refuse(refusalContext, 'inspection_unavailable', true)
  }
  if (BigInt(dailyAvailable) < BigInt(input.priceUnits)) {
    return refuse(refusalContext, 'budget_exceeded', false, { reason: 'daily_limit_exhausted' })
  }
  if (BigInt(monthlyAvailable) < BigInt(input.priceUnits)) {
    return refuse(refusalContext, 'budget_exceeded', false, { reason: 'monthly_limit_exhausted' })
  }
  return undefined
}

export function quoteLiveX402IsCurrent(
  refusalContext: QuoteRefusalContext,
  pricing: Readonly<{ sourceRequirement?: { units: string } }>,
  liveX402Requirement: LiveX402Requirement | undefined,
  now: number,
): QuoteRefusalResult | undefined {
  if ((pricing.sourceRequirement === undefined) !== (liveX402Requirement === undefined)) {
    return refuse(refusalContext, 'tool_not_ready', true)
  }
  if (liveX402Requirement === undefined) return undefined
  try {
    if (liveX402Requirement.observedAt > now
      || now - liveX402Requirement.observedAt > 15_000
      || canonicalDigest(JSON.parse(liveX402Requirement.requirementJson) as never)
        !== liveX402Requirement.requirementDigest) {
      return refuse(refusalContext, 'tool_not_ready', true)
    }
  } catch (cause) {
    return degradeBackend(
      cause,
      refuse(refusalContext, 'tool_not_ready', true),
      { site: 'quoteLiveX402IsCurrent', reason: 'invalid_response' },
    )
  }
  return undefined
}

export function quoteFundingContinuation(
  refusalContext: QuoteRefusalContext,
  input: Readonly<{
    balanceUnits: string
    priceUnits: string
    policyControls: CommercialPolicyControls
    principalRef: string
    toolRef: string
    inputDigest: string
    budgetGeneration: number
  }>,
): QuoteRefusalResult {
  const fundingPolicy = audFundingPolicyFromCommercialControls(input.policyControls)
  const shortfall = BigInt(input.priceUnits) - BigInt(input.balanceUnits)
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
          principalRef: input.principalRef,
          operationRef: input.toolRef,
          inputDigest: input.inputDigest,
          exactPriceUnits: input.priceUnits,
          currentBalanceUnits: input.balanceUnits,
          budgetGeneration: input.budgetGeneration,
        }).slice(7)}`,
      }
  return refuse(refusalContext, 'insufficient_balance', false, { ...(funding === undefined ? {} : { funding }) })
}

export function quoteExpiresAt(
  now: number,
  input: Readonly<{
    commitmentTtlMs: number
    authorityExpiresAt: number
    toolValidUntil: number
    rateEvidenceExpiresAt?: number | undefined
    spendingPeriods?: SpendingPeriods | undefined
  }>,
): number {
  return Math.min(
    now + input.commitmentTtlMs,
    input.authorityExpiresAt,
    input.toolValidUntil,
    input.rateEvidenceExpiresAt ?? Number.MAX_SAFE_INTEGER,
    input.spendingPeriods === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.min(input.spendingPeriods.daily.periodEndAt, input.spendingPeriods.monthly.periodEndAt),
  )
}


import { v, type Infer } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { currentUtcDayBounds, currentUtcMonthBounds } from '../../../../src/modules/common/freshness'
import { PACKAGE4_FORMANCE_REQUIREMENTS, spendingPeriodsValue, promotionalCreditAllocationValue, validateExecutableRateEvidenceIntegrity, type ExecutableRateEvidence } from '../../../../src/modules/money/public'
import { parsePublishedToolSnapshot } from '../../../../src/modules/capability-supply/public'

export const transactionRefsValue = v.array(v.string())
const bookingValue = v.object({
  callRef: v.string(),
  quoteRef: v.string(),
  idempotencyKey: v.string(),
  accountRef: v.string(),
  principalRef: v.string(),
  agentBudgetGeneration: v.number(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  treasuryRef: v.string(),
  treasuryGeneration: v.number(),
  toolRef: v.string(),
  providerRef: v.string(),
  authorityGeneration: v.number(),
  policyGeneration: v.number(),
  buyerAmountUnits: v.string(),
  buyerRevenueUnits: v.string(),
  buyerTaxUnits: v.string(),
  providerAmountUnits: v.string(),
  quoteDigest: v.string(),
  inputDigest: v.string(),
  policyDigest: v.string(),
  rateEvidenceDigest: v.string(),
  treasuryEvidenceDigest: v.string(),
  x402RequirementDigest: v.string(),
  spendingPeriods: v.optional(spendingPeriodsValue),
  promotionalCreditAllocation: v.optional(promotionalCreditAllocationValue),
})

function validStoredSpendingPeriods(
  periods: Doc<'capabilityQuotes'>['spendingPeriods'],
): boolean {
  if (periods === undefined || periods.version !== 'ae.spending-periods:v1') return periods === undefined
  const valid = (
    period: typeof periods.daily,
    kind: 'day' | 'month',
  ): boolean => {
    if (!Number.isSafeInteger(period.periodStartAt)
      || !Number.isSafeInteger(period.periodEndAt)
      || period.periodStartAt < 0
      || period.periodEndAt <= period.periodStartAt
      || !Number.isSafeInteger(period.revision)
      || period.revision <= 0
      || !/^(?:0|[1-9]\d{0,15})$/u.test(period.limitUnits)) return false
    try {
      if (BigInt(period.limitUnits) > BigInt(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits)) return false
      const expected = kind === 'day'
        ? currentUtcDayBounds(period.periodStartAt)
        : currentUtcMonthBounds(period.periodStartAt)
      return expected.periodStartAt === period.periodStartAt
        && expected.periodEndAt === period.periodEndAt
    } catch (cause) {
      void cause;
      return false
    }
  }
  return valid(periods.daily, 'day')
    && valid(periods.monthly, 'month')
    && periods.daily.periodStartAt >= periods.monthly.periodStartAt
    && periods.daily.periodEndAt <= periods.monthly.periodEndAt
}

export function bookingFromRows(
  call: Doc<'capabilityCalls'>,
  quote: Doc<'capabilityQuotes'>,
) {
  const tool = parsePublishedToolSnapshot(quote.toolJson)
  const periodAware = quote.spendingPeriods !== undefined
  if (tool === undefined
    || !validStoredSpendingPeriods(quote.spendingPeriods)
    || call.quoteRef !== quote.quoteRef
    || call.ownerId !== quote.accountRef
    || call.principalId !== quote.principalId
    || call.toolRef !== quote.toolRef
    || (periodAware
      ? (quote.formanceSchemaVersion !== 'v1.4.0'
          && quote.formanceSchemaVersion !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion)
      : quote.formanceSchemaVersion !== 'v1.3.0')
    || (quote.formanceSchemaVersion === 'v1.5.0' && call.promotionalCreditAllocation === undefined)
    || (quote.formanceSchemaVersion !== 'v1.5.0' && call.promotionalCreditAllocation !== undefined)
    || quote.sourceUsdcUnits === undefined
    || quote.x402RequirementDigest === undefined
    || quote.rateEvidenceDigest === undefined
    || quote.treasuryCustodyRef === undefined
    || quote.treasuryCustodyGeneration === undefined
    || quote.treasuryEvidenceDigest === undefined) return null
  try {
    const rate = JSON.parse(quote.rateEvidenceJson ?? 'null') as ExecutableRateEvidence
    if (rate === null || !validateExecutableRateEvidenceIntegrity(rate)
      || rate.evidenceDigest !== quote.rateEvidenceDigest
      || rate.sourceAmount.units !== quote.decisionAudUnits
      || (rate.version === 'ae.managed-reference-price:v1' && rate.targetAmount.units !== quote.sourceUsdcUnits)) return null
  } catch (cause) { return degradeBackend(cause, null, { site: 'bookingFromRows', reason: 'invalid_response' }) }
  return {
    callRef: call.callRef,
    quoteRef: quote.quoteRef,
    idempotencyKey: call.idempotencyKey,
    accountRef: quote.accountRef,
    principalRef: quote.principalId,
    agentBudgetGeneration: quote.budgetGeneration,
    legalCustomerRef: quote.legalCustomerRef,
    legalCustomerGeneration: quote.legalCustomerGeneration,
    treasuryRef: quote.treasuryCustodyRef,
    treasuryGeneration: quote.treasuryCustodyGeneration,
    toolRef: quote.toolRef,
    providerRef: tool.identity.businessId,
    authorityGeneration: quote.grantGeneration,
    policyGeneration: quote.policyGeneration,
    buyerAmountUnits: quote.decisionAudUnits,
    buyerRevenueUnits: quote.buyerRevenueUnits,
    buyerTaxUnits: quote.buyerTaxUnits,
    providerAmountUnits: quote.sourceUsdcUnits,
    quoteDigest: quote.evidenceDigest,
    inputDigest: quote.inputDigest,
    policyDigest: quote.commercialPolicyDigest,
    rateEvidenceDigest: quote.rateEvidenceDigest,
    treasuryEvidenceDigest: quote.treasuryEvidenceDigest,
    x402RequirementDigest: quote.x402RequirementDigest,
    ...(call.promotionalCreditAllocation === undefined ? {} : { promotionalCreditAllocation: call.promotionalCreditAllocation }),
    ...(quote.spendingPeriods === undefined ? {} : { spendingPeriods: quote.spendingPeriods }),
  }
}

export const readBookingArgs = v.object({ callRef: v.string() })
export const readBookingResult = v.union(v.object({
    kind: v.literal('available'),
    booking: bookingValue,
    financialState: v.optional(v.union(
      v.literal('reservation_pending'),
      v.literal('reserved'),
      v.literal('possibly_submitted'),
      v.literal('outcome_unknown'),
      v.literal('released'),
      v.literal('settled'),
    )),
    reservationRefs: v.optional(transactionRefsValue),
    releaseRefs: v.optional(transactionRefsValue),
    settlementRefs: v.optional(transactionRefsValue),
    entryRefusalCode: v.optional(v.literal('financial_scope_locked')),
    remedyInProgress: v.optional(v.boolean()),
  }), v.object({ kind: v.literal('not_required') }), v.object({ kind: v.literal('not_found') }))
export const readBookingHandler = async (ctx: QueryCtx, args: Infer<typeof readBookingArgs>) => {
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (call === null || call.quoteRef === undefined) return { kind: 'not_found' as const }
    const quoteRef = call.quoteRef
    const quote = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef))
      .unique()
    if (quote === null) return { kind: 'not_found' as const }
    const booking = bookingFromRows(call, quote)
    if (booking === null) {
      return quote.sourceUsdcUnits === undefined && quote.decisionAudUnits === '0'
        ? { kind: 'not_required' as const }
        : { kind: 'not_found' as const }
    }
    const scopes = [
      ['account', booking.accountRef],
      ['legal_customer', booking.legalCustomerRef],
      ['treasury_pool', booking.treasuryRef],
      ['tool', booking.toolRef],
      ['provider_obligation', `provider-obligation:${booking.callRef}`],
    ] as const
    let financialScopeLocked = false
    for (const [scopeType, scopeRef] of scopes) {
      const openCase = await ctx.db.query('moneyReconciliationCases')
        .withIndex('by_scopeType_and_scopeRef_and_status', (index) => index
          .eq('scopeType', scopeType)
          .eq('scopeRef', scopeRef)
          .eq('status', 'open'))
        .first()
      if (openCase !== null) {
        financialScopeLocked = true
        break
      }
    }
    return {
      kind: 'available' as const,
      booking,
      ...(call.reconciliation?.leaseOwner?.startsWith('expired-unused:')
        || call.reconciliation?.leaseOwner?.startsWith('paid-result-loss:') ? { remedyInProgress: true } : {}),
      ...(financialScopeLocked ? { entryRefusalCode: 'financial_scope_locked' as const } : {}),
      ...(call.formanceFinancialState === undefined
        ? {}
        : { financialState: call.formanceFinancialState }),
      ...(call.formanceReservationRefs === undefined
        ? {}
        : { reservationRefs: call.formanceReservationRefs }),
      ...(call.formanceReleaseRefs === undefined
        ? {}
        : { releaseRefs: call.formanceReleaseRefs }),
      ...(call.formanceSettlementRefs === undefined
        ? {}
        : { settlementRefs: call.formanceSettlementRefs }),
    }
  }

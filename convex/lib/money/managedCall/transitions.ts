import { assertFinancialEnvironment } from '../formance/contracts'
import type { WorkId } from '@convex-dev/workpool'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import { restorePromotionalCredit } from '../promotionalCredit/allocation'
import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { bookingFromRows } from './booking'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'

export type TransitionResult = { kind: 'accepted'; state: string; replayed: boolean } | { kind: 'refused'; code: string }
export const transitionResult = v.union(
  v.object({ kind: v.literal('accepted'), state: v.string(), replayed: v.boolean() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

export const markPossiblySubmittedArgs = v.object({ callRef: v.string(), evidenceDigest: v.string(), now: v.number() })
export const markPossiblySubmittedResult = transitionResult
export const markPossiblySubmittedHandler = async (ctx: MutationCtx, args: Infer<typeof markPossiblySubmittedArgs>) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (row !== null) assertFinancialEnvironment(row.environment)
    if (row === null || row.formanceReservationRefs === undefined) {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (row.formanceFinancialState === 'possibly_submitted'
      || row.formanceFinancialState === 'outcome_unknown') {
      return { kind: 'accepted' as const, state: row.formanceFinancialState, replayed: true }
    }
    if (row.formanceFinancialState !== 'reserved') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'possibly_submitted',
      updatedAt: args.now,
    })
    return { kind: 'accepted' as const, state: 'possibly_submitted', replayed: false }
  }

export const markOutcomeUnknownArgs = v.object({ callRef: v.string(), evidenceDigest: v.string(), now: v.number() })
export const markOutcomeUnknownResult = transitionResult
export const markOutcomeUnknownHandler = async (ctx: MutationCtx, args: Infer<typeof markOutcomeUnknownArgs>) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (row !== null) assertFinancialEnvironment(row.environment)
    if (row === null || row.formanceReservationRefs === undefined) {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (row.formanceFinancialState === 'outcome_unknown') {
      return { kind: 'accepted' as const, state: 'outcome_unknown', replayed: true }
    }
    if (row.formanceFinancialState !== 'reserved'
      && row.formanceFinancialState !== 'possibly_submitted') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'outcome_unknown',
      updatedAt: args.now,
    })
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (obligation !== null) await ctx.db.patch(obligation._id, { state: 'held', updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'outcome_unknown', replayed: false }
  }

export const finalizeReleaseArgs = v.object({ callRef: v.string(), transactionRefs: v.array(v.string()), now: v.number(), expectedBookingDigest: v.optional(v.string()) })
export const finalizeReleaseResult = transitionResult
function isManualSettlementHold(row: Doc<'capabilityCalls'>): boolean {
  return row.state === 'reconciliation_required'
    && row.reconciliation?.disposition === 'manual_review'
    && row.reconciliation.reason === 'unknown_settlement'
}

// Requires a frozen consumed booking, drained exact manual hold and complete
// original local accounting. Ensures only a complete native unpaid-release read
// can restore promo once and reverse the unpaid obligation. Invariant: result,
// hold, attempts and execution authority remain unchanged. On violation: refuse
// before writes; exact replay cannot inflate clocks or grant counters.
async function finalizeHistoricalRelease(
  ctx: MutationCtx,
  args: Infer<typeof finalizeReleaseArgs>,
  row: Doc<'capabilityCalls'> | null,
): Promise<TransitionResult> {
  if (!Number.isSafeInteger(args.now) || args.now < 0 || args.now > 8_640_000_000_000_000) {
    return { kind: 'refused', code: 'managed_call_recovery_time_invalid' }
  }
  const quoteRef = row?.quoteRef
  const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  const booking = row === null || quote === null ? null : bookingFromRows(row, quote)
  if (row === null || quote === null || booking === null || canonicalDigest(booking) !== args.expectedBookingDigest
    || quote.state !== 'consumed' || (quote.consumedCallRef !== undefined && quote.consumedCallRef !== row.callRef)) {
    return { kind: 'refused', code: 'managed_call_booking_changed' }
  }
  if (!isManualSettlementHold(row) || row.result?.kind !== 'reconciliation_required'
    || row.dispatchState !== 'reconciliation_required') {
    return { kind: 'refused', code: 'call_manual_settlement_review_required' }
  }
  if (row.reconciliation?.leaseOwner !== undefined || row.reconciliation?.leaseExpiresAt !== undefined) {
    return { kind: 'refused', code: 'managed_call_remedy_in_progress' }
  }
  if (row.workId !== undefined && (await marketDispatchWorkpool.status(ctx, row.workId as WorkId)).state !== 'finished') {
    return { kind: 'refused', code: 'managed_call_work_not_drained' }
  }
  const originalRefs = row.formanceReservationRefs
  if (originalRefs === undefined || originalRefs.length !== 3 + (row.promotionalCreditAllocation?.grants.length ?? 0)
    || originalRefs.some(ref => ref.length === 0)
    || row.formanceReservationDigest !== canonicalDigest({
      format: 'ae.formance-managed-call-reservation:v1', callRef: row.callRef, transactionRefs: originalRefs,
    })) return { kind: 'refused', code: 'managed_call_reservation_evidence_invalid' }
  const receipt = row.result.receipt
  if ((row.formanceFinancialState !== 'outcome_unknown' && row.formanceFinancialState !== 'released')
    || row.formanceSettlementRefs !== undefined || row.buyerSaleTransactionRef !== undefined
    || receipt?.state === 'settled' || receipt?.state === 'refunded' || receipt?.refundState === 'released'
    || receipt?.externalSettlementRef !== undefined || row.usage?.chargeState === 'refunded'
    || (receipt?.transactionRef !== undefined && receipt.transactionRef !== originalRefs[0])
    || (receipt?.accountingTransactionRefs !== undefined
      && JSON.stringify(receipt.accountingTransactionRefs) !== JSON.stringify(originalRefs.slice(0, 1)))
    || (row.formanceFinancialState !== 'released' && row.formanceReleaseRefs !== undefined)) {
    return { kind: 'refused', code: 'managed_call_state_conflict' }
  }
  const paidAttempt = await ctx.db.query('moneyX402PaymentAttempts').withIndex('by_dispatchRef', q => q.eq('dispatchRef', row.callRef))
    .filter(q => q.eq(q.field('settlementStatus'), 'settled')).first()
  if (paidAttempt !== null) return { kind: 'refused', code: 'managed_call_state_conflict' }
  if (args.transactionRefs.length !== 2 + (row.promotionalCreditAllocation?.grants.length ?? 0)
    || args.transactionRefs.some(ref => ref.length === 0)) {
    return { kind: 'refused', code: 'managed_call_release_invalid' }
  }
  const obligationRef = `provider-obligation:${row.callRef}`
  const byRef = await ctx.db.query('moneyProviderObligations').withIndex('by_obligationRef', q => q.eq('obligationRef', obligationRef)).take(2)
  const byCall = await ctx.db.query('moneyProviderObligations').withIndex('by_callRef', q => q.eq('callRef', row.callRef)).take(2)
  const obligation = byRef[0]
  if (byRef.length !== 1 || byCall.length !== 1 || obligation === undefined || byCall[0]?._id !== obligation._id) {
    return { kind: 'refused', code: 'managed_call_obligation_missing' }
  }
  if (obligation.obligationRef !== obligationRef || obligation.callRef !== booking.callRef
    || obligation.toolRef !== booking.toolRef || obligation.providerRef !== booking.providerRef
    || obligation.buyerAccountRef !== booking.accountRef || obligation.buyerAsset !== 'AUD' || obligation.buyerExponent !== 6
    || obligation.buyerAmountUnits !== booking.buyerAmountUnits || obligation.providerAsset !== 'USDC' || obligation.providerExponent !== 6
    || obligation.providerAmountUnits !== booking.providerAmountUnits || obligation.settlementMethod !== 'managed_x402'
    || obligation.payoutEligibility !== 'ineligible_x402') {
    return { kind: 'refused', code: 'managed_call_obligation_evidence_invalid' }
  }
  if (obligation.settlementTransactionRef !== undefined || obligation.settledAt !== undefined
    || obligation.reversalState !== undefined || obligation.reversalCommandRef !== undefined
    || obligation.reversalIdempotencyKey !== undefined || obligation.reversalEvidenceDigest !== undefined
    || obligation.reversalTransactionRef !== undefined || obligation.reversalStatusRef !== undefined || obligation.reversedAt !== undefined
    || (row.formanceFinancialState === 'released' ? obligation.state !== 'reversed'
      : obligation.state !== 'accrued' && obligation.state !== 'held')) {
    return { kind: 'refused', code: 'managed_call_obligation_state_conflict' }
  }
  // Even replay needs the original source grant identities/expiry. Availability
  // can change through legitimate later spending/expiry; replay never increments.
  for (const allocated of row.promotionalCreditAllocation?.grants ?? []) {
    const grant = await ctx.db.query('moneyPromotionalGrants').withIndex('by_grantRef', q => q.eq('grantRef', allocated.grantRef)).unique()
    if (grant === null || grant.accountRef !== row.ownerId || grant.environment !== row.environment
      || grant.bookingState !== 'booked' || grant.expiresAt !== allocated.expiresAt) {
      return { kind: 'refused', code: 'managed_call_promotional_evidence_invalid' }
    }
    const maximum = BigInt(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits)
    const amounts = [allocated.amountUnits, grant.amountUnits, grant.availableUnits]
      .map(value => /^(?:0|[1-9]\d{0,15})$/u.test(value) ? BigInt(value) : null)
    const [returned, original, available] = amounts
    if (returned === undefined || original === undefined || available === undefined
      || returned === null || original === null || available === null || returned === 0n
      || returned > maximum || original > maximum || available > maximum
      || returned > original || available > original) {
      return { kind: 'refused', code: 'managed_call_promotional_evidence_invalid' }
    }
  }
  if (row.formanceFinancialState === 'released') {
    return JSON.stringify(row.formanceReleaseRefs) === JSON.stringify(args.transactionRefs)
      ? { kind: 'accepted', state: 'released', replayed: true }
      : { kind: 'refused', code: 'managed_call_release_conflict' }
  }
  if (row.promotionalCreditAllocation !== undefined) {
    const restored = await restorePromotionalCredit(ctx, row.promotionalCreditAllocation, row.ownerId, row.environment, args.now)
    if (restored.kind !== 'restored') return { kind: 'refused', code: 'managed_call_promotional_evidence_invalid' }
  }
  await ctx.db.patch(obligation._id, { state: 'reversed', updatedAt: args.now })
  await ctx.db.patch(row._id, { formanceFinancialState: 'released', formanceReleaseRefs: [...args.transactionRefs], updatedAt: args.now })
  return { kind: 'accepted', state: 'released', replayed: false }
}

export const finalizeReleaseHandler = async (ctx: MutationCtx, args: Infer<typeof finalizeReleaseArgs>) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (row !== null) assertFinancialEnvironment(row.environment)
    if (args.expectedBookingDigest !== undefined) return await finalizeHistoricalRelease(ctx, args, row)
    if (row !== null && isManualSettlementHold(row)) return { kind: 'refused' as const, code: 'call_manual_settlement_review_required' }
    if (row === null || args.transactionRefs.length !== 2 + (row.promotionalCreditAllocation?.grants.length ?? 0)) {
      return { kind: 'refused' as const, code: 'managed_call_release_invalid' }
    }
    if (row.formanceFinancialState === 'released') {
      return JSON.stringify(row.formanceReleaseRefs) === JSON.stringify(args.transactionRefs)
        ? { kind: 'accepted' as const, state: 'released', replayed: true }
        : { kind: 'refused' as const, code: 'managed_call_release_conflict' }
    }
    if (row.formanceFinancialState !== 'reserved') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    if (row.promotionalCreditAllocation !== undefined) {
      const restored = await restorePromotionalCredit(ctx, row.promotionalCreditAllocation, row.ownerId, row.environment, args.now)
      if (restored.kind !== 'restored') throw new Error('promotional_credit_restore_failed')
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'released',
      formanceReleaseRefs: [...args.transactionRefs],
      updatedAt: args.now,
    })
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (obligation !== null) await ctx.db.patch(obligation._id, { state: 'reversed', updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'released', replayed: false }
  }

export const finalizeSettlementArgs = v.object({ callRef: v.string(), transactionRefs: v.array(v.string()), now: v.number(), expectedBookingDigest: v.optional(v.string()) })
export const finalizeSettlementResult = transitionResult
export const finalizeSettlementHandler = async (ctx: MutationCtx, args: Infer<typeof finalizeSettlementArgs>) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (row !== null) assertFinancialEnvironment(row.environment)
    // A native read is valid only for this exact current booking, including on
    // replay. Check before any accounting write; older callers remain supported.
    let boundObligation: Doc<'moneyProviderObligations'> | undefined
    if (args.expectedBookingDigest !== undefined) {
      const quoteRef = row?.quoteRef
      const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
        .withIndex('by_quoteRef', query => query.eq('quoteRef', quoteRef)).unique()
      const booking = row === null || quote === null ? null : bookingFromRows(row, quote)
      if (booking === null || canonicalDigest(booking) !== args.expectedBookingDigest) {
        return { kind: 'refused' as const, code: 'managed_call_booking_changed' }
      }
      // Requires the original local attachment and canonical obligation to
      // survive restore. Ensures repair cannot recreate absent evidence or
      // overwrite later dispositions. Invariant: settled replay is complete
      // only with an exact settled obligation. On violation: refuse, no writes.
      const reservationRefs = row?.formanceReservationRefs
      if (row === null || reservationRefs === undefined
        || reservationRefs.length !== 3 + (row.promotionalCreditAllocation?.grants.length ?? 0)
        || row.formanceReservationDigest === undefined
        || row.formanceReservationDigest !== canonicalDigest({
          format: 'ae.formance-managed-call-reservation:v1', callRef: row.callRef, transactionRefs: reservationRefs,
        })) return { kind: 'refused' as const, code: 'managed_call_reservation_evidence_invalid' }
      const obligation = await ctx.db.query('moneyProviderObligations')
        .withIndex('by_obligationRef', query => query.eq('obligationRef', `provider-obligation:${booking.callRef}`)).unique()
      if (obligation === null) return { kind: 'refused' as const, code: 'managed_call_obligation_missing' }
      if (obligation.obligationRef !== `provider-obligation:${booking.callRef}`
        || obligation.callRef !== booking.callRef || obligation.toolRef !== booking.toolRef
        || obligation.providerRef !== booking.providerRef || obligation.buyerAccountRef !== booking.accountRef
        || obligation.buyerAsset !== 'AUD' || obligation.buyerExponent !== 6
        || obligation.buyerAmountUnits !== booking.buyerAmountUnits
        || obligation.providerAsset !== 'USDC' || obligation.providerExponent !== 6
        || obligation.providerAmountUnits !== booking.providerAmountUnits
        || obligation.settlementMethod !== 'managed_x402' || obligation.payoutEligibility !== 'ineligible_x402') {
        return { kind: 'refused' as const, code: 'managed_call_obligation_evidence_invalid' }
      }
      if ((obligation.state !== 'accrued' && obligation.state !== 'held' && obligation.state !== 'settled')
        || obligation.reversalState !== undefined || obligation.reversalCommandRef !== undefined
        || obligation.reversalIdempotencyKey !== undefined || obligation.reversalEvidenceDigest !== undefined
        || obligation.reversalTransactionRef !== undefined || obligation.reversalStatusRef !== undefined
        || obligation.reversedAt !== undefined
        || (row.formanceFinancialState === 'settled' && obligation.state !== 'settled')) {
        return { kind: 'refused' as const, code: 'managed_call_obligation_state_conflict' }
      }
      if ((obligation.settlementTransactionRef !== undefined
        && obligation.settlementTransactionRef !== args.transactionRefs[1])
        || (obligation.state === 'settled' && obligation.settlementTransactionRef !== args.transactionRefs[1])) {
        return { kind: 'refused' as const, code: 'managed_call_obligation_settlement_conflict' }
      }
      boundObligation = obligation
    }
    const [buyerSaleTransactionRef, settlementTransactionRef] = args.transactionRefs
    if (row === null || args.transactionRefs.length !== 2 + (row.promotionalCreditAllocation?.grants.length ?? 0) || !buyerSaleTransactionRef || !settlementTransactionRef) {
      return { kind: 'refused' as const, code: 'managed_call_settlement_invalid' }
    }
    if (row.reconciliation?.leaseOwner?.startsWith('paid-result-loss:')
      || row.reconciliation?.leaseOwner?.startsWith('expired-unused:')) {
      return { kind: 'refused' as const, code: 'managed_call_remedy_in_progress' }
    }
    if (row.formanceFinancialState === 'settled') {
      if (JSON.stringify(row.formanceSettlementRefs) !== JSON.stringify(args.transactionRefs)
        || (row.buyerSaleTransactionRef !== undefined && row.buyerSaleTransactionRef !== buyerSaleTransactionRef)) {
        return { kind: 'refused' as const, code: 'managed_call_settlement_conflict' }
      }
      if (row.buyerSaleTransactionRef === undefined) {
        await ctx.db.patch(row._id, { buyerSaleTransactionRef, updatedAt: args.now })
      }
      return { kind: 'accepted' as const, state: 'settled', replayed: true }
    }
    if (row.formanceFinancialState !== 'possibly_submitted'
      && row.formanceFinancialState !== 'outcome_unknown') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await ctx.db.patch(row._id, {
      formanceFinancialState: 'settled',
      formanceSettlementRefs: [...args.transactionRefs],
      buyerSaleTransactionRef,
      updatedAt: args.now,
    })
    const obligation = boundObligation ?? await ctx.db.query('moneyProviderObligations')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (obligation !== null && boundObligation?.state !== 'settled') {
      await ctx.db.patch(obligation._id, {
        state: 'settled',
        settlementTransactionRef,
        evidenceRefs: [...new Set([...obligation.evidenceRefs, ...args.transactionRefs])].slice(-32),
        settledAt: args.now,
        updatedAt: args.now,
      })
    }
    return { kind: 'accepted' as const, state: 'settled', replayed: false }
  }

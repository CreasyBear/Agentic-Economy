import { restorePromotionalCredit } from '../promotionalCredit/allocation'
import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { bookingFromRows } from './booking'

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

export const finalizeReleaseArgs = v.object({ callRef: v.string(), transactionRefs: v.array(v.string()), now: v.number() })
export const finalizeReleaseResult = transitionResult
export const finalizeReleaseHandler = async (ctx: MutationCtx, args: Infer<typeof finalizeReleaseArgs>) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
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

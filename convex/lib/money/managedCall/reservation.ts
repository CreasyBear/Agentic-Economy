import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { bookingFromRows, transactionRefsValue } from './booking'
import { transitionResult, type TransitionResult } from './transitions'

function isManualSettlementHold(call: Doc<'capabilityCalls'>): boolean {
  return call.state === 'reconciliation_required'
    && call.reconciliation?.disposition === 'manual_review'
    && call.reconciliation.reason === 'unknown_settlement'
}

async function loadRows(ctx: MutationCtx, callRef: string) {
  const call = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
    .unique()
  if (call === null || call.quoteRef === undefined) return null
  const quoteRef = call.quoteRef
  const quote = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', quoteRef))
    .unique()
  return quote === null ? null : { call, quote }
}

// A lease grants permission to retry; it never establishes absence of an old write.
export const claimReservationAttemptArgs = v.object({ callRef: v.string(), initialAdmission: v.boolean() })
export const claimReservationAttemptResult = v.union(
  v.object({ kind: v.literal('claimed'), generation: v.number() }),
  v.object({ kind: v.literal('busy') }),
)
export const claimReservationAttemptHandler = async (ctx: MutationCtx, args: Infer<typeof claimReservationAttemptArgs>) => {
  const rows = await loadRows(ctx, args.callRef)
  if (rows === null || isManualSettlementHold(rows.call) || rows.call.formanceReservationRefs !== undefined
    || rows.call.workId !== undefined || rows.call.authority !== undefined
    || (rows.call.formanceFinancialState !== 'reservation_pending'
      && rows.call.formanceFinancialState !== undefined && rows.call.formanceFinancialState !== 'outcome_unknown')) {
    return { kind: 'busy' as const }
  }
  const now = Date.now()
  const prior = rows.call.formanceReservationAttempt
  if (prior !== undefined && prior.leaseUntil > now) return { kind: 'busy' as const }
  const generation = (prior?.generation ?? 0) + 1
  await ctx.db.patch(rows.call._id, { formanceReservationAttempt: {
    generation, leaseUntil: now + 30_000, ambiguous: !args.initialAdmission || prior !== undefined || rows.call.formanceFinancialState === 'outcome_unknown',
  } })
  return { kind: 'claimed' as const, generation }
}

export const attachReservationArgs = v.object({ callRef: v.string(), transactionRefs: transactionRefsValue })
export const attachReservationResult = v.union(
    v.object({ kind: v.literal('attached'), replayed: v.boolean() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  )
export const attachReservationHandler = async (ctx: MutationCtx, args: Infer<typeof attachReservationArgs>) => {
    const rows = await loadRows(ctx, args.callRef)
    if (rows !== null && isManualSettlementHold(rows.call)) {
      return { kind: 'refused' as const, code: 'call_manual_settlement_review_required' }
    }
    if (rows === null || args.transactionRefs.length !== 3 + (rows.call.promotionalCreditAllocation?.grants.length ?? 0)) {
      return { kind: 'refused' as const, code: 'formance_reservation_invalid' }
    }
    const digest = canonicalDigest({
      format: 'ae.formance-managed-call-reservation:v1',
      callRef: args.callRef,
      transactionRefs: args.transactionRefs,
    })
    if (rows.call.formanceReservationDigest !== undefined) {
      return rows.call.formanceReservationDigest === digest
        ? { kind: 'attached' as const, replayed: true }
        : { kind: 'refused' as const, code: 'formance_reservation_conflict' }
    }
    const recoveringReservation = rows.call.state === 'reconciliation_required'
      && rows.call.formanceFinancialState === 'outcome_unknown'
      && rows.call.formanceReservationRefs === undefined && rows.call.workId === undefined
      && rows.call.authority === undefined
    if ((rows.call.state !== 'pending' && !recoveringReservation) || rows.quote.state !== 'consumed') {
      return { kind: 'refused' as const, code: 'formance_reservation_state_conflict' }
    }
    const booking = bookingFromRows(rows.call, rows.quote)
    if (booking === null) {
      return { kind: 'refused' as const, code: 'formance_reservation_material_invalid' }
    }
    const now = Date.now()
    const obligationRef = `provider-obligation:${args.callRef}`
    const existingObligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (query) => query.eq('obligationRef', obligationRef))
      .unique()
    if (existingObligation !== null) {
      const sameObligation = existingObligation.callRef === args.callRef
        && existingObligation.toolRef === booking.toolRef
        && existingObligation.providerRef === booking.providerRef
        && existingObligation.buyerAccountRef === booking.accountRef
        && existingObligation.buyerAmountUnits === booking.buyerAmountUnits
        && existingObligation.providerAmountUnits === booking.providerAmountUnits
      if (!sameObligation) {
        return { kind: 'refused' as const, code: 'provider_obligation_identity_conflict' }
      }
    } else {
      await ctx.db.insert('moneyProviderObligations', {
        obligationRef,
        callRef: args.callRef,
        toolRef: booking.toolRef,
        providerRef: booking.providerRef,
        buyerAccountRef: booking.accountRef,
        buyerAsset: 'AUD',
        buyerExponent: 6,
        buyerAmountUnits: booking.buyerAmountUnits,
        providerAsset: 'USDC',
        providerExponent: 6,
        providerAmountUnits: booking.providerAmountUnits,
        settlementMethod: 'managed_x402',
        state: 'accrued',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: [
          booking.quoteRef,
          ...args.transactionRefs,
        ],
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.patch(rows.call._id, {
      ...(recoveringReservation ? { state: 'pending' as const, dispatchState: undefined, result: undefined,
        formanceUnknownReference: undefined, formanceUnknownStatusRef: undefined } : {}),
      formanceFinancialState: 'reserved',
      formanceReservationRefs: [...args.transactionRefs],
      formanceReservationDigest: digest,
      updatedAt: now,
    })
    return { kind: 'attached' as const, replayed: false }
  }

export const markReservationUnknownArgs = v.object({ callRef: v.string(), reference: v.string(), statusRef: v.string() })
export const markReservationUnknownResult = v.boolean()
export const markReservationUnknownHandler = async (ctx: MutationCtx, args: Infer<typeof markReservationUnknownArgs>) => {
    const rows = await loadRows(ctx, args.callRef)
    if (rows === null || isManualSettlementHold(rows.call) || rows.call.formanceReservationDigest !== undefined
      || (rows.call.state !== 'pending' && rows.call.formanceFinancialState !== 'outcome_unknown')) return false
    await ctx.db.patch(rows.call._id, {
      formanceFinancialState: 'outcome_unknown',
      formanceUnknownReference: args.reference,
      formanceUnknownStatusRef: args.statusRef,
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        callRef: rows.call.callRef,
        toolRef: rows.call.toolRef,
        evidence: {
          attemptRef: `formance-reservation:${rows.call.callRef}`,
          effectGeneration: 1,
          requiredAt: new Date().toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: args.statusRef,
        },
      },
      updatedAt: Date.now(),
    })
    return true
  }

export const repairReservationArgs = v.object({
  callRef: v.string(), transactionRefs: transactionRefsValue, expectedBookingDigest: v.string(), now: v.number(),
})
export const repairReservationResult = transitionResult

// Requires exact native proof for the frozen consumed booking and drained effect
// writers. Ensures only absent compatible accounting facts are restored under
// manual unknown-settlement review. Invariant: history never becomes spendable
// reservation/retry authority; input, attempts and existing uncertainty survive.
// On violation refuse before all writes; exact concurrent replay is inert.
export async function repairReservationHandler(
  ctx: MutationCtx,
  args: Infer<typeof repairReservationArgs>,
): Promise<TransitionResult> {
  if (!Number.isSafeInteger(args.now) || args.now < 0 || args.now > 8_640_000_000_000_000) {
    return { kind: 'refused', code: 'managed_call_recovery_time_invalid' }
  }
  const rows = await loadRows(ctx, args.callRef)
  const booking = rows === null ? null : bookingFromRows(rows.call, rows.quote)
  if (rows === null || booking === null || canonicalDigest(booking) !== args.expectedBookingDigest
    || rows.quote.state !== 'consumed'
    || (rows.quote.consumedCallRef !== undefined && rows.quote.consumedCallRef !== args.callRef)) {
    return { kind: 'refused', code: 'managed_call_booking_changed' }
  }
  const call = rows.call
  const receipt = call.result !== undefined && 'receipt' in call.result ? call.result.receipt : undefined
  if ((call.state !== 'pending' && call.state !== 'reconciliation_required')
    || (call.result !== undefined && call.result.kind !== 'pending' && call.result.kind !== 'reconciliation_required')
    || call.formanceFinancialState === 'settled' || call.formanceFinancialState === 'released'
    || call.formanceSettlementRefs !== undefined || call.buyerSaleTransactionRef !== undefined
    || call.formanceReleaseRefs !== undefined || call.usage?.chargeState === 'refunded'
    || receipt?.state === 'settled' || receipt?.state === 'refunded' || receipt?.refundState === 'released'
    || (receipt?.transactionRef !== undefined && receipt.transactionRef !== args.transactionRefs[0])
    || (receipt?.accountingTransactionRefs !== undefined
      && JSON.stringify(receipt.accountingTransactionRefs) !== JSON.stringify(args.transactionRefs.slice(0, 1)))
    || (call.reconciliation !== undefined && call.reconciliation.reason !== 'unknown_settlement')) {
    return { kind: 'refused', code: 'managed_call_state_conflict' }
  }
  if (call.reconciliation?.leaseOwner !== undefined || call.reconciliation?.leaseExpiresAt !== undefined) {
    return { kind: 'refused', code: 'managed_call_remedy_in_progress' }
  }
  if (call.workId !== undefined && (!isManualSettlementHold(call)
    || call.dispatchState !== 'reconciliation_required' || call.result?.kind !== 'reconciliation_required')) {
    return { kind: 'refused', code: 'call_manual_settlement_review_required' }
  }
  if (args.transactionRefs.length !== 3 + (call.promotionalCreditAllocation?.grants.length ?? 0)
    || args.transactionRefs.some(ref => ref.length === 0)) {
    return { kind: 'refused', code: 'formance_reservation_invalid' }
  }
  const digest = canonicalDigest({ format: 'ae.formance-managed-call-reservation:v1',
    callRef: args.callRef, transactionRefs: args.transactionRefs })
  if ((call.formanceReservationRefs !== undefined
    && JSON.stringify(call.formanceReservationRefs) !== JSON.stringify(args.transactionRefs))
    || (call.formanceReservationDigest !== undefined && call.formanceReservationDigest !== digest)) {
    return { kind: 'refused', code: 'formance_reservation_conflict' }
  }
  const obligationRef = `provider-obligation:${args.callRef}`
  const byRef = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_obligationRef', q => q.eq('obligationRef', obligationRef)).take(2)
  const byCall = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).take(2)
  if (byRef.length > 1 || byCall.length > 1
    || byRef.some(row => row.callRef !== args.callRef)
    || byCall.some(row => row.obligationRef !== obligationRef)) {
    return { kind: 'refused', code: 'provider_obligation_identity_conflict' }
  }
  const obligation = byRef[0]
  if (obligation !== undefined) {
    if (obligation.toolRef !== booking.toolRef || obligation.providerRef !== booking.providerRef
      || obligation.buyerAccountRef !== booking.accountRef || obligation.buyerAsset !== 'AUD'
      || obligation.buyerExponent !== 6 || obligation.buyerAmountUnits !== booking.buyerAmountUnits
      || obligation.providerAsset !== 'USDC' || obligation.providerExponent !== 6
      || obligation.providerAmountUnits !== booking.providerAmountUnits
      || obligation.settlementMethod !== 'managed_x402' || obligation.payoutEligibility !== 'ineligible_x402') {
      return { kind: 'refused', code: 'provider_obligation_identity_conflict' }
    }
    if ((obligation.state !== 'accrued' && obligation.state !== 'held')
      || obligation.settlementTransactionRef !== undefined || obligation.settledAt !== undefined
      || obligation.reversalCommandRef !== undefined || obligation.reversalIdempotencyKey !== undefined
      || obligation.reversalEvidenceDigest !== undefined || obligation.reversalState !== undefined
      || obligation.reversalTransactionRef !== undefined || obligation.reversalStatusRef !== undefined
      || obligation.reversedAt !== undefined) return { kind: 'refused', code: 'managed_call_obligation_state_conflict' }
  }
  const complete = isManualSettlementHold(call) && call.dispatchState === 'reconciliation_required'
    && call.result?.kind === 'reconciliation_required' && call.formanceFinancialState === 'outcome_unknown'
    && call.formanceReservationRefs !== undefined && call.formanceReservationDigest === digest
    && obligation?.state === 'held'
  if (complete) return { kind: 'accepted', state: 'outcome_unknown', replayed: true }
  // Validate before inserting: the original pending result has no financial
  // finality. Normalize only that/missing result, following dispatch quarantine.
  const control = call.result?.kind === 'reconciliation_required' ? null : await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', q => q.eq('executionRef', call.callRef)).unique()
  if (obligation === undefined) {
    await ctx.db.insert('moneyProviderObligations', {
      obligationRef, callRef: args.callRef, toolRef: booking.toolRef, providerRef: booking.providerRef,
      buyerAccountRef: booking.accountRef, buyerAsset: 'AUD', buyerExponent: 6,
      buyerAmountUnits: booking.buyerAmountUnits, providerAsset: 'USDC', providerExponent: 6,
      providerAmountUnits: booking.providerAmountUnits, settlementMethod: 'managed_x402', state: 'held',
      payoutEligibility: 'ineligible_x402', evidenceRefs: [booking.quoteRef, ...args.transactionRefs],
      createdAt: args.now, updatedAt: args.now,
    })
  } else if (obligation.state === 'accrued') {
    await ctx.db.patch(obligation._id, { state: 'held', updatedAt: args.now })
  }
  await ctx.db.patch(call._id, {
    state: 'reconciliation_required', dispatchState: 'reconciliation_required', formanceFinancialState: 'outcome_unknown',
    formanceReservationRefs: [...args.transactionRefs], formanceReservationDigest: digest,
    result: call.result?.kind === 'reconciliation_required' ? call.result : {
      kind: 'reconciliation_required', callRef: call.callRef, toolRef: call.toolRef,
      evidence: { attemptRef: control?.currentAttemptRef ?? call.attemptRef ?? `operation-attempt:${call.callRef}:1`,
        effectGeneration: control?.currentEffectGeneration ?? 1, requiredAt: new Date(args.now).toISOString(),
        retry: 'reconcile_before_retry', evidenceSource: `published-tool:${call.toolRef}` },
    },
    reconciliation: isManualSettlementHold(call) && call.reconciliation !== undefined ? call.reconciliation : {
      disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: call.reconciliation?.attemptCount ?? 0,
      nextAttemptAt: args.now,
    },
    updatedAt: args.now,
  })
  return { kind: 'accepted', state: 'outcome_unknown', replayed: false }
}

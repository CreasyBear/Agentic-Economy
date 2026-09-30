import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { bookingFromRows, transactionRefsValue } from './booking'

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
  if (rows === null || rows.call.formanceReservationRefs !== undefined
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
    if (rows === null || rows.call.formanceReservationDigest !== undefined
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

import { restorePromotionalCredit } from '../promotionalCredit/allocation'
import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'

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

export const finalizeSettlementArgs = v.object({ callRef: v.string(), transactionRefs: v.array(v.string()), now: v.number() })
export const finalizeSettlementResult = transitionResult
export const finalizeSettlementHandler = async (ctx: MutationCtx, args: Infer<typeof finalizeSettlementArgs>) => {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
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
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
      .unique()
    if (obligation !== null) {
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

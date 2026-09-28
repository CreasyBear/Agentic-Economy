import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import type { FormanceManagedCallBooking, FormanceMoneyResult } from '../../../../src/modules/money/public'
import { transitionResult, type TransitionResult } from './transitions'

type ManagedCallMaterial =
  | {
      kind: 'available'
      booking: FormanceManagedCallBooking
      financialState?: 'reservation_pending' | 'reserved' | 'possibly_submitted' | 'outcome_unknown' | 'released' | 'settled'
      reservationRefs?: string[]
      releaseRefs?: string[]
      settlementRefs?: string[]
      remedyInProgress?: boolean
    }
  | { kind: 'not_found' | 'not_required' }

export const releaseBeforeSubmissionArgs = v.object({ callRef: v.string(), now: v.number() })
export const releaseBeforeSubmissionResult = transitionResult
export const releaseBeforeSubmissionHandler = async (ctx: ActionCtx, args: Infer<typeof releaseBeforeSubmissionArgs>): Promise<TransitionResult> => {
    const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
      callRef: args.callRef,
    })
    if (material.kind !== 'available') {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (material.financialState === 'released') {
      return { kind: 'accepted' as const, state: 'released', replayed: true }
    }
    if (material.financialState !== 'reserved') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    const result: FormanceMoneyResult = await ctx.runAction(internal.moneyFormance.releaseManagedCall, {
      booking: material.booking,
      externalEvidenceDigest: material.booking.quoteDigest,
      submissionProvenAbsent: true,
    })
    if (result.kind !== 'completed') {
      return {
        kind: 'refused' as const,
        code: result.kind === 'outcome_unknown'
          ? 'managed_call_release_unknown'
          : result.code,
      }
    }
    return await ctx.runMutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef: args.callRef,
      transactionRefs: [...result.transactionRefs],
      now: args.now,
    })
  }

export const settleArgs = v.object({ callRef: v.string(), evidenceDigest: v.string(), now: v.number() })
export const settleResult = transitionResult
export const settleHandler = async (ctx: ActionCtx, args: Infer<typeof settleArgs>): Promise<TransitionResult> => {
    const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, {
      callRef: args.callRef,
    })
    if (material.kind !== 'available') {
      return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    }
    if (material.remedyInProgress) return { kind: 'refused' as const, code: 'managed_call_remedy_in_progress' }
    if (material.financialState === 'settled') {
      if (material.settlementRefs === undefined) return { kind: 'refused', code: 'managed_call_settlement_invalid' }
      return await ctx.runMutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
        callRef: args.callRef,
        transactionRefs: [...material.settlementRefs],
        now: args.now,
      })
    }
    if (material.financialState !== 'possibly_submitted'
      && material.financialState !== 'outcome_unknown') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    const result: FormanceMoneyResult = await ctx.runAction(internal.moneyFormance.settleManagedCall, {
      booking: material.booking,
      externalEvidenceDigest: args.evidenceDigest,
    })
    if (result.kind !== 'completed') {
      return {
        kind: 'refused' as const,
        code: result.kind === 'outcome_unknown'
          ? 'managed_call_settlement_unknown'
          : result.code,
      }
    }
    return await ctx.runMutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      callRef: args.callRef,
      transactionRefs: [...result.transactionRefs],
      now: args.now,
    })
  }

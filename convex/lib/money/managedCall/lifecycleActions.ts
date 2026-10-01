import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import type { FormanceManagedCallBooking, FormanceMoneyResult, FormanceSettlementReadResult, FormanceReservationReadResult } from '../../../../src/modules/money/public'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
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

export const reconcileSettlementArgs = v.object({ callRef: v.string(), now: v.number() })
export const reconcileSettlementResult = transitionResult
// Requires the original executable booking and an eligible financial state.
// Ensures only exact native settlement evidence repairs accounting; the mutation
// rechecks the booking after this read. Invariant: no money write or delivery
// inference, even on a locally settled replay. On violation: refuse without writes.
export const reconcileSettlementHandler = async (
  ctx: ActionCtx,
  args: Infer<typeof reconcileSettlementArgs>,
): Promise<TransitionResult> => {
  const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, { callRef: args.callRef })
  if (material.kind !== 'available') return { kind: 'refused', code: 'managed_call_reservation_not_found' }
  if (material.remedyInProgress) return { kind: 'refused', code: 'managed_call_remedy_in_progress' }
  if (material.financialState !== 'possibly_submitted'
    && material.financialState !== 'outcome_unknown'
    && material.financialState !== 'settled') return { kind: 'refused', code: 'managed_call_state_conflict' }
  const expectedBookingDigest = canonicalDigest(material.booking)
  const result: FormanceSettlementReadResult = await ctx.runAction(internal.moneyFormance.readManagedCallSettlement, material.booking)
  if (result.kind !== 'confirmed') return { kind: 'refused', code: result.code }
  return await ctx.runMutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
    callRef: args.callRef,
    transactionRefs: [...result.transactionRefs],
    expectedBookingDigest,
    now: args.now,
  })
}

export const reconcileReservationArgs = v.object({ callRef: v.string(), now: v.number() })
export const reconcileReservationResult = transitionResult
// Historical native evidence permits only local accounting repair under a
// manual hold. The mutation revalidates booking and local facts after this read;
// it never grants reservation authority or removes original uncertainty.
export async function reconcileReservationHandler(
  ctx: ActionCtx,
  args: Infer<typeof reconcileReservationArgs>,
): Promise<TransitionResult> {
  const material: ManagedCallMaterial = await ctx.runQuery(internal.moneyManagedCall.readBooking, { callRef: args.callRef })
  if (material.kind !== 'available') return { kind: 'refused', code: 'managed_call_reservation_not_found' }
  if (material.remedyInProgress) return { kind: 'refused', code: 'managed_call_remedy_in_progress' }
  if (material.financialState === 'settled' || material.financialState === 'released') {
    return { kind: 'refused', code: 'managed_call_state_conflict' }
  }
  const expectedBookingDigest = canonicalDigest(material.booking)
  const result: FormanceReservationReadResult = await ctx.runAction(internal.moneyFormance.readManagedCallReservation, material.booking)
  if (result.kind !== 'confirmed') return { kind: 'refused', code: result.code }
  return await ctx.runMutation(internal.moneyManagedCall.repairReservation, {
    callRef: args.callRef, transactionRefs: [...result.transactionRefs], expectedBookingDigest, now: args.now,
  })
}

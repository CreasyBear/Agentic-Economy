"use node"

import type { FormanceMoneyResult } from '../../../../src/modules/money/public'
import type {
  FormanceBuyerAdjustment,
  FormanceCapacitySync,
  FormanceFundingBooking,
  FormanceManagedCallBooking,
  FormanceManagedCallFinalization,
  FormanceManagedCallRelease,
  FormanceProviderReversal,
  FormanceSpendingPeriodAdjustment,
} from './gateway'
import {
  adjustFormanceSpendingPeriod,
  bookFormanceFundingReversal,
  bookFormanceFundingSettlement,
  bookFormanceBuyerAdjustment,
  configuredContext,
  releaseFormanceManagedCall,
  reverseFormanceProviderSettlement,
  reserveFormanceManagedCall,
  settleFormanceManagedCall,
  remedyFormancePaidCall,
  syncFormanceCapacity,
} from './gateway'

function convexMoneyResult(result: FormanceMoneyResult) {
  return result.kind === 'completed'
    ? { ...result, transactionRefs: [...result.transactionRefs] }
    : result
}

export async function bookBuyerAdjustmentHandler(_ctx: unknown, args: FormanceBuyerAdjustment) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await bookFormanceBuyerAdjustment(context.context, args))
}

export async function bookFundingSettlementHandler(_ctx: unknown, args: FormanceFundingBooking) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await bookFormanceFundingSettlement(context.context, args))
}

export async function bookFundingReversalHandler(_ctx: unknown, args: FormanceFundingBooking) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await bookFormanceFundingReversal(context.context, args))
}

export async function syncCapacityHandler(_ctx: unknown, args: FormanceCapacitySync) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await syncFormanceCapacity(context.context, args))
}

export async function adjustSpendingPeriodHandler(_ctx: unknown, args: FormanceSpendingPeriodAdjustment) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await adjustFormanceSpendingPeriod(context.context, args))
}

export async function reserveManagedCallHandler(_ctx: unknown, args: FormanceManagedCallBooking) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await reserveFormanceManagedCall(context.context, args))
}

/** Proven pre-submission release only. Possible submission must not call this action. */
export async function releaseManagedCallHandler(_ctx: unknown, args: FormanceManagedCallRelease) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await releaseFormanceManagedCall(context.context, args))
}

/** Only called after canonical safe-block proof that the exact authorization expired unused. */
export async function releaseExpiredUnusedCallHandler(_ctx: unknown, args: {
  booking: FormanceManagedCallBooking
  externalEvidenceDigest: string
}) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await releaseFormanceManagedCall(context.context, {
        ...args, authorizationProvenExpiredUnused: true,
      }))
}

export async function settleManagedCallHandler(_ctx: unknown, args: FormanceManagedCallFinalization) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await settleFormanceManagedCall(context.context, args))
}

export async function remedyPaidCallHandler(_ctx: unknown, args: FormanceManagedCallFinalization) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await remedyFormancePaidCall(context.context, args))
}

export async function reverseProviderSettlementHandler(_ctx: unknown, args: FormanceProviderReversal) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await reverseFormanceProviderSettlement(context.context, args))
}

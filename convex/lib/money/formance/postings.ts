"use node"

import type { FinancialEnvironment } from './contracts'
import type { FormanceMoneyResult } from '../../../../src/modules/money/public'
import type {
  FormancePromotionalCreditBooking,
  FormanceSettledSaleRefund,
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
  grantFormancePromotionalCredit,
  expireFormancePromotionalCredit,
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
  refundFormanceSettledSale,
  syncFormanceCapacity,
} from './gateway'

function convexMoneyResult(result: FormanceMoneyResult) {
  return result.kind === 'completed'
    ? { ...result, transactionRefs: [...result.transactionRefs] }
    : result
}

export async function bookBuyerAdjustmentHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceBuyerAdjustment & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await bookFormanceBuyerAdjustment(context.context, args))
}

export async function bookFundingSettlementHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceFundingBooking & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await bookFormanceFundingSettlement(context.context, args))
}

export async function bookFundingReversalHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceFundingBooking & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await bookFormanceFundingReversal(context.context, args))
}

export async function syncCapacityHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceCapacitySync & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await syncFormanceCapacity(context.context, args))
}

export async function adjustSpendingPeriodHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceSpendingPeriodAdjustment & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await adjustFormanceSpendingPeriod(context.context, args))
}

export async function reserveManagedCallHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceManagedCallBooking & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await reserveFormanceManagedCall(context.context, args))
}

/** Proven pre-submission release only. Possible submission must not call this action. */
export async function releaseManagedCallHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceManagedCallRelease & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await releaseFormanceManagedCall(context.context, args))
}

/** Only called after canonical safe-block proof that the exact authorization expired unused. */
export async function releaseExpiredUnusedCallHandler(_ctx: unknown, { expectedEnvironment, ...args }: {
  expectedEnvironment: FinancialEnvironment
  booking: FormanceManagedCallBooking
  externalEvidenceDigest: string
}) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await releaseFormanceManagedCall(context.context, {
        ...args, authorizationProvenExpiredUnused: true,
      }))
}

export async function settleManagedCallHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceManagedCallFinalization & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await settleFormanceManagedCall(context.context, args))
}

export async function remedyPaidCallHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceManagedCallFinalization & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await remedyFormancePaidCall(context.context, args))
}

export async function reverseProviderSettlementHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceProviderReversal & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await reverseFormanceProviderSettlement(context.context, args))
}

export async function grantPromotionalCreditHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormancePromotionalCreditBooking & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  if (context.kind === 'setup_required') return { kind: 'refused' as const, code: context.code, retryable: false as const }
  return convexMoneyResult(await grantFormancePromotionalCredit(context.context, args))
}

export async function expirePromotionalCreditHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormancePromotionalCreditBooking & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  if (context.kind === 'setup_required') return { kind: 'refused' as const, code: context.code, retryable: false as const }
  return convexMoneyResult(await expireFormancePromotionalCredit(context.context, args))
}

export async function refundSettledSaleHandler(_ctx: unknown, { expectedEnvironment, ...args }: FormanceSettledSaleRefund & { expectedEnvironment: FinancialEnvironment }) {
  const context = configuredContext(expectedEnvironment)
  return context.kind === 'setup_required'
    ? { kind: 'refused' as const, code: context.code, retryable: false as const }
    : convexMoneyResult(await refundFormanceSettledSale(context.context, args))
}

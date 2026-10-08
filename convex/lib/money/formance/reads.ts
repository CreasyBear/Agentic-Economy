"use node"

import type { AccountCreditBalance, EligiblePromotionalGrant, FormanceManagedCallBooking } from '@/modules/money/public'
import type { Infer } from 'convex/values'
import { managedCallSettlementReadResult, managedCallReservationReadResult, managedCallReleaseReadResult } from './contracts'

import {
  configuredContext,
  withFormanceContext,
  formanceAccountMetadataDigest,
  readFormanceAccountHistory,
  readFormanceDisplayBalance,
  readFormanceAccountCreditBalance,
  readFormancePeriodSpend,
  readFormanceSpendingPeriod,
  readFormanceStatementPage,
  readFormanceManagedCallSettlement,
  readFormanceManagedCallReservation,
  readFormanceManagedCallRelease,
} from './gateway'

export async function readManagedCallSettlementHandler(
  _ctx: unknown,
  args: FormanceManagedCallBooking,
): Promise<Infer<typeof managedCallSettlementReadResult>> {
  const context = configuredContext()
  if (context.kind === 'setup_required') return { kind: 'refused', code: context.code }
  const result = await readFormanceManagedCallSettlement(context.context, args)
  return result.kind === 'confirmed'
    ? { kind: 'confirmed', transactionRefs: [...result.transactionRefs] }
    : result
}
export async function readManagedCallReservationHandler(
  _ctx: unknown,
  args: FormanceManagedCallBooking,
): Promise<Infer<typeof managedCallReservationReadResult>> {
  const context = configuredContext()
  if (context.kind === 'setup_required') return { kind: 'refused', code: context.code }
  const result = await readFormanceManagedCallReservation(context.context, args)
  return result.kind === 'confirmed'
    ? { kind: 'confirmed', transactionRefs: [...result.transactionRefs] }
    : result
}
export async function readManagedCallReleaseHandler(
  _ctx: unknown,
  args: FormanceManagedCallBooking,
): Promise<Infer<typeof managedCallReleaseReadResult>> {
  const context = configuredContext()
  if (context.kind === 'setup_required') return { kind: 'refused', code: context.code }
  const result = await readFormanceManagedCallRelease(context.context, args)
  return result.kind === 'confirmed'
    ? { kind: 'confirmed', transactionRefs: [...result.transactionRefs] }
    : result
}
export async function readPeriodSpendHandler(_ctx: unknown, args: {
  accountRef: string
  periodStartAt: number
  periodEndAt: number
  expectedEnvironment?: 'sandbox' | 'production'
}) {
  const accountDigest = formanceAccountMetadataDigest(args.accountRef)
  if (accountDigest === undefined) {
    return { kind: 'setup_required' as const, code: 'formance_spend_query_invalid' }
  }
  const context = configuredContext(args.expectedEnvironment)
  if (context.kind === 'setup_required') return context
  const result = await readFormancePeriodSpend(context.context, {
    accountDigest, periodStartAt: args.periodStartAt, periodEndAt: args.periodEndAt,
  })
  return result.kind === 'available' || result.kind === 'empty'
    ? { ...result, sales: result.sales.map(sale => ({ ...sale })) }
    : result
}

export async function readAccountHistoryHandler(_ctx: unknown, args: { accountRef: string; cursor?: string }) {
  const accountDigest = formanceAccountMetadataDigest(args.accountRef)
  const cursorKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (accountDigest === undefined || cursorKey === undefined || cursorKey.length < 32) {
    return { kind: 'setup_required' as const, code: 'formance_history_configuration_invalid' }
  }
  const context = configuredContext()
  return context.kind === 'setup_required' ? context : await readFormanceAccountHistory(context.context, {
    accountDigest, cursorKey, ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
  })
}

export async function readStatementPageHandler(_ctx: unknown, args: {
  accountRef: string
  periodStartAt: number
  periodEndAt: number
  snapshotCutoffAt: number
  cursor?: string
}) {
  const accountDigest = formanceAccountMetadataDigest(args.accountRef)
  if (accountDigest === undefined) {
    return { kind: 'setup_required' as const, code: 'formance_statement_query_invalid' }
  }
  const context = configuredContext()
  const result = context.kind === 'setup_required'
    ? context
    : await readFormanceStatementPage(context.context, {
        accountDigest,
        periodStartAt: args.periodStartAt,
        periodEndAt: args.periodEndAt,
        snapshotCutoffAt: args.snapshotCutoffAt,
        ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
      })
  return result.kind === 'available'
    ? { ...result, transactionRefs: [...result.transactionRefs] }
    : result
}

export async function readSpendingPeriodHandler(_ctx: unknown, args: {
  principalRef: string
  periodKind: 'day' | 'month'
  periodStartAt: number
  periodEndAt: number
}) {
  const context = configuredContext()
  if (context.kind === 'setup_required') return context
  const result = await readFormanceSpendingPeriod(context.context, args)
  return result.kind === 'available'
    ? { ...result, balanceKind: 'agent_budget' as const }
    : result
}

export async function readDisplayBalanceHandler(_ctx: unknown, args: {
  balanceKind: 'account_aud' | 'agent_budget' | 'legal_customer_exposure' | 'treasury_usdc'
  subjectRef: string
  generation?: number
}) {
  const context = configuredContext()
  return context.kind === 'setup_required'
    ? context
    : await readFormanceDisplayBalance(context.context, args)
}

export async function readCreditBalanceHandler(_ctx: unknown, args: { accountRef: string; grants: EligiblePromotionalGrant[] }): Promise<AccountCreditBalance> {
  return await withFormanceContext(context => readFormanceAccountCreditBalance(context, args))
}

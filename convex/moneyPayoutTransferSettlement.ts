import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  requireBillingSourceWrite,
  type BillingSourceWriteArgs,
} from './moneyBillingAuthorization'
import { accountFromRow } from './moneyCanonicalAccounts'
import { billingSourceArgs, exactAmount, identifier } from './moneyLedgerValues'
import { utcPeriodStartIso } from './lib/qualifiedUsePayout'
import {
  reconcileWorkloadCronSnapshot,
  parseWorkloadCronSnapshot,
} from './workloadCron'
import {
  amountAtScale,
  readExactAmount,
  transitionPayout,
  type ExactAmount,
} from '../src/modules/money/public'
import {
  payoutAccountAfterReservationMatches,
  payoutOwnedByCurrentOwner,
  payoutFromRow,
  payoutReservationCurrentAmountMatches,
  payoutReservationRowIdentityMatches,
  payoutSnapshotAmounts,
  payoutTransferRow,
  payoutTransferView,
  readPayoutReservationJournal,
  type PayoutTransferResult,
} from './moneyPayoutTransferShared'

function refusedPayout(code: string, retryable: boolean): PayoutTransferResult {
  return { kind: 'refused', code, retryable }
}

export type MarkPayoutTransferOutcomeUnknownArgs = BillingSourceWriteArgs & {
  businessId: string
  amount: ExactAmount
  providerAccountRef: string
  destinationAccountId: string
  payoutRef: string
  commandId: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  providerRecoveryDeadlineAt: number
  observedAt: number
  failureCode: string
}

export type DailySupplierSettlementArgs = {
  now?: number
  workload: unknown
}

export type DailySettlementResult = {
  kind: 'ran'
  periodStart: string
  unresolvedReservationCount: number
  begunCount: number
  notReadyCount: number
}

export const markPayoutTransferOutcomeUnknownArgs = {
  businessId: identifier,
  amount: exactAmount,
  providerAccountRef: identifier,
  destinationAccountId: identifier,
  payoutRef: identifier,
  commandId: identifier,
  inputDigest: identifier,
  requestDigest: identifier,
  idempotencyKey: identifier,
  providerRecoveryDeadlineAt: v.number(),
  observedAt: v.number(),
  failureCode: identifier,
  ...billingSourceArgs,
}
export const dailySettlementResultValue = v.object({
  kind: v.literal('ran'),
  periodStart: v.string(),
  unresolvedReservationCount: v.number(),
  begunCount: v.number(),
  notReadyCount: v.number(),
})

const DAILY_SETTLEMENT_LOOKBACK_DAYS = 7
const DAILY_SETTLEMENT_READ_LIMIT = 32
const DAILY_SETTLEMENT_BEGIN_LIMIT = 16

async function listDailyPayoutsByState(
  ctx: MutationCtx,
  periodStart: string,
  state: 'held_threshold' | 'transfer_pending' | 'outcome_unknown',
): Promise<Doc<'moneyPayouts'>[]> {
  return await ctx.db
    .query('moneyPayouts')
    .withIndex('by_periodStart_and_state', (q) =>
      q.eq('periodStart', periodStart).eq('state', state),
    )
    .take(DAILY_SETTLEMENT_READ_LIMIT)
}

/**
 * Read-only daily payout sweep. A human-confirmed owner mutation is the only
 * path that may reserve a new transfer.
 */
export async function runDailySupplierSettlementHandler(
  ctx: MutationCtx,
  args: DailySupplierSettlementArgs,
): Promise<DailySettlementResult> {
    await reconcileWorkloadCronSnapshot(
      ctx,
      'run daily supplier settlement',
      parseWorkloadCronSnapshot(args.workload),
    )
    const now = args.now ?? Date.now()
    const periodStart = utcPeriodStartIso(now, 1)
    let unresolvedReservationCount = 0
    for (let daysAgo = 1; daysAgo <= DAILY_SETTLEMENT_LOOKBACK_DAYS; daysAgo += 1) {
      const start = utcPeriodStartIso(now, daysAgo)
      const [pending, unknown] = await Promise.all([
        listDailyPayoutsByState(ctx, start, 'transfer_pending'),
        listDailyPayoutsByState(ctx, start, 'outcome_unknown'),
      ])
      unresolvedReservationCount += pending.length + unknown.length
    }
    const eligible: Doc<'moneyPayouts'>[] = []
    for (let daysAgo = 1; daysAgo <= DAILY_SETTLEMENT_LOOKBACK_DAYS; daysAgo += 1) {
      if (eligible.length >= DAILY_SETTLEMENT_BEGIN_LIMIT) break
      const held = await listDailyPayoutsByState(
        ctx,
        utcPeriodStartIso(now, daysAgo),
        'held_threshold',
      )
      for (const payout of held) {
        if (eligible.length >= DAILY_SETTLEMENT_BEGIN_LIMIT) break
        eligible.push(payout)
      }
    }
    return {
      kind: 'ran' as const,
      periodStart,
      unresolvedReservationCount,
      begunCount: 0,
      notReadyCount: eligible.length,
    }
}

export async function markPayoutTransferOutcomeUnknownHandler(
  ctx: MutationCtx,
  args: MarkPayoutTransferOutcomeUnknownArgs,
): Promise<PayoutTransferResult> {
    await requireBillingSourceWrite(ctx, args)
    if (!(await payoutOwnedByCurrentOwner(ctx, args.businessId)))
      return refusedPayout('billing_identity_missing', false)
    const requested = readExactAmount(args.amount)
    if (requested === undefined || requested.units === '0')
      return refusedPayout('payout_reconciliation_required', false)
    const [providerAccount, payoutAccount, payout] = await Promise.all([
      ctx.db
        .query('moneyAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('currency', requested.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('currency', requested.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
        .unique(),
    ])
    if (
      providerAccount === null ||
      payoutAccount === null ||
      payout === null ||
      providerAccount.accountKind !== 'provider_earnings' ||
      providerAccount.accountRef !== args.providerAccountRef ||
      providerAccount.businessId !== args.businessId ||
      providerAccount.currency !== requested.currency ||
      payout.businessId !== args.businessId ||
      payout.currency !== requested.currency ||
      payout.providerAccountRef !== args.providerAccountRef ||
      payout.destinationAccountId !== args.destinationAccountId ||
      payout.providerRecoveryDeadlineAt !== args.providerRecoveryDeadlineAt ||
      payout.stripeTransferId !== undefined
    )
      return refusedPayout('payout_reconciliation_required', false)
    const current = payoutFromRow(payout)
    const provider = accountFromRow(providerAccount)
    const amount = amountAtScale(
      requested,
      requested.currency,
      providerAccount.exponent,
    )
    if (current === undefined || provider === undefined || amount === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    const journal = await readPayoutReservationJournal(ctx, {
      payoutRef: args.payoutRef,
      payoutCommandId: args.commandId,
      inputDigest: args.inputDigest,
      requestDigest: args.requestDigest,
      idempotencyKey: args.idempotencyKey,
      amount,
      providerAccountRef: args.providerAccountRef,
      businessId: args.businessId,
    })
    if (journal.kind === 'conflict' || journal.kind === 'missing')
      return refusedPayout('payout_reconciliation_required', false)
    const snapshots = payoutSnapshotAmounts(payout)
    if (
      snapshots === undefined ||
      !payoutReservationRowIdentityMatches(payout, {
        businessId: args.businessId,
        payoutRef: args.payoutRef,
        amount,
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        payoutCommandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
      })
    )
      return refusedPayout('ledger_idempotency_conflict', false)
    if (!payoutReservationCurrentAmountMatches(payout, amount))
      return refusedPayout('payout_reconciliation_required', false)
    if (journal.transaction.state === 'outcome_unknown') {
      if (
        payout.state !== 'outcome_unknown' ||
        !payoutAccountAfterReservationMatches(
          provider,
          journal.transaction,
          snapshots,
          amount,
        )
      )
        return refusedPayout('payout_reconciliation_required', false)
      const transfer = payoutTransferView(payout)
      return transfer === undefined
        ? refusedPayout('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    if (
      journal.transaction.state !== 'pending' ||
      payout.state !== 'transfer_pending' ||
      !payoutAccountAfterReservationMatches(
        provider,
        journal.transaction,
        snapshots,
        amount,
      )
    )
      return refusedPayout('payout_reconciliation_required', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_unknown',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
      },
      account: {
        state: payoutAccount.state,
        detailsSubmitted: payoutAccount.detailsSubmitted,
        recipientCapabilityActive: payoutAccount.recipientCapabilityActive,
      },
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.patch('moneyTransactions', journal.transaction._id, {
      state: 'outcome_unknown',
      updatedAt: args.observedAt,
    })
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'outcome_unknown',
        providerRecoveryDeadlineAt: args.providerRecoveryDeadlineAt,
        failureCode: args.failureCode,
        transferObservedAt: args.observedAt,
        updatedAt: args.observedAt,
      }),
    )
    const updated = await ctx.db.get(payout._id)
    const transfer = updated === null ? undefined : payoutTransferView(updated)
    return transfer === undefined
      ? refusedPayout('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
}

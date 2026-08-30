import { v } from 'convex/values'

import type { MutationCtx } from './_generated/server'
import {
  requireBillingSourceWrite,
  type BillingSourceWriteArgs,
} from './moneyBillingAuthorization'
import { accountFromRow } from './moneyCanonicalAccounts'
import {
  billingSourceArgs,
  exactAmount,
  identifier,
  moneyRefusalValue,
} from './moneyLedgerValues'
import {
  dailyPayoutIdentityFromRow,
  readDailyPayoutComposition,
  type DailyPayoutComposition,
} from './lib/qualifiedUsePayout'
import {
  amountAtScale,
  amountFromParts,
  applyProviderAccountDebit,
  compareExactAmounts,
  readExactAmount,
  transitionPayout,
  zeroExactAmount,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
  type ExactAmount,
} from '../src/modules/money/public'
import {
  payoutAttemptMaterialIsFrozen,
  payoutAuthorityAllowed,
  payoutFromRow,
  payoutReservationCurrentAmountMatches,
  payoutReservationIdentity,
  payoutReservationRowIdentityMatches,
  payoutSnapshotAmounts,
  payoutTerminalReplayIsConsistent,
  payoutTransferRow,
  payoutTransferView,
  readLatestCompletedPayoutPaidAfter,
  readPayoutReservationJournal,
  type PayoutTransferResult,
} from './moneyPayoutTransferShared'

function refusedPayout(code: string, retryable: boolean): PayoutTransferResult {
  return { kind: 'refused', code, retryable }
}

export type BeginPayoutTransferArgs = BillingSourceWriteArgs & {
  authority: { principalId: string }
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
}

export const payoutTransferStateValue = v.union(
  v.literal('review'),
  v.literal('held_kyc'),
  v.literal('held_threshold'),
  v.literal('transfer_pending'),
  v.literal('paid'),
  v.literal('reversed'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
export const payoutTransferValue = v.object({
  payoutRef: identifier,
  payoutCommandId: identifier,
  state: payoutTransferStateValue,
  idempotencyKey: identifier,
  inputDigest: identifier,
  amount: exactAmount,
  destinationAccountId: identifier,
  stripeTransferId: v.optional(identifier),
  transferStatus: v.optional(
    v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('reversed'),
      v.literal('outcome_unknown'),
    ),
  ),
  requestDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  reversalEvidenceDigest: v.optional(identifier),
  providerRecoveryDeadlineAt: v.optional(v.number()),
  providerHeldBefore: v.optional(exactAmount),
  providerHeldAfter: v.optional(exactAmount),
  providerPaidBefore: v.optional(exactAmount),
  providerPaidAfter: v.optional(exactAmount),
})
export const payoutTransferResultValue = v.union(
  v.object({ kind: v.literal('accepted'), transfer: payoutTransferValue }),
  moneyRefusalValue,
)
export const payoutBeginArgs = {
  authority: v.object({ principalId: identifier }),
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
  ...billingSourceArgs,
}

type PayoutTransferBeginInput = Readonly<{
  businessId: string
  amount: unknown
  providerAccountRef: string
  destinationAccountId: string
  payoutRef: string
  commandId: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  providerRecoveryDeadlineAt: number
  observedAt: number
}>

export async function beginPayoutTransferReservation(
  ctx: MutationCtx,
  args: PayoutTransferBeginInput,
): Promise<PayoutTransferResult> {
    const requested = readExactAmount(args.amount)
    if (
      requested === undefined ||
      requested.units === '0' ||
      args.commandId.length === 0 ||
      args.requestDigest.length === 0 ||
      args.inputDigest.length === 0 ||
      args.idempotencyKey.length === 0 ||
      args.providerRecoveryDeadlineAt <= args.observedAt ||
      args.providerRecoveryDeadlineAt >
        args.observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS
    )
      return refusedPayout('payout_not_ready', false)
    const [providerAccount, payout] = await Promise.all([
      ctx.db
        .query('moneyAccounts')
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
      payout === null ||
      payout.businessId !== args.businessId ||
      payout.currency !== requested.currency ||
      providerAccount === null ||
      providerAccount.accountKind !== 'provider_earnings' ||
      providerAccount.accountRef !== args.providerAccountRef ||
      providerAccount.businessId !== args.businessId ||
      providerAccount.currency !== requested.currency ||
      payout.providerAccountRef !== args.providerAccountRef
    ) {
      return refusedPayout('payout_not_ready', false)
    }
    const current = payoutFromRow(payout)
    const provider = accountFromRow(providerAccount)
    if (current === undefined || provider === undefined) {
      return refusedPayout('payout_not_ready', false)
    }
    const amount = amountAtScale(
      requested,
      requested.currency,
      providerAccount.exponent,
    )
    if (amount === undefined)
      return refusedPayout('payout_not_ready', false)
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
    if (journal.kind === 'conflict')
      return refusedPayout('ledger_idempotency_conflict', false)
    if (journal.kind === 'found') {
      const snapshots = payoutSnapshotAmounts(payout)
      const rowMatches = payoutReservationRowIdentityMatches(payout, {
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
      if (snapshots === undefined || !rowMatches)
        return refusedPayout('ledger_idempotency_conflict', false)
      if (
        journal.transaction.currency !== amount.currency ||
        journal.transaction.exponent !== amount.exponent ||
        journal.transaction.amountUnits !== amount.units
      )
        return refusedPayout('ledger_idempotency_conflict', false)
      if (
        !(await payoutTerminalReplayIsConsistent({
          ctx,
          businessId: args.businessId,
          currency: requested.currency,
          amount,
          payout,
          provider,
          journal,
        }))
      )
        return refusedPayout('payout_reconciliation_required', false)
      const transfer = payoutTransferView(payout, amount)
      return transfer === undefined
        ? refusedPayout('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    const externalTransactions = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_externalRef', (q) => q.eq('externalRef', args.payoutRef))
      .take(2)
    if (
      payoutAttemptMaterialIsFrozen(payout) ||
      externalTransactions.length > 0
    )
      return refusedPayout('payout_not_ready', false)
    if (!payoutReservationCurrentAmountMatches(payout, amount))
      return refusedPayout('payout_not_ready', false)
    const payoutAccount = await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', requested.currency),
      )
      .unique()
    if (
      payoutAccount === null ||
      payoutAccount.stripeAccountId !== args.destinationAccountId ||
      payoutAccount.state !== 'ready' ||
      !payoutAccount.detailsSubmitted ||
      !payoutAccount.recipientCapabilityActive
    )
      return refusedPayout('payout_not_ready', false)
    const period = dailyPayoutIdentityFromRow(payout)
    let composition: DailyPayoutComposition | undefined
    if (period !== undefined) {
      try {
        composition = await readDailyPayoutComposition(
          ctx,
          period,
          payout.businessId,
          payout.currency,
          payout.exponent,
        )
      } catch {
        composition = undefined
      }
    }
    const payoutGross = amountFromParts(
      payout.currency,
      payout.grossAccrualUnits,
      payout.exponent,
    )
    const payoutRake = amountFromParts(
      payout.currency,
      payout.rakeUnits,
      payout.exponent,
    )
    const payoutProviderNet = amountFromParts(
      payout.currency,
      payout.providerNetUnits,
      payout.exponent,
    )
    if (
      period === undefined ||
      composition === undefined ||
      payoutGross === undefined ||
      payoutRake === undefined ||
      payoutProviderNet === undefined ||
      args.observedAt < period.periodEndAt ||
      providerAccount.exponent !== payout.exponent ||
      compareExactAmounts(payoutGross, composition.grossAccrual) !== 0 ||
      compareExactAmounts(payoutRake, composition.rake) !== 0 ||
      compareExactAmounts(payoutProviderNet, composition.providerNet) !== 0
    )
      return refusedPayout('payout_not_ready', false)
    const [pendingRows, unknownRows] = await Promise.all([
      ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_state', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('currency', requested.currency)
            .eq('state', 'transfer_pending'),
        )
        .take(2),
      ctx.db
        .query('moneyPayouts')
        .withIndex('by_businessId_and_currency_and_state', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('currency', requested.currency)
            .eq('state', 'outcome_unknown'),
        )
        .take(2),
    ])
    if (
      pendingRows.some((row) => row._id !== payout._id) ||
      unknownRows.some((row) => row._id !== payout._id)
    )
      return refusedPayout('payout_reconciliation_required', false)
    if (payout.state === 'outcome_unknown')
      return refusedPayout('payout_reconciliation_required', false)
    if (provider.recoveryDue.units !== '0')
      return refusedPayout('payout_reconciliation_required', false)
    if (compareExactAmounts(provider.balance, amount) === -1)
      return refusedPayout('payout_below_threshold', false)
    if (
      payout.payoutCommandId !== undefined &&
      (payout.state === 'transfer_pending' || payout.state === 'paid')
    )
      return refusedPayout('ledger_idempotency_conflict', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'begin_transfer',
        payoutCommandId: args.commandId,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
      },
      account: {
        state: payoutAccount.state,
        detailsSubmitted: payoutAccount.detailsSubmitted,
        recipientCapabilityActive: payoutAccount.recipientCapabilityActive,
      },
    })
    if (policy.kind === 'refused') return policy
    const providerAfter = applyProviderAccountDebit(
      provider,
      amount,
      args.observedAt,
    )
    if (
      providerAfter === undefined ||
      compareExactAmounts(providerAfter.balance, provider.balance) !== -1 ||
      providerAfter.recoveryDue.units !== '0'
    )
      return refusedPayout('payout_reconciliation_required', false)
    const providerPaidBefore = await readLatestCompletedPayoutPaidAfter(
      ctx,
      args.businessId,
      amount,
      payout._id,
    )
    if (providerPaidBefore === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    const zeroPaid = zeroExactAmount(amount.currency, amount.exponent)
    const paidBefore = providerPaidBefore ?? zeroPaid
    if (paidBefore === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    const identity = payoutReservationIdentity({
      payoutRef: args.payoutRef,
      payoutCommandId: args.commandId,
      inputDigest: args.inputDigest,
      requestDigest: args.requestDigest,
      idempotencyKey: args.idempotencyKey,
    })
    await ctx.db.insert('moneyTransactions', {
      transactionRef: identity.transactionRef,
      kind: 'payout_accrual',
      idempotencyKey: args.idempotencyKey,
      inputDigest: args.inputDigest,
      principalId: `business:${args.businessId}`,
      currency: amount.currency,
      amountUnits: amount.units,
      exponent: amount.exponent,
      state: 'pending',
      expectedAccountVersion: provider.version,
      externalRef: args.payoutRef,
      createdAt: args.observedAt,
      updatedAt: args.observedAt,
    })
    await ctx.db.insert('moneyLedgerEntries', {
      entryRef: `${identity.transactionRef}:payout-reservation`,
      accountRef: provider.accountRef,
      entryType: 'payout_accrual',
      direction: 'debit',
      amountUnits: amount.units,
      currency: amount.currency,
      exponent: amount.exponent,
      transactionRef: identity.transactionRef,
      idempotencyKey: args.idempotencyKey,
      businessId: args.businessId,
      sourceDigest: identity.sourceDigest,
      evidenceRefs: [...identity.evidenceRefs],
      createdAt: args.observedAt,
    })
    await ctx.db.patch('moneyAccounts', providerAccount._id, {
      balanceUnits: providerAfter.balance.units,
      recoveryDueUnits: providerAfter.recoveryDue.units,
      version: providerAfter.version,
      updatedAt: providerAfter.updatedAt,
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
        transferStatus: 'pending',
        providerRecoveryDeadlineAt: args.providerRecoveryDeadlineAt,
        transferObservedAt: args.observedAt,
        updatedAt: args.observedAt,
        providerHeldBefore: provider.balance,
        providerHeldAfter: providerAfter.balance,
        providerPaidBefore: paidBefore,
      }),
    )
    const updated = await ctx.db.get(payout._id)
    const transfer = updated === null ? undefined : payoutTransferView(updated)
    return transfer === undefined
      ? refusedPayout('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
}

export async function beginPayoutTransferHandler(
  ctx: MutationCtx,
  args: BeginPayoutTransferArgs,
): Promise<PayoutTransferResult> {
    await requireBillingSourceWrite(ctx, args)
    if (
      !(await payoutAuthorityAllowed(
        ctx,
        args.businessId,
        args.authority.principalId,
      ))
    )
      return refusedPayout('billing_identity_missing', false)
    return await beginPayoutTransferReservation(ctx, args)
}

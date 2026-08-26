import type { QueryCtx } from './_generated/server'
import { readCanonicalCompatibilityOwner, resolveBusinessActor } from './authz'
import { accountFromRow } from './moneyCanonicalAccounts'
import { amountFromParts } from '../src/modules/money/public'
import {
  payoutTerminalReplayIsConsistent,
  payoutTransferView,
  readPayoutReservationJournal,
  type PayoutTransferResult,
} from './moneyPayoutTransferShared'

function refusedPayout(code: string, retryable: boolean): PayoutTransferResult {
  return { kind: 'refused', code, retryable }
}

export type ReadOwnerPayoutTransferArgs = {
  businessId: string
  currency: string
  payoutRef: string
  idempotencyKey: string
}

export async function readOwnerPayoutTransferHandler(
  ctx: QueryCtx,
  args: ReadOwnerPayoutTransferArgs,
): Promise<PayoutTransferResult> {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner')
      return refusedPayout('billing_identity_missing', false)
    const owner = await readCanonicalCompatibilityOwner(ctx.db, actor)
    if (owner === null) return refusedPayout('billing_identity_missing', false)
    const businesses = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .take(20)
    if (
      !businesses.some((business) => String(business._id) === args.businessId)
    )
      return refusedPayout('billing_identity_missing', false)
    const payout = await ctx.db
      .query('moneyPayouts')
      .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
      .unique()
    if (
      payout === null ||
      payout.businessId !== args.businessId ||
      payout.currency !== args.currency ||
      payout.idempotencyKey !== args.idempotencyKey
    )
      return refusedPayout('payout_not_ready', false)
    const hasFrozenIdentity =
      payout.payoutCommandId !== undefined ||
      payout.inputDigest !== undefined ||
      payout.destinationAccountId !== undefined ||
      payout.transferRequestDigest !== undefined
    if (!hasFrozenIdentity)
      return refusedPayout('payout_not_ready', false)
    if (
      payout.payoutCommandId === undefined ||
      payout.payoutCommandId.length === 0 ||
      payout.inputDigest === undefined ||
      payout.inputDigest.length === 0 ||
      payout.destinationAccountId === undefined ||
      payout.destinationAccountId.length === 0 ||
      payout.transferRequestDigest === undefined ||
      payout.transferRequestDigest.length === 0 ||
      payout.providerAccountRef === undefined ||
      payout.providerAccountRef.length === 0 ||
      payout.idempotencyKey.length === 0
    )
      return refusedPayout('payout_reconciliation_required', false)
    const journal = await readPayoutReservationJournal(ctx, {
      payoutRef: payout.payoutRef,
      payoutCommandId: payout.payoutCommandId,
      inputDigest: payout.inputDigest,
      requestDigest: payout.transferRequestDigest,
      idempotencyKey: payout.idempotencyKey,
      providerAccountRef: payout.providerAccountRef,
      businessId: payout.businessId,
    })
    if (journal.kind !== 'found')
      return refusedPayout('payout_reconciliation_required', false)
    const providerAccount = await ctx.db
      .query('moneyAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique()
    const provider =
      providerAccount === null ? undefined : accountFromRow(providerAccount)
    if (
      providerAccount === null ||
      provider === undefined ||
      providerAccount.accountKind !== 'provider_earnings' ||
      providerAccount.accountRef !== payout.providerAccountRef ||
      providerAccount.businessId !== args.businessId ||
      providerAccount.currency !== args.currency
    )
      return refusedPayout('payout_reconciliation_required', false)
    const reservation = journal.transaction
    const reservationAmount =
      reservation.amountUnits === undefined
        ? undefined
        : amountFromParts(
            reservation.currency,
            reservation.amountUnits,
            reservation.exponent,
          )
    if (
      reservationAmount === undefined ||
      !(await payoutTerminalReplayIsConsistent({
        ctx,
        businessId: args.businessId,
        currency: args.currency,
        amount: reservationAmount,
        payout,
        provider,
        journal,
      }))
    )
      return refusedPayout('payout_reconciliation_required', false)
    const transfer = payoutTransferView(payout, reservationAmount)
    return transfer === undefined
      ? refusedPayout('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
}

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

import {
  addExactAmounts,
  calculateTopupBonusAmount,
  OWNER_TRIAL_PROMO_EVIDENCE_REF,
  OWNER_TRIAL_PROMO_GRANT,
  ownerTrialPromoInputDigest,
  ownerTrialPromoTransactionRef,
  rescaleExactAmount,
  resolveTopupBonusBps,
  TOPUP_BONUS_EVIDENCE_REF,
  topupBonusInputDigest,
  topupBonusTransactionRef,
} from '../src/modules/money/public'
import type { ExactAmount } from '../src/modules/money/public'
import type { StripeMoneyWebhookEvent } from '../src/modules/money/public'

/**
 * Owner promotion postings for a completed credit top-up. Called ONLY inside
 * the applyCreditTopup mutation after the base `topup` entry and account bump
 * have been applied, so promotions commit atomically with the verified paid
 * webhook posting. Fail-closed doctrine: credits are minted only from an
 * already-verified paid Stripe event; nothing here runs on reservations.
 *
 * Exactly-once mechanism reuses existing uniqueness machinery: each promotion
 * has a deterministic transactionRef (`money-promo-transaction:v1` keyed by
 * ownerAccountRef for the one-time trial grant; `money-topup-bonus-transaction:v1`
 * keyed by the top-up transactionRef for per-top-up bonuses). The prior row
 * lookup on `moneyTransactions.by_transactionRef` IS the explicit status row:
 * present means already granted, absent means mint now. Retries replay instead
 * of double-minting.
 *
 * Version bookkeeping: `postTopupVersion` is the wallet version created by the
 * caller's base top-up patch (pre-top-up version + 1). Each promotion row
 * records the version its posting assumed and bumps it once, so the chain
 * topup(v)->promo_grant(v+1)->topup_bonus(v+2) stays auditable.
 */

export type CompletedTopupPromotionState = Readonly<{
  balanceUnits: string
  version: number
}>

type PromotionInput = Readonly<{
  account: Doc<'moneyAccounts'>
  /** Balance right after the base top-up credit was patched (post-top-up state). */
  postTopupBalanceUnits: string
  /** Wallet version produced by the caller's base top-up patch. */
  postTopupVersion: number
  principalId: string
  /** The credited top-up amount at account scale (command.amount). */
  topupAmount: ExactAmount
  topupTransactionRef: string
  event: Extract<StripeMoneyWebhookEvent, { kind: 'checkout' }>
}>

function baseTransaction(
  input: PromotionInput,
  kind: 'promo_grant' | 'topup_bonus',
  ref: string,
  digest: string,
  amount: ExactAmount,
  expectedAccountVersion: number,
) {
  return {
    transactionRef: ref,
    kind,
    idempotencyKey: ref,
    inputDigest: digest,
    principalId: input.principalId,
    ...(input.account.accountId === undefined
      ? {}
      : { accountId: input.account.accountId }),
    currency: amount.currency,
    amountUnits: amount.units,
    exponent: amount.exponent,
    state: 'applied',
    expectedAccountVersion,
    createdAt: input.event.observedAt,
    updatedAt: input.event.observedAt,
  } as const
}

/**
 * Applies the owner trial promo grant (once per owner wallet, USD wallets only)
 * and the completed-top-up bonus ladder to the operator_credit wallet inside
 * the caller's mutation. Returns the final wallet state; the caller persists
 * it into its own bookkeeping rows.
 */
export async function applyOwnerMoneyPromotionsOnCompletedTopup(
  ctx: Pick<MutationCtx, 'db'>,
  input: PromotionInput,
): Promise<CompletedTopupPromotionState> {
  let state: CompletedTopupPromotionState = {
    balanceUnits: input.postTopupBalanceUnits,
    version: input.postTopupVersion,
  }
  if (input.account.accountKind !== 'operator_credit' || input.account.currency !== 'USD') {
    return state
  }
  const evidence = [
    `stripe:event:${input.event.stripeEventId}`,
    `stripe:session:${input.event.sessionId}`,
    `stripe:metadata:${input.event.metadataDigest}`,
  ]
  const observedAt = input.event.observedAt

  // Once-per-owner trial grant: minted lazily with the owner's FIRST completed
  // top-up because no money-plane workspace bootstrap mutation exists yet; move
  // this call when such a seam lands. Zero Stripe value, non-refundable kind.
  const promoRef = ownerTrialPromoTransactionRef(input.account.accountRef)
  const priorPromo = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_transactionRef', (query) => query.eq('transactionRef', promoRef))
    .unique()
  if (priorPromo === null) {
    const grant = rescaleExactAmount(OWNER_TRIAL_PROMO_GRANT, input.account.exponent)
    const nextBalance = grant === undefined ? undefined : addExactAmounts({ currency: input.account.currency, units: state.balanceUnits, exponent: input.account.exponent }, grant)
    if (grant !== undefined && nextBalance !== undefined && grant.units !== '0') {
      const digest = ownerTrialPromoInputDigest(input.account.accountRef)
      await ctx.db.insert(
        'moneyTransactions',
        baseTransaction(input, 'promo_grant', promoRef, digest, grant, state.version),
      )
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${promoRef}:promo_grant`,
        accountRef: input.account.accountRef,
        entryType: 'promo_grant',
        direction: 'credit',
        amountUnits: grant.units,
        currency: grant.currency,
        exponent: grant.exponent,
        transactionRef: promoRef,
        idempotencyKey: promoRef,
        principalId: input.principalId,
        sourceDigest: digest,
        evidenceRefs: [OWNER_TRIAL_PROMO_EVIDENCE_REF, ...evidence],
        createdAt: observedAt,
      })
      state = { balanceUnits: nextBalance.units, version: state.version + 1 }
    }
  }

  // Bonus ladder over every completed qualifying top-up (per-top-up exactly-once).
  const bonusBps = resolveTopupBonusBps(input.topupAmount)
  const bonus =
    bonusBps === undefined ? undefined : calculateTopupBonusAmount(input.topupAmount)
  if (bonusBps !== undefined && bonus !== undefined && bonus.units !== '0') {
    const scaled = rescaleExactAmount(bonus, input.account.exponent)
    const ref = topupBonusTransactionRef(input.topupTransactionRef)
    const priorBonus = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (query) => query.eq('transactionRef', ref))
      .unique()
    const currentBalance = scaled === undefined ? undefined : addExactAmounts({
      currency: input.account.currency,
      units: state.balanceUnits,
      exponent: input.account.exponent,
    }, { ...scaled, currency: input.account.currency })
    if (priorBonus === null && scaled !== undefined && currentBalance !== undefined) {
      const digest = topupBonusInputDigest({
        ownerAccountRef: input.account.accountRef,
        topupTransactionRef: input.topupTransactionRef,
        topupAmountUnits: input.topupAmount.units,
      })
      await ctx.db.insert(
        'moneyTransactions',
        baseTransaction(input, 'topup_bonus', ref, digest, scaled, state.version),
      )
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${ref}:topup_bonus`,
        accountRef: input.account.accountRef,
        entryType: 'topup_bonus',
        direction: 'credit',
        amountUnits: scaled.units,
        currency: scaled.currency,
        exponent: scaled.exponent,
        transactionRef: ref,
        idempotencyKey: ref,
        principalId: input.principalId,
        sourceDigest: digest,
        evidenceRefs: [TOPUP_BONUS_EVIDENCE_REF, ...evidence],
        createdAt: observedAt,
      })
      state = { balanceUnits: currentBalance.units, version: state.version + 1 }
    }
  }

  if (
    state.balanceUnits !== input.postTopupBalanceUnits ||
    state.version !== input.postTopupVersion
  ) {
    await ctx.db.patch('moneyAccounts', input.account._id, {
      balanceUnits: state.balanceUnits,
      version: state.version,
      updatedAt: observedAt,
    })
  }
  return state
}

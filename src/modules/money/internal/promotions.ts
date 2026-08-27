import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  multiplyExactAmountByBps,
  readExactAmount,
  rescaleExactAmount,
  compareExactAmounts,
  type ExactAmount,
} from './exact-amount'

/**
 * Owner promotions plane (OPTION B design).
 *
 * Representation decision: the operator_credit wallet keeps ONE fungible
 * balance (`moneyAccounts.balanceUnits`). Promo grants and top-up bonuses are
 * minted as distinct `promo_grant` / `topup_bonus` ledger rows (and matching
 * moneyTransactions kinds) so provenance stays auditable per component, but no
 * consumption site tracks components separately. This beats splitting into
 * separate spendable buckets because the balance has MORE than three mutable
 * consumption sites today (paid charge plan gate+debit, charge admission
 * preview validation, brokered held-units reservation, webhook credit posting),
 * and every one of them would need waterfall split/spend/reverse logic under
 * component accounting while the journal-seal refund work is mid-flight.
 *
 * Refund-in-kind policy: refunds always mirror an original `charge`
 * transaction exactly (`appendRefundReversal` credits back contract.chargeAmount
 * and debits provider/rake legs) and therefore can never mint purchased credit
 * out of spent bonus value. Promo grants and top-up bonuses have zero Stripe
 * value by construction and are NON-REFUNDABLE BY POLICY: no reversal path may
 * ever create a `topup`, `refund`, or any other kind that replaces consumed
 * promotion funds. Bonus/promo postings must stay atomic with the verified
 * paid webhook mutation that triggers them.
 */

/** One-time owner trial promotion credit. Config constant, deliberately no env knob. */
export const OWNER_TRIAL_PROMO_GRANT: ExactAmount = {
  currency: 'USD',
  units: '100',
  exponent: 2,
}

export const OWNER_TRIAL_PROMO_EVIDENCE_REF = 'ae:promotion:owner-trial:v1'
export const TOPUP_BONUS_EVIDENCE_REF = 'ae:promotion:topup-bonus:v1'

export type TopupBonusTier = Readonly<{
  /** Minimum completed-top-up credit amount (inclusive) that earns the bonus rate. */
  minimumAmount: ExactAmount
  /** Bonus basis points of the credited amount, rounded DOWN to the cent. */
  bonusBps: number
}>

/** Bonus ladder over completed credit top-ups. USD-only like the top-up config itself. */
export const TOPUP_BONUS_LADDER: readonly TopupBonusTier[] = [
  { minimumAmount: { currency: 'USD', units: '20000', exponent: 2 }, bonusBps: 1500 },
  { minimumAmount: { currency: 'USD', units: '10000', exponent: 2 }, bonusBps: 1000 },
  { minimumAmount: { currency: 'USD', units: '5000', exponent: 2 }, bonusBps: 500 },
]

/**
 * Resolves the highest qualifying ladder tier for a completed top-up credit
 * amount. Returns undefined below the lowest tier or for non-USD amounts.
 */
export function resolveTopupBonusBps(amount: unknown): number | undefined {
  const parsed = readExactAmount(amount)
  if (parsed === undefined || parsed.currency !== 'USD') return undefined
  let matched: number | undefined
  for (const tier of TOPUP_BONUS_LADDER) {
    const minimum = rescaleExactAmount(tier.minimumAmount, parsed.exponent)
    if (minimum === undefined) continue
    const comparison = compareExactAmounts(parsed, minimum)
    if (comparison === undefined || comparison < 0) continue
    matched = tier.bonusBps
    break
  }
  return matched
}

/**
 * Computes the ladder bonus for a completed top-up: bonusBps of the credited
 * amount floored at the amount's native scale (cents for USD exponent 2).
 */
export function calculateTopupBonusAmount(amount: unknown): ExactAmount | undefined {
  const parsed = readExactAmount(amount)
  if (parsed === undefined || parsed.currency !== 'USD') return undefined
  const bonusBps = resolveTopupBonusBps(parsed)
  if (bonusBps === undefined) return undefined
  return multiplyExactAmountByBps(parsed, bonusBps, 'floor')
}

/** Deterministic exactly-once transaction reference for the owner trial promo grant. */
export function ownerTrialPromoTransactionRef(ownerAccountRef: string): string {
  return canonicalDigest({
    format: 'money-promo-transaction:v1',
    accountRef: ownerAccountRef,
  })
}

/** Deterministic exactly-once transaction reference for one completed top-up's bonus. */
export function topupBonusTransactionRef(topupTransactionRef: string): string {
  return canonicalDigest({
    format: 'money-topup-bonus-transaction:v1',
    topupTransactionRef,
  })
}

export function ownerTrialPromoInputDigest(ownerAccountRef: string): string {
  return canonicalDigest({
    format: 'money-promo-input:v1',
    accountRef: ownerAccountRef,
  })
}

export function topupBonusInputDigest(input: Readonly<{
  ownerAccountRef: string
  topupTransactionRef: string
  topupAmountUnits: string
}>): string {
  return canonicalDigest({
    format: 'money-topup-bonus-input:v1',
    accountRef: input.ownerAccountRef,
    topupTransactionRef: input.topupTransactionRef,
    topupAmountUnits: input.topupAmountUnits,
  })
}

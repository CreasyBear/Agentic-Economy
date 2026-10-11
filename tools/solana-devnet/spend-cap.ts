import {
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  parseDecimalExactAmount,
  type ExactAmount,
} from '@/modules/money/public'

import { DEVNET_USDC_EXPONENT } from './devnet'

export type AgentSpendCap = Readonly<{
  perCall: ExactAmount
  daily: ExactAmount
}>

export type CapCheck =
  | Readonly<{ outcome: 'within_cap'; price: ExactAmount; spentToday: ExactAmount; cap: AgentSpendCap }>
  | Readonly<{
    outcome: 'refused'
    reason: 'over_per_call_cap' | 'over_daily_cap'
    price: ExactAmount
    spentToday: ExactAmount
    cap: AgentSpendCap
  }>

export function devnetUsdc(decimal: string): ExactAmount {
  const amount = parseDecimalExactAmount('USDC', decimal, DEVNET_USDC_EXPONENT)
  if (amount === undefined) throw new Error(`"${decimal}" is not a USDC amount with at most 6 decimals`)
  return amount
}

export function devnetUsdcFromAtomic(atomic: string): ExactAmount {
  const amount = amountFromParts('USDC', atomic, DEVNET_USDC_EXPONENT)
  if (amount === undefined) throw new Error(`"${atomic}" is not an atomic USDC amount`)
  return amount
}

function atMost(amount: ExactAmount | undefined, limit: ExactAmount): boolean {
  const comparison = compareExactAmounts(amount, limit)
  return comparison === -1 || comparison === 0
}

/** Decides before any signing whether one Call at `price` fits the agent's per-Call and daily caps. */
export function checkAgentSpendCap(price: ExactAmount, spentToday: ExactAmount, cap: AgentSpendCap): CapCheck {
  if (!atMost(price, cap.perCall)) return { outcome: 'refused', reason: 'over_per_call_cap', price, spentToday, cap }
  if (!atMost(addExactAmounts(spentToday, price), cap.daily)) {
    return { outcome: 'refused', reason: 'over_daily_cap', price, spentToday, cap }
  }
  return { outcome: 'within_cap', price, spentToday, cap }
}

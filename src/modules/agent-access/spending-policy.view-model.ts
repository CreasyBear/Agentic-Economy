/**
 * Spending-limits presentation types and the public import surface for
 * spending-limit policy helpers (parse, compare, quota gauge, presets).
 * Not Account funding and not a one-off Approval.
 */

export type SpendingPresetId = 'conservative' | 'balanced' | 'intensive'

export {
  DEFAULT_RESTORE_LIMITS,
  PAUSED_ZERO_AMOUNT,
  PAUSED_ZERO_LIMITS,
  SPENDING_LIMIT_CURRENCY,
  SPENDING_PRESETS,
  exactAmountToDecimal,
  isSpendingPaused,
  isZeroExactAmount,
  limitsToastDescription,
  matchingPresetId,
  monthlyQuotaGaugeFromFacts,
  parseSpendingLimitDecimal,
  parseSpendingLimitTriple,
  validateSpendingLimitOrder,
} from './spending-limit-policy'

export type {
  MonthlyQuotaGaugeFacts,
  SpendingBudgetSnapshot,
  SpendingLimitOrderViolation,
} from './spending-limit-policy'

export type MonthlyQuotaGauge = Readonly<{
  label: string
  progressValue: number
  progressAriaLabel: string
  toneClass: string
  /**
   * exactOptionalPropertyTypes: omit the key when absent. The existing
   * `monthlyQuotaGauge()` already spreads it conditionally.
   */
  approachingCopy?: string
}>

import {
  AUD_EXPONENT,
  compareExactAmounts,
  formatDisplayAmount,
  parseDecimalExactAmount,
  type ExactAmount,
} from '@/modules/money/public'

type SpendingPresetIdLocal = 'conservative' | 'balanced' | 'intensive'

type MonthlyQuotaGaugeLocal = Readonly<{
  label: string
  progressValue: number
  progressAriaLabel: string
  toneClass: string
  approachingCopy?: string
}>

export const SPENDING_LIMIT_CURRENCY = 'AUD' as const

export const SPENDING_PRESETS: Readonly<
  Record<
    SpendingPresetIdLocal,
    Readonly<{ label: string; perCall: string; daily: string; monthly: string }>
  >
> = {
  conservative: { label: 'Conservative', perCall: '2', daily: '10', monthly: '50' },
  balanced: { label: 'Balanced', perCall: '5', daily: '25', monthly: '100' },
  intensive: { label: 'Intensive', perCall: '20', daily: '100', monthly: '500' },
}

export const DEFAULT_RESTORE_LIMITS = {
  maximumSpendPerCall: { currency: 'AUD', units: '5000000', exponent: 6 }, // $5.00
  maximumDailySpend: { currency: 'AUD', units: '25000000', exponent: 6 }, // $25.00
  maximumMonthlySpend: { currency: 'AUD', units: '100000000', exponent: 6 }, // $100.00
} as const satisfies Readonly<{
  maximumSpendPerCall: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
}>

export const PAUSED_ZERO_AMOUNT: ExactAmount = {
  currency: 'AUD',
  units: '0',
  exponent: AUD_EXPONENT,
}

export const PAUSED_ZERO_LIMITS = {
  maximumSpendPerCall: PAUSED_ZERO_AMOUNT,
  maximumDailySpend: PAUSED_ZERO_AMOUNT,
  maximumMonthlySpend: PAUSED_ZERO_AMOUNT,
} as const satisfies Readonly<{
  maximumSpendPerCall: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
}>

export type SpendingBudgetSnapshot = Readonly<{
  maximumSpendPerCall: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
}>

export type MonthlyQuotaGaugeFacts = Readonly<{
  isPaused: boolean
  grantBudgetMonthlyCeiling?: ExactAmount
  agentMonthlyLimit?: ExactAmount
  monthlySettledSpend?: ExactAmount
  monthlySpendCoverage?: 'complete' | 'incomplete'
}>

export type SpendingLimitOrderViolation = 'per_call_gt_daily' | 'daily_gt_monthly'

export function exactAmountToDecimal(amount: ExactAmount | undefined, fallback: string): string {
  if (amount === undefined) return fallback
  const units = BigInt(amount.units)
  if (amount.exponent === 0) return units.toString()
  const factor = 10n ** BigInt(amount.exponent)
  const integerPart = units / factor
  const fractionalPart = units % factor
  if (fractionalPart === 0n) return integerPart.toString()
  const fractionStr = fractionalPart.toString().padStart(amount.exponent, '0').replace(/0+$/, '')
  return `${integerPart}.${fractionStr}`
}

export function isZeroExactAmount(amount: ExactAmount): boolean {
  return amount.units === '0'
}

export function isSpendingPaused(budget?: SpendingBudgetSnapshot): boolean {
  if (budget === undefined) return false
  return (
    budget.maximumSpendPerCall.units === '0'
    && budget.maximumDailySpend.units === '0'
    && budget.maximumMonthlySpend.units === '0'
  )
}

export function limitsToastDescription(
  perCall: ExactAmount,
  daily: ExactAmount,
  monthly: ExactAmount,
): string {
  return `${formatDisplayAmount(perCall)} / call · ${formatDisplayAmount(daily)} / day · ${formatDisplayAmount(monthly)} / month`
}

export function matchingPresetId(
  perCall: string,
  daily: string,
  monthly: string,
): SpendingPresetIdLocal | null {
  for (const id of ['conservative', 'balanced', 'intensive'] as const) {
    const preset = SPENDING_PRESETS[id]
    if (preset.perCall === perCall && preset.daily === daily && preset.monthly === monthly) {
      return id
    }
  }
  return null
}

export function parseSpendingLimitDecimal(
  decimal: string,
  options?: Readonly<{ trim?: boolean }>,
): ExactAmount | undefined {
  const input = options?.trim === true ? decimal.trim() : decimal
  return parseDecimalExactAmount(SPENDING_LIMIT_CURRENCY, input, AUD_EXPONENT)
}

export function parseSpendingLimitTriple(
  perCall: string,
  daily: string,
  monthly: string,
  options?: Readonly<{ trim?: boolean }>,
): Readonly<{
  maximumSpendPerCall: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
}> | undefined {
  const maximumSpendPerCall = parseSpendingLimitDecimal(perCall, options)
  const maximumDailySpend = parseSpendingLimitDecimal(daily, options)
  const maximumMonthlySpend = parseSpendingLimitDecimal(monthly, options)
  if (
    maximumSpendPerCall === undefined
    || maximumDailySpend === undefined
    || maximumMonthlySpend === undefined
  ) {
    return undefined
  }
  return {
    maximumSpendPerCall,
    maximumDailySpend,
    maximumMonthlySpend,
  }
}

export function validateSpendingLimitOrder(
  perCall: ExactAmount,
  daily: ExactAmount,
  monthly: ExactAmount,
): SpendingLimitOrderViolation | null {
  const perCallVsDaily = compareExactAmounts(perCall, daily)
  if (perCallVsDaily === undefined || perCallVsDaily > 0) {
    return 'per_call_gt_daily'
  }
  const dailyVsMonthly = compareExactAmounts(daily, monthly)
  if (dailyVsMonthly === undefined || dailyVsMonthly > 0) {
    return 'daily_gt_monthly'
  }
  return null
}

export function monthlyQuotaGaugeFromFacts(facts: MonthlyQuotaGaugeFacts): MonthlyQuotaGaugeLocal {
  if (facts.isPaused) {
    return {
      label: 'Spending frozen — A$0.00 new spend authorized',
      progressValue: 0,
      progressAriaLabel: 'Spending frozen, A$0.00 new spend authorized',
      toneClass: 'text-muted-foreground',
    }
  }

  const ceiling = facts.grantBudgetMonthlyCeiling ?? facts.agentMonthlyLimit
  const burn = facts.monthlySettledSpend

  if (ceiling === undefined) {
    return {
      label: 'Monthly settled: no monthly ceiling configured',
      progressValue: 0,
      progressAriaLabel: 'Monthly settled spend, no ceiling configured',
      toneClass: 'text-muted-foreground',
    }
  }

  const ceilingFormatted = formatDisplayAmount(ceiling)

  if (
    facts.monthlySpendCoverage === 'incomplete'
    || burn === undefined
    || burn.currency !== ceiling.currency
  ) {
    return {
      label: `Monthly settled: unavailable / ${ceilingFormatted}`,
      progressValue: 0,
      progressAriaLabel: `Monthly settled unavailable of ${ceilingFormatted}`,
      toneClass: 'text-muted-foreground',
    }
  }

  const spendUnits = BigInt(burn.units)
  const ceilingUnits = BigInt(ceiling.units)
  const burnFormatted = formatDisplayAmount(burn)

  if (ceilingUnits <= 0n) {
    return {
      label: `Monthly settled: ${burnFormatted} / ${ceilingFormatted}`,
      progressValue: spendUnits > 0n ? 100 : 0,
      progressAriaLabel: `Monthly settled ${burnFormatted} of ${ceilingFormatted}`,
      toneClass: 'text-muted-foreground',
    }
  }

  const percentTenths = Number((spendUnits * 1000n) / ceilingUnits) / 10
  const clampedPercent = Math.min(100, percentTenths)
  const label = `Monthly settled: ${burnFormatted} / ${ceilingFormatted} (${percentTenths}%)`
  const progressAriaLabel = `Monthly settled ${burnFormatted} of ${ceilingFormatted}, ${percentTenths} percent`

  let toneClass = 'text-success-foreground'
  let approachingCopy: string | undefined
  if (percentTenths > 90) {
    toneClass = 'text-destructive'
    approachingCopy = 'Approaching monthly limit'
  } else if (percentTenths > 70) {
    toneClass = 'text-warning-foreground'
  }

  return {
    label,
    progressValue: clampedPercent,
    progressAriaLabel,
    toneClass,
    ...(approachingCopy !== undefined ? { approachingCopy } : {}),
  }
}

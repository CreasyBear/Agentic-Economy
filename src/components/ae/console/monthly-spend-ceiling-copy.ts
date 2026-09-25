import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { AUD_EXPONENT, canonicalAudUnits, formatDisplayAmount } from '@/modules/money/public'
import { audInputTextFromUnits } from './credit-top-up-format'

export type MonthlySpendCeilingPresetId = '100' | '250' | '500' | '1000'

export type MonthlySpendCeilingPreset = Readonly<{
  id: MonthlySpendCeilingPresetId
  units: string
  label: string
}>

export const MONTHLY_SPEND_CEILING_PRESETS: readonly MonthlySpendCeilingPreset[] = Object.freeze([
  { id: '100', units: '100000000', label: 'A$100' },
  { id: '250', units: '250000000', label: 'A$250' },
  { id: '500', units: '500000000', label: 'A$500' },
  { id: '1000', units: '1000000000', label: 'A$1,000' },
])

export type MonthlySpendCeilingDiagnostic = Rule4Diagnostic

export type UtilizationBand = 'normal' | 'warning' | 'critical' | 'exceeded'

const FINANCIAL_IMPACT_UNCHANGED = 'A$0.00 charged — your spending cap is unchanged.'

export function buildCeilingPreviewStatement(enabled: boolean, ceilingText: string): string {
  if (!enabled) {
    return 'Monthly spending cap is disabled.'
  }
  const units = canonicalAudUnits(ceilingText)
  if (units === undefined) {
    return 'Enter a valid dollar amount or select a preset chip.'
  }
  return `Calls for all agents in this workspace will be paused once total monthly spend reaches ${formatDisplayAmount({
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    units: units.toString(),
  })}.`
}

export function utilizationBand(percent: number): UtilizationBand {
  if (percent <= 70) return 'normal'
  if (percent < 90) return 'warning'
  if (percent < 100) return 'critical'
  return 'exceeded'
}

export function utilizationPercent(spendUnits: bigint, ceilingUnits: bigint): number {
  if (ceilingUnits <= 0n) return spendUnits > 0n ? 100 : 0
  const basisPoints = (spendUnits * 10_000n) / ceilingUnits
  const wholePercent = Number(basisPoints / 100n)
  const fraction = Number(basisPoints % 100n)
  return fraction >= 50 ? Math.min(100, wholePercent + 1) : Math.min(100, wholePercent)
}

const KNOWN_MONTHLY_SPEND_CEILING_ERROR_CODES = [
  'invalid_amount',
  'monthly_spend_budget_revision_conflict',
  'monthly_spend_budget_units_invalid',
  'monthly_spend_budget_correlation_mismatch',
] as const

type KnownMonthlySpendCeilingErrorCode = (typeof KNOWN_MONTHLY_SPEND_CEILING_ERROR_CODES)[number]

function resolveMonthlySpendCeilingErrorCode(errorOrCode: unknown): string {
  if (typeof errorOrCode === 'string') return errorOrCode
  if (errorOrCode instanceof Error) {
    for (const code of KNOWN_MONTHLY_SPEND_CEILING_ERROR_CODES) {
      if (errorOrCode.message.includes(code)) return code
    }
    if (
      errorOrCode.name === 'SyntaxError'
      || /invalid.*amount/i.test(errorOrCode.message)
      || /parse/i.test(errorOrCode.message)
    ) {
      return 'invalid_amount'
    }
  }
  if (typeof errorOrCode === 'object' && errorOrCode !== null) {
    if ('code' in errorOrCode && typeof errorOrCode.code === 'string') {
      return errorOrCode.code
    }
    if ('message' in errorOrCode && typeof errorOrCode.message === 'string') {
      for (const code of KNOWN_MONTHLY_SPEND_CEILING_ERROR_CODES) {
        if (errorOrCode.message.includes(code)) return code
      }
    }
  }
  return 'unknown'
}

export function mapMonthlySpendCeilingDiagnostic(errorOrCode: unknown): MonthlySpendCeilingDiagnostic {
  const code = resolveMonthlySpendCeilingErrorCode(errorOrCode)
  const financialImpact = FINANCIAL_IMPACT_UNCHANGED

  switch (code as KnownMonthlySpendCeilingErrorCode | 'unknown' | 'invalid_amount') {
    case 'invalid_amount':
    case 'monthly_spend_budget_units_invalid':
      return {
        whatHappened: 'Invalid spending cap amount.',
        financialImpact,
        nextStep: 'Enter a valid dollar amount or select a preset chip.',
      }
    case 'monthly_spend_budget_revision_conflict':
      return {
        whatHappened: 'This spending cap changed since you opened it.',
        financialImpact,
        nextStep: 'Refresh the page, review the current cap, then Save again.',
      }
    case 'monthly_spend_budget_correlation_mismatch':
      return {
        whatHappened: 'This save collided with another request.',
        financialImpact,
        nextStep: 'Wait a moment, then save again.',
      }
    default:
      return {
        whatHappened: 'Monthly spending cap could not be saved.',
        financialImpact,
        nextStep: 'Check the connection and try Save again.',
      }
  }
}

export function matchingMonthlySpendCeilingPresetId(ceilingText: string): MonthlySpendCeilingPresetId | null {
  const units = canonicalAudUnits(ceilingText)
  if (units === undefined) return null
  for (const preset of MONTHLY_SPEND_CEILING_PRESETS) {
    if (BigInt(preset.units) === units) {
      return preset.id
    }
  }
  return null
}

export function ceilingTextFromPresetId(presetId: MonthlySpendCeilingPresetId): string {
  const preset = MONTHLY_SPEND_CEILING_PRESETS.find((item) => item.id === presetId)
  if (preset === undefined) return ''
  return audInputTextFromUnits(BigInt(preset.units))
}

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { parseDecimalExactAmount } from '@/modules/money/public'

export type PayoutScheduleType = 'monthly' | 'weekly' | 'manual'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export const BECS_REASSURANCE =
  'Direct AUD bank credits are initiated automatically. Funds usually settle within 1–2 business days via BECS Direct Credit.'

export type PayoutThresholdPreset = Readonly<{
  id: string
  label: string
  units: string
  dollars: string
}>

export const PAYOUT_THRESHOLD_PRESETS: readonly PayoutThresholdPreset[] = [
  { id: 'min', label: 'A$10.00 (Min)', units: '10000000', dollars: '10' },
  { id: 'standard', label: 'A$50.00 (Standard)', units: '50000000', dollars: '50' },
  { id: '100', label: 'A$100.00', units: '100000000', dollars: '100' },
  { id: '500', label: 'A$500.00', units: '500000000', dollars: '500' },
]

export function buildNextPayoutStatement(schedule: PayoutScheduleType): string {
  switch (schedule) {
    case 'weekly':
      return 'Next scheduled payout: Monday 10:00 AM AEST'
    case 'monthly':
      return 'Next scheduled payout: 1st of next month'
    case 'manual':
      return 'Payouts paused until manual review'
    default: {
      const _exhaustive: never = schedule
      return _exhaustive
    }
  }
}

export function buildThresholdSummary(thresholdDollars: string): string {
  const exactAmount = parseDecimalExactAmount('AUD', thresholdDollars, 6)
  if (!exactAmount) {
    return 'Enter a valid threshold to preview this policy.'
  }
  const formatted = `A$${(Number(exactAmount.units) / 1_000_000).toFixed(2)}`
  return `Transfers will trigger when accumulated balance reaches ${formatted}.`
}

export type PayoutPolicyDiagnostic = Rule4Diagnostic

export const BELOW_MINIMUM_DIAGNOSTIC: PayoutPolicyDiagnostic = {
  whatHappened: 'Threshold below minimum requirement.',
  financialImpact: 'A$0.00 affected — preferences not saved.',
  nextStep: 'Enter a threshold of at least A$10.00.',
}

export const INVALID_AMOUNT_DIAGNOSTIC: PayoutPolicyDiagnostic = {
  whatHappened: 'Invalid dollar amount.',
  financialImpact: 'A$0.00 affected — preferences not saved.',
  nextStep: 'Enter a valid positive dollar amount (e.g. 50.00).',
}

export const CONFLICT_DIAGNOSTIC: PayoutPolicyDiagnostic = {
  whatHappened: 'Payout preferences modified in another session.',
  financialImpact: 'A$0.00 affected — reloaded current settings.',
  nextStep: 'Review the updated settings and try again.',
}

export const NETWORK_DIAGNOSTIC: PayoutPolicyDiagnostic = {
  whatHappened: 'Could not save payout preferences.',
  financialImpact: 'A$0.00 affected — existing policy remains active.',
  nextStep: 'Please check your connection and try again.',
}

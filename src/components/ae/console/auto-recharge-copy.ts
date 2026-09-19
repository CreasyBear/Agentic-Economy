import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { canonicalAudUnits } from '@/modules/money/public'
import { formatAudUnits } from './credit-top-up-format'

export type AutoRechargePresetId = 'conservative' | 'standard' | 'intensive'

export type AutoRechargePreset = Readonly<{
  id: AutoRechargePresetId
  thresholdUnits: string
  rechargeUnits: string
  label: string
}>

export const AUTO_RECHARGE_PRESETS: readonly AutoRechargePreset[] = Object.freeze([
  {
    id: 'conservative',
    thresholdUnits: '10000000',
    rechargeUnits: '25000000',
    label: 'Conservative: < A$10.00 add A$25.00',
  },
  {
    id: 'standard',
    thresholdUnits: '20000000',
    rechargeUnits: '50000000',
    label: 'Standard: < A$20.00 add A$50.00',
  },
  {
    id: 'intensive',
    thresholdUnits: '50000000',
    rechargeUnits: '100000000',
    label: 'Intensive: < A$50.00 add A$100.00',
  },
])

export type AutoRechargeDiagnostic = Rule4Diagnostic

const FINANCIAL_IMPACT_UNCHANGED = 'A$0.00 charged — your balance is unchanged.'

export function buildTriggerStatement(
  enabled: boolean,
  thresholdText: string,
  rechargeText: string,
): string {
  if (!enabled) {
    return 'Auto-recharge is currently disabled.'
  }
  const thresholdUnits = canonicalAudUnits(thresholdText)
  const rechargeUnits = canonicalAudUnits(rechargeText)
  if (thresholdUnits === undefined || rechargeUnits === undefined) {
    return 'Enter a valid threshold and recharge amount to preview this policy.'
  }
  return `When balance dips below ${formatAudUnits(thresholdUnits)}, automatically add ${formatAudUnits(rechargeUnits)} using your default payment method.`
}

const KNOWN_AUTO_RECHARGE_ERROR_CODES = [
  'invalid_amount',
  'funding_amount_invalid',
  'auto_recharge_units_invalid',
  'payment_mandate_missing',
  'mandate_missing',
  'mandate_failed',
  'mandate_authentication_required',
  'auto_recharge_revision_conflict',
] as const

type KnownAutoRechargeErrorCode = (typeof KNOWN_AUTO_RECHARGE_ERROR_CODES)[number]

function resolveAutoRechargeErrorCode(errorOrCode: unknown): string {
  if (typeof errorOrCode === 'string') return errorOrCode
  if (errorOrCode instanceof Error) {
    for (const code of KNOWN_AUTO_RECHARGE_ERROR_CODES) {
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
      for (const code of KNOWN_AUTO_RECHARGE_ERROR_CODES) {
        if (errorOrCode.message.includes(code)) return code
      }
    }
  }
  return 'unknown'
}

export function mapAutoRechargeDiagnostic(errorOrCode: unknown): AutoRechargeDiagnostic {
  const code = resolveAutoRechargeErrorCode(errorOrCode)
  const financialImpact = FINANCIAL_IMPACT_UNCHANGED

  switch (code as KnownAutoRechargeErrorCode | 'unknown' | 'parse_error') {
    case 'invalid_amount':
    case 'parse_error':
      return {
        whatHappened: 'That is not a valid AUD amount.',
        financialImpact,
        nextStep: 'Enter dollars and cents, or choose a quick-setup chip.',
      }
    case 'funding_amount_invalid':
      return {
        whatHappened: 'That recharge amount is outside the allowed range.',
        financialImpact,
        nextStep: 'Use A$5.00–A$25,000.00 in A$0.01 steps, or a quick-setup chip.',
      }
    case 'auto_recharge_units_invalid':
      return {
        whatHappened: 'The low-balance threshold is not a valid amount.',
        financialImpact,
        nextStep: 'Enter a threshold of A$0.00 or more, then Save.',
      }
    case 'payment_mandate_missing':
    case 'mandate_missing':
      return {
        whatHappened: 'Auto-recharge needs a default card before it can turn on.',
        financialImpact,
        nextStep: 'Add a payment method in Payment methods above, then return here.',
      }
    case 'mandate_failed':
      return {
        whatHappened: 'The saved card could not be used for off-session top-ups.',
        financialImpact,
        nextStep: 'Update or replace the card in Payment methods, then try again.',
      }
    case 'mandate_authentication_required':
      return {
        whatHappened: 'Your bank needs another check before auto-recharge can charge this card.',
        financialImpact,
        nextStep: 'Finish authentication via Payment methods, then enable auto-recharge.',
      }
    case 'auto_recharge_revision_conflict':
      return {
        whatHappened: 'This policy changed since you opened it.',
        financialImpact,
        nextStep: 'Refresh the page, review the current policy, then Save again.',
      }
    default:
      return {
        whatHappened: 'Auto-recharge could not be saved.',
        financialImpact,
        nextStep: 'Check the connection and try Save again.',
      }
  }
}

export function matchingAutoRechargePresetId(
  thresholdText: string,
  rechargeText: string,
): AutoRechargePresetId | null {
  const thresholdUnits = canonicalAudUnits(thresholdText)
  const rechargeUnits = canonicalAudUnits(rechargeText)
  if (thresholdUnits === undefined || rechargeUnits === undefined) return null
  for (const preset of AUTO_RECHARGE_PRESETS) {
    if (
      BigInt(preset.thresholdUnits) === thresholdUnits
      && BigInt(preset.rechargeUnits) === rechargeUnits
    ) {
      return preset.id
    }
  }
  return null
}

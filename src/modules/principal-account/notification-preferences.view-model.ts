import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export const LOW_CREDIT_THRESHOLD_CENTS = [1000, 2500, 5000] as const
export type LowCreditThresholdCents = (typeof LOW_CREDIT_THRESHOLD_CENTS)[number]

export type NotificationPreferencesView = Readonly<{
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
  revision: number
}>

export type NotificationPreferencePatch = Readonly<{
  lowCreditBalance?: boolean
  lowCreditThresholdCents?: number
  spendCapWarning?: boolean
  callFailureSpike?: boolean
  invoiceReady?: boolean
  teamMembershipChanged?: boolean
  expectedRevision: number
}>

export type PreferenceSwitchKey =
  | 'lowCreditBalance'
  | 'spendCapWarning'
  | 'callFailureSpike'
  | 'invoiceReady'
  | 'teamMembershipChanged'

export type NotificationUpdateDiagnostic = Rule4Diagnostic

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesView = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  revision: 0,
}

export const UPDATE_FAILED_DIAGNOSTIC: NotificationUpdateDiagnostic = {
  whatHappened: 'Could not update notification preferences.',
  financialImpact: 'A$0.00 affected — existing preferences remain active.',
  nextStep: 'Please check your connection and try again.',
}

export const PREFERENCE_SWITCHES: ReadonlyArray<{
  key: PreferenceSwitchKey
  label: string
}> = [
  { key: 'lowCreditBalance', label: 'Low credit balance' },
  { key: 'spendCapWarning', label: 'Spend cap warning' },
  { key: 'callFailureSpike', label: 'Repeated call failures' },
  { key: 'invoiceReady', label: 'Tax invoice or statement ready' },
  { key: 'teamMembershipChanged', label: 'Team membership changes' },
]

export const THRESHOLD_OPTIONS: ReadonlyArray<{
  cents: LowCreditThresholdCents
  label: string
  displayAmount: string
}> = [
  { cents: 1000, label: 'A$10.00', displayAmount: 'A$10.00' },
  { cents: 2500, label: 'A$25.00 (Default)', displayAmount: 'A$25.00' },
  { cents: 5000, label: 'A$50.00', displayAmount: 'A$50.00' },
]

export function lowCreditThresholdStatement(preferences: NotificationPreferencesView): string {
  if (!preferences.lowCreditBalance) {
    return 'Low-balance alerts are off. Existing spend and call alerts are unchanged.'
  }
  const match = THRESHOLD_OPTIONS.find((option) => option.cents === preferences.lowCreditThresholdCents)
  const amount = match?.displayAmount ?? `A$${(preferences.lowCreditThresholdCents / 100).toFixed(2)}`
  return `Alert sent when balance drops below ${amount}.`
}

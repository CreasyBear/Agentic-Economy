import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export const LOW_CREDIT_THRESHOLD_CENTS = [1000, 2500, 5000] as const

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
  description: string
}> = [
  { key: 'lowCreditBalance', label: 'Email when credit balance is low', description: 'Know when your balance reaches the threshold below.' },
  { key: 'spendCapWarning', label: 'Email when spend cap is reached', description: 'Get a notice when an Agent reaches its spending limit.' },
  { key: 'callFailureSpike', label: 'Email when calls fail repeatedly', description: 'Catch repeated Tool failures before they interrupt work.' },
  { key: 'invoiceReady', label: 'Email when a tax invoice or statement is ready', description: 'Receive a notice when a new billing document is available.' },
  { key: 'teamMembershipChanged', label: 'Email when team membership changes', description: 'Keep track of invitations and role changes.' },
]

export type UsageAlertPolicy=Readonly<{enabled:boolean;failurePercent:number;minimumCalls:number;spendWarningPercent:number}>
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export type NotificationPreferencesView = Readonly<{
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
  agentApprovalRequested: boolean
  usageAlertPolicy?: UsageAlertPolicy
  revision: number
}>

export type NotificationPreferencePatch = Readonly<{
  lowCreditBalance?: boolean
  lowCreditThresholdCents?: number
  spendCapWarning?: boolean
  callFailureSpike?: boolean
  invoiceReady?: boolean
  teamMembershipChanged?: boolean
  agentApprovalRequested?: boolean
  usageAlertPolicy?: UsageAlertPolicy
  expectedRevision: number
}>

export type PreferenceSwitchKey = 'agentApprovalRequested'

export type NotificationUpdateDiagnostic = Rule4Diagnostic

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesView = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  agentApprovalRequested: true,
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
  { key: 'agentApprovalRequested', label: 'Email when an Agent needs your approval', description: 'Get an email when an Agent is waiting for you to approve a request.' },
]

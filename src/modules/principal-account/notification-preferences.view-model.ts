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
  stalledStepEmails: boolean
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
  stalledStepEmails?: boolean
  usageAlertPolicy?: UsageAlertPolicy
  expectedRevision: number
}>

export type PreferenceSwitchKey = 'agentApprovalRequested' | 'stalledStepEmails'

export type NotificationUpdateDiagnostic = Rule4Diagnostic

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesView = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  agentApprovalRequested: true,
  stalledStepEmails: false,
  revision: 0,
}

export const UPDATE_FAILED_DIAGNOSTIC: NotificationUpdateDiagnostic = {
  whatHappened: 'Could not update notification preferences.',
  financialImpact: 'No spending authority changed. The preference update could not be confirmed.',
  nextStep: 'Check the saved preferences before trying again.',
}

export const PREFERENCE_SWITCHES: ReadonlyArray<{
  key: PreferenceSwitchKey
  label: string
  description: string
}> = [
  { key: 'agentApprovalRequested', label: 'Email when an Agent needs your approval', description: 'Get an email when an Agent is waiting for you to approve a request.' },
  { key: 'stalledStepEmails', label: "Remind me when I'm stuck on a setup step", description: 'Get an email if a setup step has stalled and needs you to finish it.' },
]

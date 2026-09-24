import type {
  NotificationPreferencePatch,
  NotificationPreferencesView,
} from '@/modules/principal-account/notification-preferences.view-model'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'

export type AeAccountSecurityHistoryProps = Readonly<{
  initialResult: AccountSecurityHistoryResult
}>

export type AccountSecurityHistoryState = Readonly<{
  source: AccountSecurityHistoryResult
  result: AccountSecurityHistoryResult
  status: 'idle' | 'loading' | 'failed'
}>

export type OwnerNotificationSettingsProps = Readonly<{
  preferences: NotificationPreferencesView
  disabled?: boolean
  onUpdate: (patch: NotificationPreferencePatch) => void | Promise<void>
}>

export type PreferenceSwitchProps = Readonly<{
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}>

export type UseOwnerNotificationPreferencesResult = Readonly<{
  preferences: NotificationPreferencesView
  loading: boolean
  update: (patch: NotificationPreferencePatch) => Promise<void>
}>
export const ownerSettingsPrivacySection = {
  id: 'privacy',
  title: 'Privacy',
  description: 'Download a copy of the data Agentic Economy holds for this Account.',
  downloadLabel: 'Download your data (JSON)',
  downloadHref: '/api/owner/data-export',
} as const

import type { ReactNode } from 'react'

import type {
  NotificationPreferencePatch,
  NotificationPreferencesView,
} from '@/modules/principal-account/notification-preferences.view-model'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'

export type AccountSettingsSectionProps = Readonly<{
  history: AccountSecurityHistoryResult
}>

export type OwnerSettingsShellProps = Readonly<{
  currentPath?: string
  children: ReactNode
}>

export type OwnerNotificationSettingsProps = Readonly<{
  preferences: NotificationPreferencesView
  disabled?: boolean
  onUpdate: (patch: NotificationPreferencePatch) => void | Promise<void>
}>

export type PreferenceSwitchProps = Readonly<{
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}>

export type UseOwnerNotificationPreferencesResult = Readonly<{
  preferences: NotificationPreferencesView
  loading: boolean
  update: (patch: NotificationPreferencePatch) => Promise<void>
}>
export const ownerSettingsBusinessSection = {
  id: 'business',
  title: 'Business',
  description: 'ABN and GST facts used on your tax invoices.',
} as const

export const ownerSettingsPrivacySection = {
  id: 'privacy',
  title: 'Privacy',
  description: 'Download a copy of the data Agentic Economy holds for this Account.',
  downloadLabel: 'Download your data (JSON)',
  downloadHref: '/api/owner/data-export',
} as const

export const ownerSettingsSectionNavigation = [
  { id: 'clerk-account-security', label: 'Profile' },
  { id: 'compromise-recovery', label: 'Recovery' },
  { id: 'security-history', label: 'Security history' },
  { id: 'team', label: 'Team' },
  { id: 'workspace', label: 'Workspace' },
  { id: ownerSettingsBusinessSection.id, label: ownerSettingsBusinessSection.title },
  { id: ownerSettingsPrivacySection.id, label: ownerSettingsPrivacySection.title },
  { id: 'notifications', label: 'Email alerts' },
] as const

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

export const ownerSettingsSectionNavigation = [
  { id: 'clerk-account-security', label: 'Profile' },
  { id: 'team', label: 'Team' },
  { id: ownerSettingsBusinessSection.id, label: ownerSettingsBusinessSection.title },
  { id: 'compromise-recovery', label: 'Recovery' },
  { id: 'notifications', label: 'Email alerts' },
  { id: 'security-history', label: 'Security history' },
] as const

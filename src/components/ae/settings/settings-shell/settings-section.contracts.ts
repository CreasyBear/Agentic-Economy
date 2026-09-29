import type { ReactNode, Ref } from 'react'

export type SettingsPageProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}>
export type SettingsGroupProps = Readonly<{
  title: string
  description?: string
  children: ReactNode
}>
export type SettingsRowProps = Readonly<{
  label: string
  description?: string
  children: ReactNode
}>
export type SettingsEmptyStateProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
}>
export type SettingsDangerZoneProps = Readonly<{
  children: ReactNode
  description?: string
}>

export type SettingsScope = 'personal' | 'workspace'

export type SettingsScopeTabsProps = Readonly<{
  scope: SettingsScope
  onScopeChange: (scope: SettingsScope) => void
}>

export const SETTINGS_SCOPE_LABELS: Readonly<Record<SettingsScope, string>> = {
  personal: 'Personal',
  workspace: 'Workspace',
}

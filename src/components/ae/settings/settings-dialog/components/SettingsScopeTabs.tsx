import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  SETTINGS_SCOPE_LABELS,
  type SettingsScope,
  type SettingsScopeTabsProps,
} from '../settings-dialog.contracts'

const SCOPES: readonly SettingsScope[] = ['personal', 'workspace']

export function SettingsScopeTabs({ scope, onScopeChange }: SettingsScopeTabsProps) {
  return (
    <Tabs
      value={scope}
      onValueChange={(value) => {
        if (value === 'personal' || value === 'workspace') onScopeChange(value)
      }}
    >
      <TabsList
        aria-label="Settings scope"
        className="h-auto min-h-touch w-full grid grid-cols-2 gap-1 p-1"
      >
        {SCOPES.map((key) => (
          <TabsTrigger key={key} value={key} className="min-h-touch">
            {SETTINGS_SCOPE_LABELS[key]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

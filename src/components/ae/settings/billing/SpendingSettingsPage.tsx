import { AeMonthlySpendCeilingCard } from '@/components/ae/console/AeMonthlySpendCeilingCard'
import { SettingsPage, SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Skeleton } from '@/components/ui/skeleton'
import { useBillingSpending } from './useBillingSettings'

export function SpendingSettingsPage() {
  const spending = useBillingSpending()
  return <SettingsPage title="Spending defaults" description="Set the monthly spending cap for this workspace.">
    {spending.monthlySpendCeilingSettings ? <AeMonthlySpendCeilingCard
      settings={spending.monthlySpendCeilingSettings}
      monthSpend={spending.monthSpend}
      onSave={spending.onSaveMonthlySpendCeiling}
    /> : <SettingsGroup title="Monthly spending cap"><SettingsRow label="Current limit" description="Loading your workspace limit"><Skeleton role="status" aria-label="Loading monthly spending cap" className="h-10 w-36" /></SettingsRow></SettingsGroup>}
  </SettingsPage>
}

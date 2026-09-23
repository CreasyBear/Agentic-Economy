import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { ownerSettingsChrome } from '@/lib/operator/settings-navigation'

import type { OwnerSettingsShellProps } from './owner-settings.contracts'

export function OwnerSettingsShell({
  currentPath,
  children,
}: OwnerSettingsShellProps) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title={ownerSettingsChrome.title}
      description={ownerSettingsChrome.description}
      currentPath={currentPath ?? '/owner/settings'}
    >
      {children}
    </AeOperatorPage>
  )
}

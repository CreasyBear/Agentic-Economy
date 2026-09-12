import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { ownerSettingsChrome } from '@/lib/operator/settings-navigation'

export function OwnerSettingsShell({
  currentPath,
  children,
}: Readonly<{
  currentPath?: string
  children: ReactNode
}>) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title={ownerSettingsChrome.title}
      description={ownerSettingsChrome.description}
      currentPath={currentPath ?? '/owner/settings'}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorPage>
  )
}

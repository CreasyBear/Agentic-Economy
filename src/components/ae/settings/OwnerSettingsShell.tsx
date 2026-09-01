import type { ReactNode } from 'react'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
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
    <AeOperatorShell
      operatorRole="owner"
      title={ownerSettingsChrome.title}
      description={ownerSettingsChrome.description}
      currentPath={currentPath ?? '/owner/settings'}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorShell>
  )
}

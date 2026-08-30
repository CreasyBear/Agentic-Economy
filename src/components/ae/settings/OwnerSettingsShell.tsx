import type { ReactNode } from 'react'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { OwnerSettingsNav } from '@/components/ae/settings/OwnerSettingsNav'
import {
  ownerSettingsChrome,
  ownerSettingsPathForCurrent,
  type OwnerSettingsNavCurrent,
} from '@/lib/operator/settings-navigation'

export function OwnerSettingsShell({
  current,
  currentPath,
  children,
}: Readonly<{
  current: OwnerSettingsNavCurrent
  currentPath?: string
  children: ReactNode
}>) {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title={ownerSettingsChrome.title}
      description={ownerSettingsChrome.description}
      currentPath={currentPath ?? ownerSettingsPathForCurrent(current)}
      secondaryBar={<OwnerSettingsNav current={current} />}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorShell>
  )
}

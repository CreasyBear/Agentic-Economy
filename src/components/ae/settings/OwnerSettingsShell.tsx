import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { ownerSettingsChrome } from '@/lib/operator/settings-navigation'

import {
  ownerSettingsSectionNavigation,
  type OwnerSettingsShellProps,
} from './owner-settings.contracts'

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
      stickyHeader
      secondaryBar={(
        <nav aria-label="Account settings sections" className="overflow-x-auto py-intra">
          <ul className="flex min-w-max gap-1">
            {ownerSettingsSectionNavigation.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex min-h-touch items-center rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorPage>
  )
}

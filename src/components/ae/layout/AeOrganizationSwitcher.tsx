'use client'

import { OrganizationSwitcher } from '@clerk/tanstack-react-start'

export type AeOrganizationSwitcherProps = Readonly<{
  isCollapsed?: boolean
}>

export function AeOrganizationSwitcher({ isCollapsed = false }: AeOrganizationSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Workspace selection"
      className="flex min-h-8 min-w-0 w-full items-center py-1 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
    >
      <OrganizationSwitcher
        hidePersonal={false}
        createOrganizationMode="modal"
        organizationProfileMode="navigation"
        organizationProfileUrl="/owner/workspace"
        appearance={{
          elements: {
            rootBox: 'w-full',
            organizationSwitcherTrigger: isCollapsed
              ? 'size-8 justify-center rounded-none border border-sidebar-border p-0 text-sidebar-foreground hover:bg-sidebar-accent/50'
              : 'w-full justify-between rounded-none border border-sidebar-border px-2 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50',
            organizationPreviewTextContainer: isCollapsed ? 'sr-only' : 'min-w-0 truncate text-xs font-medium',
            organizationSwitcherTriggerIcon: isCollapsed ? 'sr-only' : 'size-4 opacity-50',
          },
        }}
      />
    </div>
  )
}

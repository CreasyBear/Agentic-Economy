'use client'

import { clerkAppearance, clerkOrganizationSwitcherAppearance } from '@/components/ae/website/clerk-appearance'
import { OrganizationSwitcher } from '@clerk/tanstack-react-start'

export type AeOrganizationSwitcherProps = Readonly<{
  isCollapsed?: boolean
}>

const TACTILE_TRIGGER =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function AeOrganizationSwitcher({ isCollapsed = false }: AeOrganizationSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Workspace selection"
      className="flex h-8 w-full min-w-0 items-center group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
    >
      <OrganizationSwitcher
        hidePersonal={false}
        createOrganizationMode="modal"
        organizationProfileMode="navigation"
        organizationProfileUrl="/owner/workspace"
        afterSelectOrganizationUrl="/owner/operations"
        afterCreateOrganizationUrl="/owner/operations"
        afterLeaveOrganizationUrl="/owner/operations"
        appearance={{
          elements: {
            ...clerkAppearance.elements,
            ...clerkOrganizationSwitcherAppearance.elements,
            rootBox: 'w-full',
            organizationSwitcherTrigger: isCollapsed
              ? `size-8 justify-center rounded-none border border-sidebar-border p-0 text-sidebar-foreground hover:bg-sidebar-accent/50 ${TACTILE_TRIGGER}`
              : `w-full justify-between rounded-none border border-sidebar-border px-2 py-1.5 text-xs text-sidebar-foreground hover:bg-sidebar-accent/50 ${TACTILE_TRIGGER}`,
            organizationPreviewTextContainer: isCollapsed ? 'sr-only' : 'min-w-0 truncate text-xs font-medium',
            organizationSwitcherTriggerIcon: isCollapsed ? 'sr-only' : 'size-4 opacity-50',
          },
        }}
      />
    </div>
  )
}

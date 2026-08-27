# Page dependency trees (operator settings)

## /owner/settings (Profile)

Entry: `src/routes/_operator/owner.settings.tsx`
Dependencies:
- `src/components/ae/settings/OwnerSettingsShell.tsx`
  - `src/components/ae/layout/AeOperatorShell.tsx`
    - `src/components/ae/layout/AeOperatorSidebar.tsx`
      - `src/components/ui/sidebar.tsx`
      - `src/components/ui/badge.tsx`
      - `src/lib/operator/navigation.ts`
    - `src/components/ae/layout/AeRecordHeader.tsx`
    - `src/components/ae/layout/AeOperatorBreadcrumbs.tsx`
    - `src/components/ae/layout/AeOperatorCommandMenu.tsx`
    - `src/components/ui/separator.tsx`
    - `src/components/ui/sidebar.tsx` (SidebarProvider, SidebarInset, SidebarTrigger)
  - `src/components/ae/settings/OwnerSettingsNav.tsx`
    - `src/lib/operator/settings-navigation.ts`
  - `src/components/ae/layout/AeSection.tsx` (`AeSettingsStack`)
- `src/components/ae/settings/OwnerSettingsSections.tsx` (`AccountSettingsSection`)
  - `src/components/ae/layout/AeSection.tsx`
  - `src/components/ui/alert.tsx`
  - `src/components/ae/website/AeSiteAuthPanel.tsx` (sign-out when Clerk is live)
  - Clerk `UserProfile` (third-party widget; not in repo)

## /owner/settings/workspace

Entry: `src/routes/_operator/owner.settings.workspace.tsx`
- OwnerSettingsShell (same tree)
- `src/components/ae/settings/AeWorkspaceGeneral.tsx`
  - `src/components/ae/data/AeFactList.tsx`
  - `src/components/ae/feedback/AeEmptyState.tsx`
  - `src/components/ae/layout/AeSection.tsx` (`AeSettingsRow`)
  - `src/components/ui/button.tsx`

## /owner/settings/members

- `src/components/ae/settings/AeWorkspaceMembers.tsx` + OwnerSettingsShell + EmptyState + SettingsRow

## /owner/settings/developers

- `src/components/ae/settings/AeWorkspaceDevelopers.tsx` + OwnerSettingsShell + SettingsRow

## /owner/settings/payouts

- OwnerSettingsShell + `src/components/ae/supply/AeSupplyEarningsCard.tsx`

## /owner/settings/connections

- OwnerSettingsShell + `src/components/ae/supply/AeOwnerProviderConnections.tsx`

## Operator shell (shared)

`src/components/ae/layout/AeOperatorShell.tsx` is the layout for every owner/admin/developer panel. Settings is the first page; later pages reuse this shell.

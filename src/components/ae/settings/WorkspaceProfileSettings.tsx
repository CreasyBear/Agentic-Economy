import { Link, useRouter } from '@tanstack/react-router'
import { makeFunctionReference } from 'convex/server'
import { useQuery } from 'convex/react'

import { ProviderNameEditor } from '@/components/ae/settings/ProviderNameEditor'
import { WorkspaceNameEditor } from '@/components/ae/settings/WorkspaceNameEditor'
import { WorkspaceDangerZone } from '@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone'
import {
  SettingsDangerZone, SettingsEmptyState, SettingsGroup, SettingsPage, SettingsRow,
} from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Skeleton as ArcSkeleton } from '@/components/arc/skeleton/skeleton'
import type {
  ProviderWorkspaceIdentityDetailResult, ProviderWorkspacePublicStatusResult,
} from '@/components/ae/offerings/provider-workspace.functions'
import { renameProviderDisplayNameServer } from '@/lib/server/owner-workspace.functions'
import type { WorkspaceOrganizationBinding } from '@/lib/server/workspace-profile.functions'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

const readWorkspaceOrganizationBinding = makeFunctionReference<
  'query', Record<string, never>, WorkspaceOrganizationBinding
>('workspaceAccounts:readWorkspaceOrganizationBinding')

export type WorkspaceProfileSettingsProps = Readonly<{
  identity: ProviderWorkspaceIdentityDetailResult
  status: ProviderWorkspacePublicStatusResult
  defaultName: string | null
}>

export function WorkspaceProfileSettings({ identity, status, defaultName }: WorkspaceProfileSettingsProps) {
  const workspace = useQuery(readWorkspaceOrganizationBinding)
  const router = useRouter()
  const catalog = status.kind === 'available' ? status.value.catalog : null
  const provider = identity.kind === 'available' ? identity : null
  const publicName = catalog?.name ?? provider?.name
  const businessId = catalog?.businessId ?? provider?.businessId
  const publicPath = catalog?.slug ?? provider?.slug

  return <SettingsPage title="Business profile" description="Manage the workspace name your team sees."
    action={provider ? <Link to="/owner/operations" className={actionLinkClassName('secondary', 'md')}>View Tools</Link> : undefined}>
    <SettingsGroup title="Workspace" description="The name used for your team and receipts; distinct from your public provider name.">
      <SettingsRow label="Workspace name" description="The name members see when working in this workspace.">
        {workspace === undefined ? <div role="status" aria-busy="true" aria-label="Loading workspace name" className="h-10 w-64 max-w-full"><div aria-hidden="true"><ArcSkeleton lines={1} /></div></div>
          : <WorkspaceNameEditor key={workspace.accountRef}
              name={workspace.clerkOrgId === null && workspace.displayName.startsWith('user_')
                ? defaultName ?? 'Your workspace' : workspace.displayName}
              canonicalName={workspace.displayName} accountRevision={workspace.accountRevision}
              clerkOrgId={workspace.clerkOrgId} canEdit={workspace.callerIsOwner} />}
      </SettingsRow>
    </SettingsGroup>
    {identity.kind !== 'not_applicable' && <SettingsGroup title="Public provider profile" description="The name and details buyers see on your provider listing and Tools.">
      {provider && publicName && businessId ? <>
        <SettingsRow label="Public provider name" description="Changing this name updates the listing and current Tools, not the workspace name.">
          <ProviderNameEditor businessId={businessId} currentName={publicName} onRename={async (input) => {
            const result = await renameProviderDisplayNameServer({ data: input })
            if (result.kind === 'updated' || result.kind === 'unchanged') await router.invalidate()
            return result
          }} />
        </SettingsRow>
        <SettingsRow label="Public path" description="The address buyers use to find your provider profile.">
          <span className="break-all font-mono">/{publicPath}</span>
        </SettingsRow>
        <SettingsRow label="Visibility" description="Whether buyers can find your profile.">
          <span className="capitalize">{provider.publicStatus}</span>
        </SettingsRow>
        {catalog ? <>
          <SettingsRow label="Category" description="The type of service buyers see.">
            {catalog.category}
          </SettingsRow>
          <SettingsRow label="Disposition" description="Your provider listing state.">
            {catalog.disposition}
          </SettingsRow>
        </> : null}
      </> : <SettingsEmptyState title="Provider profile unavailable"
        description="Try again in a moment; your workspace details remain available."
        action={<Link to="/owner/operations" className={actionLinkClassName('secondary', 'md')}>Open Tools</Link>} />}
    </SettingsGroup>}
    <SettingsDangerZone description="Closing a workspace or transferring ownership affects every member and Tool.">
      <WorkspaceDangerZone />
    </SettingsDangerZone>
  </SettingsPage>
}

import { createFileRoute } from '@tanstack/react-router'

import { WorkspaceProfileSettings } from '@/components/ae/settings/WorkspaceProfileSettings'
import {
  readProviderWorkspaceIdentityDetailServer,
  readProviderWorkspacePublicStatusServer,
} from '@/components/ae/offerings/provider-workspace.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readPersonalWorkspaceDefaultNameServer } from '@/lib/server/workspace-profile.functions'

export const Route = createFileRoute('/_operator/owner/settings/workspace')({
  ...operatorRouteOptions,
  loader: async () => ({
    identity: await readProviderWorkspaceIdentityDetailServer(),
    status: await readProviderWorkspacePublicStatusServer(),
    defaultName: await readPersonalWorkspaceDefaultNameServer(),
  }),
  head: () => ({ meta: [{ title: 'Business profile | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: WorkspaceSettingsRoute,
})

function WorkspaceSettingsRoute() {
  return <WorkspaceProfileSettings {...Route.useLoaderData()} />
}

import { createFileRoute } from '@tanstack/react-router'

import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerStatusServer } from '@/lib/server/owner-status.functions'

export const Route = createFileRoute('/_operator/owner/settings/workspace')({
  ...operatorRouteOptions,
  loader: () => readOwnerStatusServer({ data: {} }),
  head: () => ({
    meta: [
      { title: 'Workspace | Agentic Economy' },
      { name: 'description', content: 'Supplier identity for this workspace.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsWorkspaceRoute,
})

function OwnerSettingsWorkspaceRoute() {
  const result = Route.useLoaderData()
  return <AeWorkspaceGeneral result={result} />
}

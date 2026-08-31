import { createFileRoute } from '@tanstack/react-router'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeWorkspaceGeneral } from '@/components/ae/settings/AeWorkspaceGeneral'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerStatusServer } from '@/lib/server/owner-status.functions'
import { renameSupplierDisplayNameServer } from '@/lib/server/owner-workspace.functions'

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
  const router = useRouter()
  const rename = useServerFn(renameSupplierDisplayNameServer)
  return <AeWorkspaceGeneral result={result} onRename={async (input) => {
    const renamed = await rename({ data: input })
    if (renamed.kind === 'updated' || renamed.kind === 'unchanged') await router.invalidate()
    return renamed
  }} />
}

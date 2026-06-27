import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminRouteShell } from '@/modules/security/public'

export const Route = createFileRoute('/admin/index-health')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'index_health',
      now: 0,
    }),
  component: AdminIndexHealthRoute,
})

function AdminIndexHealthRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeAdminShell
      title="Index health"
      description="Check catalog and projection readbacks before public discovery files are allowed to ship."
      currentPath="/admin/index-health"
    >
      <AeAdminReadbackPanel
        title="Index readback"
        description="The current surface is guarded until admin membership and source-owned projection rows exist."
        readback={readback}
      />
    </AeAdminShell>
  )
}

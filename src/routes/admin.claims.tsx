import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminRouteShell } from '@/modules/security/public'

export const Route = createFileRoute('/admin/claims')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'claims_queue',
      now: 0,
    }),
  component: AdminClaimsRoute,
})

function AdminClaimsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeAdminShell
      title="Claims queue"
      description="Review owner contention, duplicate claims, and recovery work only after source-owned admin membership is active."
      currentPath="/admin/claims"
    >
      <AeAdminReadbackPanel
        title="Claim recovery readback"
        description="The route renders denial state from the same source-owned readback contract used by the server boundary."
        readback={readback}
      />
    </AeAdminShell>
  )
}

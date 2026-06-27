import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminRouteShell } from '@/modules/security/public'

export const Route = createFileRoute('/admin/audit-events')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'audit_events',
      now: 0,
    }),
  component: AdminAuditEventsRoute,
})

function AdminAuditEventsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeAdminShell
      title="Audit events"
      description="Inspect admin and recovery transitions with redacted payloads after source-owned membership is resolved."
      currentPath="/admin/audit-events"
    >
      <AeAdminReadbackPanel
        title="Audit readback"
        description="Denied reads return no private event rows and preserve the HTTP decision for the operator."
        readback={readback}
      />
    </AeAdminShell>
  )
}

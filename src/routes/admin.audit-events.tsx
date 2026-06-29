import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminAuditEventsThroughSource } from '@/modules/security/admin-readback.functions'

export const readAdminAuditEventsServer = createServerFn().handler(() => readAdminAuditEventsThroughSource())

export const Route = createFileRoute('/admin/audit-events')({
  loader: () => readAdminAuditEventsServer(),
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

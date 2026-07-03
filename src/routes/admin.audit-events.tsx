import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAdminAuditEventsThroughSource } from '@/modules/security/admin-readback.functions'

export const readAdminAuditEventsServer = createServerFn().handler(() => readAdminAuditEventsThroughSource())

export const Route = createFileRoute('/admin/audit-events')({
  ...operatorRouteOptions,
  loader: () => readAdminAuditEventsServer(),
  head: () => ({
    meta: [
      { title: 'Audit events | Agentic Economy' },
      {
        name: 'description',
        content: 'Inspect admin and recovery transitions with redacted payloads.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminAuditEventsRoute,
})

function AdminAuditEventsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Audit events"
      description="Inspect admin and recovery transitions with redacted payloads after source-owned membership is resolved."
      currentPath="/admin/audit-events"
      navBadges={{ '/admin/audit-events': readback.rows.length }}
    >
      <AeAdminReadbackPanel
        title="Audit readback"
        description="Denied reads return no private event rows and preserve the HTTP decision for the operator."
        readback={readback}
      />
    </AeOperatorShell>
  )
}

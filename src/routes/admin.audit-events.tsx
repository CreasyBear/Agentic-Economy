import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminRouteShell } from '@/modules/security/public'
import type { AdminReadbackRow } from '@/modules/security/public'

const auditEventRows = [
  {
    rowId: 'row:audit:correlation-index',
    rowType: 'audit_event',
    objectRef: 'auditEvents.by_correlationId',
    rowState: 'guarded',
    surface: 'audit_events',
    readbackState: 'available',
    repairAction: 'inspect_audit',
    correlationId: 'schema:audit-events',
    attemptRef: 'index:by_correlationId',
    updatedAt: 0,
  },
  {
    rowId: 'row:audit:admin-membership-events',
    rowType: 'audit_event',
    objectRef: 'adminMembershipAuditEvents',
    rowState: 'queued',
    surface: 'audit_events',
    readbackState: 'guarded',
    repairAction: 'inspect_audit',
    correlationId: 'schema:admin-membership-audit',
    attemptRef: 'table:adminMembershipAuditEvents',
    updatedAt: 0,
  },
] satisfies readonly AdminReadbackRow[]

export const Route = createFileRoute('/admin/audit-events')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'audit_events',
      rows: auditEventRows,
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

import { createFileRoute } from '@tanstack/react-router'

import { AdminAuditPage } from '@/components/ae/admin/audit/AdminAuditPage'
import { AdminAuditPageSkeleton } from '@/components/ae/admin/audit/AdminAuditPageSkeleton'
import {
  AUDIT_COPY,
  adminAuditSearchSchema,
} from '@/components/ae/admin/audit/audit.contracts'
import { recoverableSearch } from '@/lib/client/recoverable-search'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/audit-events')({
  ...operatorRouteOptions,
  validateSearch: recoverableSearch(adminAuditSearchSchema, {
    fieldLabels: {
      eventType: 'Event type',
      actorRef: 'Actor',
      targetType: 'Target type',
      targetRef: 'Target',
      correlationId: 'Correlation',
      from: 'From',
      to: 'To',
      eventsLoaded: 'Audit page',
      approvalsLoaded: 'Approval page',
    },
  }),
  pendingComponent: AdminAuditPageSkeleton,
  head: () => ({
    meta: [
      { title: `${AUDIT_COPY.title} | Agentic Economy` },
      { name: 'description', content: AUDIT_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminAuditEventsRoute,
})

function AdminAuditEventsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AdminAuditPage
      search={search}
      onSearchChange={(nextSearch) => {
        void navigate({ search: nextSearch, replace: true })
      }}
    />
  )
}

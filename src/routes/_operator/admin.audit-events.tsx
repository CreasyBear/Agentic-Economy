import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ScrollText } from 'lucide-react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAdminAuditEventsThroughSource } from '@/modules/security/admin-readback.functions'

const readAdminAuditEventsServer = createServerFn().handler(() => readAdminAuditEventsThroughSource())

export const Route = createFileRoute('/_operator/admin/audit-events')({
  staticData: {
    nav: {
      label: 'Audit',
      operator: {
        roles: ['admin'],
        group: 'Records',
        groupOrder: 0,
        order: 1,
        icon: ScrollText,
        tier: 'core',
      },
    },
  },
  ...operatorRouteOptions,
  loader: () => readAdminAuditEventsServer(),
  head: () => ({
    meta: [
      { title: 'Activity log | Agentic Economy' },
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
    <AeOperatorPage
      operatorRole="admin"
      title="Activity log"
      description="Inspect admin and recovery transitions with redacted payloads after source-owned membership is resolved."
      currentPath="/admin/audit-events"
      navBadges={{ '/admin/audit-events': readback.rows.length }}
    >
      <AeAdminReadbackPanel
        title="Audit readback"
        description="Denied reads return no private event rows and preserve the HTTP decision for the operator."
        readback={readback}
      />
    </AeOperatorPage>
  )
}

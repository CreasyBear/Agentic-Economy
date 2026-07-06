import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAdminClaimsThroughSource } from '@/modules/security/admin-readback.functions'

export const readAdminClaimsServer = createServerFn().handler(() => readAdminClaimsThroughSource())

export const Route = createFileRoute('/_operator/admin/claims')({
  ...operatorRouteOptions,
  loader: () => readAdminClaimsServer(),
  head: () => ({
    meta: [
      { title: 'Claims queue | Agentic Economy' },
      {
        name: 'description',
        content: 'Operator review of owner contention, duplicate claims, and recovery work.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminClaimsRoute,
})

function AdminClaimsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Claims queue"
      description="Review owner contention, duplicate claims, and recovery work only after source-owned admin membership is active."
      currentPath="/admin/claims"
      navBadges={{ '/admin/claims': readback.rows.length }}
    >
      <AeAdminReadbackPanel
        title="Claim recovery readback"
        description="The route renders denial state from the same source-owned readback contract used by the server boundary."
        readback={readback}
      />
    </AeOperatorShell>
  )
}

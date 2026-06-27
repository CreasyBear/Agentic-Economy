import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminRouteShell } from '@/modules/security/public'
import type { AdminReadbackRow } from '@/modules/security/public'

const claimsQueueRows = [
  {
    rowId: 'row:claims:disputes-by-business-status',
    rowType: 'claim',
    objectRef: 'disputes.by_business_status',
    rowState: 'guarded',
    surface: 'claims_queue',
    readbackState: 'available',
    repairAction: 'review_claim',
    correlationId: 'schema:disputes',
    attemptRef: 'index:by_business_status',
    updatedAt: 0,
  },
] satisfies readonly AdminReadbackRow[]

export const Route = createFileRoute('/admin/claims')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'claims_queue',
      rows: claimsQueueRows,
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

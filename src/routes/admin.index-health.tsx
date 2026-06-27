import { createFileRoute } from '@tanstack/react-router'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { readAdminRouteShell } from '@/modules/security/public'
import type { AdminReadbackRow } from '@/modules/security/public'

const indexHealthRows = [
  {
    rowId: 'row:index:suppression-target',
    rowType: 'index_surface',
    objectRef: 'suppressionRules.by_target_status',
    rowState: 'guarded',
    surface: 'index_health',
    readbackState: 'available',
    repairAction: 'regenerate_projection',
    correlationId: 'schema:suppression-rules',
    attemptRef: 'index:by_target_status',
    updatedAt: 0,
  },
  {
    rowId: 'row:index:operator-controls',
    rowType: 'index_surface',
    objectRef: 'operatorControls.by_key',
    rowState: 'guarded',
    surface: 'index_health',
    readbackState: 'available',
    repairAction: 'regenerate_projection',
    correlationId: 'schema:operator-controls',
    attemptRef: 'index:by_key',
    updatedAt: 0,
  },
] satisfies readonly AdminReadbackRow[]

export const Route = createFileRoute('/admin/index-health')({
  loader: () =>
    readAdminRouteShell({
      membership: undefined,
      surface: 'index_health',
      rows: indexHealthRows,
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

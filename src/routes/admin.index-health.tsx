import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import {
  readAdminIndexHealthThroughSource,
} from '@/modules/security/admin-readback.functions'

export const readAdminIndexHealthServer = createServerFn().handler(() => readAdminIndexHealthThroughSource())

export const Route = createFileRoute('/admin/index-health')({
  loader: () => readAdminIndexHealthServer(),
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
        description="Denied reads return no private rows; authorized reads show source, attempt, repair, and affected public surfaces."
        readback={readback}
      />
    </AeAdminShell>
  )
}

import { createFileRoute } from '@tanstack/react-router'

import { AdminObjectPage } from '@/components/ae/admin/object-pages/AdminObjectPage'
import { ADMIN_OBJECT_PAGE_COPY } from '@/components/ae/admin/object-pages/object-pages.contracts'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'

export const Route = createFileRoute('/_operator/admin/workspaces/$accountRef')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: ADMIN_OBJECT_PAGE_COPY.workspace.metaTitle },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminWorkspaceObjectRoute,
})

function AdminWorkspaceObjectRoute() {
  const { accountRef } = Route.useParams()
  const parsed = parseAdminObjectRef('workspace', accountRef)
  if (parsed.kind === 'malformed' || parsed.ref.kind !== 'workspace') {
    return <OperatorRouteNotFoundRecovery recoveryHref="/admin/search" recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch} />
  }
  return <AdminObjectPage {...parsed.ref} />
}

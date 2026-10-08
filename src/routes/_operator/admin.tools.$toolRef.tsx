import { adminInvestigationSearchSchema } from '@/components/ae/admin/exceptions/admin-investigation-return'
import { createFileRoute } from '@tanstack/react-router'

import { AdminObjectPage } from '@/components/ae/admin/object-pages/AdminObjectPage'
import { ADMIN_OBJECT_PAGE_COPY } from '@/components/ae/admin/object-pages/object-pages.contracts'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'

export const Route = createFileRoute('/_operator/admin/tools/$toolRef')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>) => adminInvestigationSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: ADMIN_OBJECT_PAGE_COPY.toolVersion.metaTitle },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminToolObjectRoute,
})

function AdminToolObjectRoute() {
  const { toolRef } = Route.useParams()
  const parsed = parseAdminObjectRef('tool_version', toolRef)
  if (parsed.kind === 'malformed' || parsed.ref.kind !== 'tool_version') {
    return <OperatorRouteNotFoundRecovery recoveryHref="/admin/search" recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch} />
  }
  return <AdminObjectPage {...parsed.ref} />
}

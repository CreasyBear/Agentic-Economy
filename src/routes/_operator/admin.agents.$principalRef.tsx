import { createFileRoute } from '@tanstack/react-router'

import { AdminObjectPage } from '@/components/ae/admin/object-pages/AdminObjectPage'
import { ADMIN_OBJECT_PAGE_COPY } from '@/components/ae/admin/object-pages/object-pages.contracts'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'

export const Route = createFileRoute('/_operator/admin/agents/$principalRef')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: ADMIN_OBJECT_PAGE_COPY.agent.metaTitle },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminAgentObjectRoute,
})

function AdminAgentObjectRoute() {
  const { principalRef } = Route.useParams()
  const parsed = parseAdminObjectRef('agent', principalRef)
  if (parsed.kind === 'malformed' || parsed.ref.kind !== 'agent') {
    return <OperatorRouteNotFoundRecovery recoveryHref="/admin/search" recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch} />
  }
  return <AdminObjectPage {...parsed.ref} />
}

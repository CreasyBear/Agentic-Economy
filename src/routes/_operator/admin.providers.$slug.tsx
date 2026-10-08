import { adminInvestigationSearchSchema } from '@/components/ae/admin/exceptions/admin-investigation-return'
import { createFileRoute } from '@tanstack/react-router'

import { AdminProviderObjectPage } from '@/components/ae/admin/provider-object/AdminProviderObjectPage'
import { PROVIDER_OBJECT_COPY } from '@/components/ae/admin/provider-object/provider-object.contracts'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/providers/$slug')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>) => adminInvestigationSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: `${PROVIDER_OBJECT_COPY.title} | Admin | Agentic Economy` },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminProviderObjectRoute,
})

function AdminProviderObjectRoute() {
  const { slug } = Route.useParams()
  const parsed = parseAdminObjectRef('provider', slug)
  if (parsed.kind === 'malformed' || parsed.ref.kind !== 'provider') {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={PROVIDER_OBJECT_COPY.backToSearch}
      />
    )
  }
  return <AdminProviderObjectPage slug={parsed.ref.ref} />
}

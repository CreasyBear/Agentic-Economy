import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AdminExceptionsPage } from '@/components/ae/admin/exceptions/AdminExceptionsPage'
import { AdminExceptionsPageSkeleton } from '@/components/ae/admin/exceptions/AdminExceptionsPageSkeleton'
import {
  ADMIN_EXCEPTIONS_COPY,
  adminExceptionsSearchSchema,
} from '@/components/ae/admin/exceptions/exceptions.contracts'
import {
  buildAdminEventProperties,
  captureAdminEvent,
} from '@/lib/observability/admin-event-props'
import type { AdminExceptionKind } from '@/lib/operator/admin-console/contracts'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { requireOperatorBeforeLoad } from '@/lib/server/require-operator-session'
import { principalRef } from '@/modules/principal-account/principal/public'

const captureAdminQueueViewServer = createServerFn()
  .validator((data: { kind: AdminExceptionKind | null }) => data)
  .handler(async ({ data }): Promise<null> => {
    const session = await requireOperatorBeforeLoad({ location: { href: '/admin/exceptions' } })
    const properties = buildAdminEventProperties('admin_queue_view', { kind: data.kind ?? 'all' })
    captureAdminEvent(principalRef(session.principalRef), 'admin_queue_view', properties)
    return null
  })

export const Route = createFileRoute('/_operator/admin/exceptions')({
  ...operatorRouteOptions,
  validateSearch: adminExceptionsSearchSchema,
  loaderDeps: ({ search }) => ({ kind: search.kind ?? null }),
  loader: ({ deps }) => captureAdminQueueViewServer({ data: deps }),
  pendingComponent: AdminExceptionsPageSkeleton,
  head: () => ({
    meta: [
      { title: `${ADMIN_EXCEPTIONS_COPY.title} | Agentic Economy` },
      { name: 'description', content: ADMIN_EXCEPTIONS_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminExceptionsRoute,
})

function AdminExceptionsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AdminExceptionsPage
      search={search}
      onSearchChange={(nextSearch) => {
        void navigate({ search: nextSearch, replace: true })
      }}
    />
  )
}

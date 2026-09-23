import { createFileRoute } from '@tanstack/react-router'

import { AdminOverviewPage } from '@/components/ae/admin/overview/AdminOverviewPage'
import { AdminOverviewPageSkeleton } from '@/components/ae/admin/overview/AdminOverviewPageSkeleton'
import { ADMIN_OVERVIEW_COPY } from '@/components/ae/admin/overview/overview.contracts'
import { readAdminFormanceConfigurationServer } from '@/components/ae/admin/overview/readAdminOverview.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/')({
  ...operatorRouteOptions,
  loader: () => readAdminFormanceConfigurationServer(),
  pendingComponent: AdminOverviewPageSkeleton,
  head: () => ({
    meta: [
      { title: `${ADMIN_OVERVIEW_COPY.title} | Agentic Economy` },
      { name: 'description', content: ADMIN_OVERVIEW_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminOverviewRoute,
})

function AdminOverviewRoute() {
  return <AdminOverviewPage formance={Route.useLoaderData()} />
}

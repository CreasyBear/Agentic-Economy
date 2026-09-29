import { createFileRoute } from '@tanstack/react-router'

import { AdminMetricsPage } from '@/components/ae/admin/metrics/AdminMetricsPage'
import { AdminMetricsPageSkeleton } from '@/components/ae/admin/metrics/AdminMetricsPageSkeleton'
import {
  ADMIN_METRICS_COPY,
  adminMetricsSearchSchema,
} from '@/components/ae/admin/metrics/metrics.contracts'
import { recoverableSearch } from '@/lib/client/recoverable-search'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/metrics')({
  ...operatorRouteOptions,
  validateSearch: recoverableSearch(adminMetricsSearchSchema, {
    fieldLabels: { range: 'Reporting range' },
  }),
  pendingComponent: AdminMetricsPageSkeleton,
  head: () => ({
    meta: [
      { title: `${ADMIN_METRICS_COPY.title} | Agentic Economy` },
      { name: 'description', content: ADMIN_METRICS_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminMetricsRoute,
})

function AdminMetricsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AdminMetricsPage
      range={search.range ?? 'last_7'}
      {...(search.rejected === undefined ? {} : { rejected: search.rejected })}
      onRangeChange={(range) => void navigate({ search: { range }, replace: true })}
    />
  )
}

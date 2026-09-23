import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
import { ADMIN_METRICS_COPY } from './metrics.contracts'

export function AdminMetricsPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_METRICS_COPY.title}
      description={ADMIN_METRICS_COPY.description}
      currentPath="/admin/metrics"
      breadcrumbs={[
        { label: ADMIN_METRICS_COPY.adminBreadcrumb, href: '/admin' },
        { label: ADMIN_METRICS_COPY.title },
      ]}
      stickyHeader
      pending
    >
      <div className="grid gap-section">
        <Skeleton className="h-36 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-80 rounded-card" />
      </div>
    </AeOperatorPage>
  )
}

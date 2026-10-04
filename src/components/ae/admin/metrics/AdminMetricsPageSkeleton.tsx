import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import '../AdminLoadingComposition.css'
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
      <div className="arc-market arc-admin-loading" role="status" aria-busy="true" aria-label="Loading metrics">
        <div aria-hidden="true">
          <div className="arc-admin-loading-kpis">
            <div className="arc-admin-loading-kpi">
              <Skeleton lines={1} />
              <Skeleton lines={2} />
            </div>
            <div className="arc-admin-loading-kpi">
              <Skeleton lines={1} />
              <Skeleton lines={2} />
            </div>
            <div className="arc-admin-loading-kpi">
              <Skeleton lines={1} />
              <Skeleton lines={2} />
            </div>
            <div className="arc-admin-loading-kpi">
              <Skeleton lines={1} />
              <Skeleton lines={2} />
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="arc-admin-loading-pane">
          <Skeleton lines={1} />
          <div className="arc-admin-loading-chart"><Skeleton lines={6} /></div>
        </div>
        <div aria-hidden="true">
          <div className="arc-admin-loading-pane">
            <Skeleton lines={1} />
            <div className="arc-admin-loading-row">
              <Skeleton lines={1} />
              <Skeleton lines={1} />
            </div>
            <div className="arc-admin-loading-row">
              <Skeleton lines={1} />
              <Skeleton lines={1} />
            </div>
            <div className="arc-admin-loading-row">
              <Skeleton lines={1} />
              <Skeleton lines={1} />
            </div>
            <div className="arc-admin-loading-row">
              <Skeleton lines={1} />
              <Skeleton lines={1} />
            </div>
          </div>
        </div>
      </div>
    </AeOperatorPage>
  )
}

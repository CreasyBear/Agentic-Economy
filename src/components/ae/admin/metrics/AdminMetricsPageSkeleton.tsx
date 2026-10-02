import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
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
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={ADMIN_METRICS_COPY.title}>
        <div aria-hidden="true">
          <div className="arc-admin-loading-kpis">
            <div className="arc-admin-loading-kpi">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" data-size="value" />
            </div>
            <div className="arc-admin-loading-kpi">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" data-size="value" />
            </div>
            <div className="arc-admin-loading-kpi">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" data-size="value" />
            </div>
            <div className="arc-admin-loading-kpi">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" data-size="value" />
            </div>
          </div>
        </div>
        <div aria-hidden="true" className="arc-admin-loading-pane">
          <span className="arc-admin-loading-line" data-size="title" />
          <div className="arc-admin-loading-chart" />
        </div>
        <div aria-hidden="true">
          <div className="arc-admin-loading-pane">
            <span className="arc-admin-loading-line" data-size="title" />
            <div className="arc-admin-loading-row">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" />
            </div>
            <div className="arc-admin-loading-row">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" />
            </div>
            <div className="arc-admin-loading-row">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" />
            </div>
            <div className="arc-admin-loading-row">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" />
            </div>
          </div>
        </div>
      </div>
    </AeOperatorPage>
  )
}

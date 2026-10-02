import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import { ADMIN_OVERVIEW_COPY } from './overview.contracts'

export function AdminOverviewPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_OVERVIEW_COPY.title}
      description={ADMIN_OVERVIEW_COPY.description}
      currentPath="/admin"
      breadcrumbs={[{ label: ADMIN_OVERVIEW_COPY.adminBreadcrumb }]}
      stickyHeader
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={ADMIN_OVERVIEW_COPY.title}>
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
          </div>
        </div>
        <div aria-hidden="true">
          <div className="arc-admin-loading-pane">
            <span className="arc-admin-loading-line" data-size="title" />
            <div className="arc-admin-loading-row">
              <span className="arc-admin-loading-line" />
              <span className="arc-admin-loading-line" />
            </div>
          </div>
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
          </div>
        </div>
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
      </div>
    </AeOperatorPage>
  )
}

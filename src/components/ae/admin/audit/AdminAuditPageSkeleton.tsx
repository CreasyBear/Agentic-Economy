import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import { AUDIT_COPY } from './audit.contracts'

export function AdminAuditPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={AUDIT_COPY.title}
      description={AUDIT_COPY.description}
      currentPath="/admin/audit-events"
      breadcrumbs={[
        { label: AUDIT_COPY.breadcrumbs.admin, href: '/admin' },
        { label: AUDIT_COPY.breadcrumbs.audit },
      ]}
      stickyHeader
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={AUDIT_COPY.title}>
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

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import { ADMIN_CALL_OBJECT_COPY } from './call-object.contracts'

export function AdminCallObjectPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_CALL_OBJECT_COPY.loadingTitle}
      description={ADMIN_CALL_OBJECT_COPY.loadingDescription}
      currentPath="/admin/calls/loading"
      stickyHeader
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={ADMIN_CALL_OBJECT_COPY.loadingTitle}>
        <div aria-hidden="true" className="arc-admin-loading-object">
          <div className="arc-market arc-admin-loading">
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
      </div>
    </AeOperatorPage>
  )
}

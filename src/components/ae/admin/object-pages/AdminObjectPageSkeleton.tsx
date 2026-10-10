import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import { ADMIN_OBJECT_PAGE_COPY } from './object-pages.contracts'

export function AdminObjectPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath="/admin/search"
      title={ADMIN_OBJECT_PAGE_COPY.loadingTitle}
      description={ADMIN_OBJECT_PAGE_COPY.loadingDescription}
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={ADMIN_OBJECT_PAGE_COPY.loadingTitle}>
        <div aria-hidden="true" className="arc-admin-loading-object">
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

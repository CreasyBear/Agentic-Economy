import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import { ADMIN_EXCEPTIONS_COPY } from './exceptions.contracts'

export function AdminExceptionsPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_EXCEPTIONS_COPY.title}
      description={ADMIN_EXCEPTIONS_COPY.description}
      currentPath="/admin/exceptions"
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={ADMIN_EXCEPTIONS_COPY.title}>
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

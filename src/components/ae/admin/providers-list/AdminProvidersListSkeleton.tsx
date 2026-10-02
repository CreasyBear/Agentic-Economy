import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import { PROVIDERS_LIST_COPY } from './providers-list.contracts'

export function AdminProvidersListSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={PROVIDERS_LIST_COPY.title}
      description={PROVIDERS_LIST_COPY.description}
      currentPath="/admin/providers"
      breadcrumbs={[
        { label: PROVIDERS_LIST_COPY.breadcrumbs.admin, href: '/admin' },
        { label: PROVIDERS_LIST_COPY.breadcrumbs.providers },
      ]}
      stickyHeader
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={PROVIDERS_LIST_COPY.title}>
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
      </div>
    </AeOperatorPage>
  )
}

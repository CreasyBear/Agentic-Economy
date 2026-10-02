import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import '../AdminLoadingComposition.css'
import type { Slug } from '@/modules/common/ids'
import { PROVIDER_OBJECT_COPY } from './provider-object.contracts'

export type AdminProviderObjectSkeletonProps = Readonly<{ slug: Slug }>

export function AdminProviderObjectSkeleton({ slug }: AdminProviderObjectSkeletonProps) {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={`${PROVIDER_OBJECT_COPY.title} ${slug}`}
      description={PROVIDER_OBJECT_COPY.description}
      currentPath={`/admin/providers/${slug}`}
      breadcrumbs={[
        { label: PROVIDER_OBJECT_COPY.breadcrumbs.admin, href: '/admin' },
        { label: PROVIDER_OBJECT_COPY.breadcrumbs.providers, href: '/admin/providers' },
        { label: slug },
      ]}
      stickyHeader
      pending
    >
      <div className="arc-market arc-admin-loading" aria-busy="true" aria-label={PROVIDER_OBJECT_COPY.title}>
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

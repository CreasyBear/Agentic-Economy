import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
import { ADMIN_OBJECT_PAGE_COPY } from './object-pages.contracts'

export function AdminObjectPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath="/admin/search"
      title={ADMIN_OBJECT_PAGE_COPY.loadingTitle}
      description={ADMIN_OBJECT_PAGE_COPY.loadingDescription}
      breadcrumbs={[{ label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' }]}
      stickyHeader
      pending
    >
      <div
        className="grid gap-section pb-page lg:grid-cols-[minmax(0,1fr)_20rem]"
        aria-busy="true"
        aria-label={ADMIN_OBJECT_PAGE_COPY.loadingTitle}
      >
        <div className="grid content-start gap-related">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="grid content-start gap-related">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </AeOperatorPage>
  )
}

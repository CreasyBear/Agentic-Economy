import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
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
      <div className="grid gap-section">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-52 rounded-card" />
        <Skeleton className="h-48 rounded-card" />
        <Skeleton className="h-36 rounded-card" />
      </div>
    </AeOperatorPage>
  )
}

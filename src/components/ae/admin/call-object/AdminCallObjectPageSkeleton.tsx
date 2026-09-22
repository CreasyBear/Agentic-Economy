import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
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
      <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true">
        <div className="grid gap-section">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </AeOperatorPage>
  )
}

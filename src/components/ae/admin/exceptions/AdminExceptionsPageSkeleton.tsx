import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
import { ADMIN_EXCEPTIONS_COPY } from './exceptions.contracts'

export function AdminExceptionsPageSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_EXCEPTIONS_COPY.title}
      description={ADMIN_EXCEPTIONS_COPY.description}
      currentPath="/admin/exceptions"
      breadcrumbs={[
        { label: ADMIN_EXCEPTIONS_COPY.breadcrumbs.admin, href: '/admin' },
        { label: ADMIN_EXCEPTIONS_COPY.breadcrumbs.exceptions },
      ]}
      stickyHeader
      pending
    >
      <div className="grid gap-section" aria-busy="true" aria-label={ADMIN_EXCEPTIONS_COPY.title}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </AeOperatorPage>
  )
}

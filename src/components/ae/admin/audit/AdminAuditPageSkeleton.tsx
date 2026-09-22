import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
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
      <div className="grid gap-section" aria-busy="true" aria-label={AUDIT_COPY.title}>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </AeOperatorPage>
  )
}

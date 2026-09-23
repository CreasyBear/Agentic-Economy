import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
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
      <div className="grid gap-section" aria-busy="true" aria-label={PROVIDERS_LIST_COPY.title}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </AeOperatorPage>
  )
}

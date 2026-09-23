import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'
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
      <div className="grid gap-section" aria-busy="true" aria-label={PROVIDER_OBJECT_COPY.title}>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </AeOperatorPage>
  )
}

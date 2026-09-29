import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import type { AdminObjectKind } from '@/lib/operator/admin-console/contracts'
import { AdminObjectSearchForm } from './components/AdminObjectSearchForm'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { ADMIN_OBJECT_SEARCH_COPY } from './object-search.contracts'
import { useAdminObjectSearch } from './useAdminObjectSearch'

export type AdminObjectSearchProps = Readonly<{
  initialKind?: AdminObjectKind
  initialRef?: string
  rejected?: string
}>

export function AdminObjectSearch({ initialKind, initialRef, rejected }: AdminObjectSearchProps) {
  const search = useAdminObjectSearch()
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_OBJECT_SEARCH_COPY.title}
      description={ADMIN_OBJECT_SEARCH_COPY.description}
      currentPath="/admin/search"
      stickyHeader
      secondaryBar={(
        <AeOperatorBreadcrumbs items={[
          { label: ADMIN_OBJECT_SEARCH_COPY.adminBreadcrumb, href: '/admin' },
          { label: ADMIN_OBJECT_SEARCH_COPY.title },
        ]} />
      )}
    >
      <AdminSearchNotice rejected={rejected} />
      <AdminObjectSearchForm
        {...(initialKind === undefined ? {} : { initialKind })}
        {...(initialRef === undefined ? {} : { initialRef })}
        state={search.state}
        onSubmit={(input) => { void search.submit(input) }}
      />
    </AeOperatorPage>
  )
}

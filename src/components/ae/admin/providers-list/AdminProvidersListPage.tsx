import type { ReactNode } from 'react'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AdminSearchNotice } from '../AdminSearchNotice'
import { AdminProvidersListSkeleton } from './AdminProvidersListSkeleton'
import { ProviderFilterChips } from './components/ProviderFilterChips'
import { ProvidersTable } from './components/ProvidersTable'
import {
  PROVIDERS_LIST_COPY,
  type AdminProvidersListPageProps,
} from './providers-list.contracts'
import { useAdminProvidersList } from './useAdminProvidersList'

export function AdminProvidersListPage(props: AdminProvidersListPageProps) {
  const providers = useAdminProvidersList(props)
  if (providers.data.kind === 'loading') return <AdminProvidersListSkeleton />

  let content: ReactNode
  if (providers.data.kind === 'refused') {
    content = (
      <AePageState
        title={PROVIDERS_LIST_COPY.accessDeniedTitle}
        description={PROVIDERS_LIST_COPY.accessDeniedDescription}
        tone="danger"
      />
    )
  } else {
    content = (
      <div className="grid gap-section pb-page">
        <AdminSearchNotice rejected={props.search.rejected} />
        <AeSection title={PROVIDERS_LIST_COPY.filterTitle} description={PROVIDERS_LIST_COPY.filterDescription}>
          <ProviderFilterChips filter={providers.filter} onChange={providers.onFilterChange} />
        </AeSection>
        <ProvidersTable
          rows={providers.data.rows}
          filtered={providers.filtered}
          paginationStatus={providers.data.paginationStatus}
          onLoadMore={providers.data.loadMore}
        />
      </div>
    )
  }

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
    >
      {content}
    </AeOperatorPage>
  )
}

import { usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import type {
  AdminProviderFilter,
  AdminProvidersDataState,
  AdminProvidersListPageProps,
} from './providers-list.contracts'
import { providerRowModel } from './providers-list.view-model'


export function useAdminProvidersList({ search, onSearchChange }: AdminProvidersListPageProps) {
  const filter: AdminProviderFilter = search.filter ?? 'all'
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const allowed = access?.kind === 'allowed'
  const pagination = usePaginatedQuery(
    api.adminConsoleProviders.listAdminProviders,
    allowed ? { filter } : 'skip',
    { initialNumItems: 50 },
  )

  const data: AdminProvidersDataState = access === undefined
    ? { kind: 'loading' }
    : access.kind === 'refused'
      ? { kind: 'refused' }
      : pagination.status === 'LoadingFirstPage'
        ? { kind: 'loading' }
        : {
            kind: 'ready',
            rows: pagination.results.map(providerRowModel),
            paginationStatus: pagination.status,
            loadMore: () => pagination.loadMore(50),
          }

  return {
    data,
    filter,
    filtered: filter === 'suppressed',
    onFilterChange: (nextFilter: AdminProviderFilter) => {
      onSearchChange(nextFilter === 'all' ? {} : { filter: nextFilter })
    },
  }
}


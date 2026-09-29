import { createFileRoute } from '@tanstack/react-router'

import { AdminProvidersListPage } from '@/components/ae/admin/providers-list/AdminProvidersListPage'
import { AdminProvidersListSkeleton } from '@/components/ae/admin/providers-list/AdminProvidersListSkeleton'
import {
  PROVIDERS_LIST_COPY,
  adminProvidersSearchSchema,
} from '@/components/ae/admin/providers-list/providers-list.contracts'
import { recoverableSearch } from '@/lib/client/recoverable-search'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/admin/providers/')({
  ...operatorRouteOptions,
  validateSearch: recoverableSearch(adminProvidersSearchSchema, {
    fieldLabels: { filter: 'Filter', loaded: 'Loaded page' },
  }),
  pendingComponent: AdminProvidersListSkeleton,
  head: () => ({
    meta: [
      { title: `${PROVIDERS_LIST_COPY.title} | Agentic Economy` },
      { name: 'description', content: PROVIDERS_LIST_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminProvidersRoute,
})

function AdminProvidersRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AdminProvidersListPage
      search={search}
      onSearchChange={(nextSearch) => {
        void navigate({ search: nextSearch, replace: true })
      }}
    />
  )
}

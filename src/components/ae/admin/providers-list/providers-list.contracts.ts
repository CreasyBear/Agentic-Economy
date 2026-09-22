import { z } from 'zod'

import type { PublicStatus, TrustTier } from '@/modules/business/public'

export const adminProvidersSearchSchema = z.strictObject({
  filter: z.enum(['all', 'suppressed']).optional(),
})

export type AdminProvidersSearch = z.infer<typeof adminProvidersSearchSchema>
export type AdminProviderFilter = 'all' | 'suppressed'

export type AdminProviderRow = Readonly<{
  slug: string
  publicStatus: PublicStatus
  trustTier: TrustTier
  suppressedAt: number | null
  updatedAt: number
}>

export type AdminProviderRowModel = Readonly<{
  slug: string
  href: string
  publicStatusLabel: string
  trustTierLabel: string
  updatedAtLabel: string
  updatedAtIso: string
}>

export type AdminProvidersReadyState = Readonly<{
  kind: 'ready'
  rows: readonly AdminProviderRowModel[]
  paginationStatus: 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
  loadMore: () => void
}>

export type AdminProvidersDataState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'refused' }>
  | AdminProvidersReadyState

export type AdminProvidersListPageProps = Readonly<{
  search: AdminProvidersSearch
  onSearchChange: (search: AdminProvidersSearch) => void
}>

export type ProvidersTableProps = Readonly<{
  rows: readonly AdminProviderRowModel[]
  filtered: boolean
  paginationStatus: AdminProvidersReadyState['paginationStatus']
  onLoadMore: () => void
}>

export type ProviderFilterChipsProps = Readonly<{
  filter: AdminProviderFilter
  onChange: (filter: AdminProviderFilter) => void
}>

export const PROVIDERS_LIST_COPY = {
  title: 'Providers',
  description: 'Inspect programmable Providers and their current public state.',
  breadcrumbs: { admin: 'Admin', providers: 'Providers' },
  accessDeniedTitle: 'Admin access required',
  accessDeniedDescription: 'Your account does not have the Admin role for this action.',
  filterTitle: 'Filters',
  filterDescription: 'Show every Provider or only suppressed Providers.',
  suppressed: 'Suppressed',
  clearAll: 'Clear all',
  tableTitle: 'Provider records',
  tableDescription: 'Select a Provider to inspect Tool versions, connections, and review cases.',
  noRows: 'Nothing needs attention.',
  noMatches: 'No matches for these filters.',
  loadMore: 'Load more',
  columns: {
    provider: 'Provider',
    publicStatus: 'Public status',
    trustTier: 'Trust tier',
    updated: 'Updated',
  },
}

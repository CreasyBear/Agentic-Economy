import type { OnChangeFn, SortingState } from '@tanstack/react-table'

import type { OwnerOfferingSummary } from '@/components/ae/offerings/provider-workspace-projection'

export const OWNER_OFFERINGS_COPY = {
  callsColumn: 'Calls',
  emptyAction: 'Add Tool',
  emptyDescription: 'Add a source, then choose a Tool to publish.',
} as const

export type OwnerOfferingsState = Readonly<{
  filterEmptyMessage: string | undefined
}>

export type OwnerOfferingStatusClusterProps = Readonly<{
  item: OwnerOfferingSummary
  showBlocker?: boolean
}>

export type AeOwnerOfferingsListProps = Readonly<{
  offerings: readonly OwnerOfferingSummary[]
  projectionState?: 'current' | 'projection_pending'
  onRetryProjection?: () => void
  loading?: boolean
  /** When true, empty inventory does not mount the empty-state Add Tool CTA. */
  hideEmptyState?: boolean
  filterValue?: string
  onFilterChange?: (value: string) => void
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  activeRowActionId?: string
  onActiveRowActionIdChange?: (id: string) => void
  restoreRowActionFocus?: boolean
}>

export type OwnerOfferingsTableProps = Readonly<{
  offerings: readonly OwnerOfferingSummary[]
  loading: boolean
  filterValue?: string
  onFilterChange?: (value: string) => void
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  activeRowActionId?: string
  onActiveRowActionIdChange?: (id: string) => void
  restoreRowActionFocus: boolean
  state: OwnerOfferingsState
}>

export type OwnerOfferingsProjectionGateProps = Readonly<{
  projectionState: 'current' | 'projection_pending'
  onRetryProjection?: () => void
}>

export type { OwnerOfferingSummary } from '@/components/ae/offerings/provider-workspace-projection'

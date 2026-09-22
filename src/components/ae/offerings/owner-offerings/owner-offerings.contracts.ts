import type { RefObject } from 'react'
import type { OnChangeFn, SortingState } from '@tanstack/react-table'

import type { OwnerOfferingSummary } from '@/components/ae/offerings/provider-workspace-projection'

export const TACTILE_PRESS_CLASS =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export const OWNER_OFFERINGS_COPY = {
  callsColumn: 'Calls',
  emptyAction: 'Add Tool',
  emptyDescription: 'Add a source, then choose a Tool to publish.',
} as const

export type OwnerOfferingsState = Readonly<{
  compactRootRef: RefObject<HTMLUListElement | null>
  hasLifecyclePresentation: boolean
  trimmedFilter: string
  compactOfferings: readonly OwnerOfferingSummary[]
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

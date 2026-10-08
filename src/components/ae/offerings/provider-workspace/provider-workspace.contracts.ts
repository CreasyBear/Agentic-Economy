import type { OwnerInventoryQuery } from '@/lib/operator/owner-inventory-search'
import type { SortingState } from '@tanstack/react-table'
import type { ReactNode } from 'react'

import type {
  ProviderWorkspaceInventoryResult,
  ProviderWorkspaceLifecycleResult,
  ProviderWorkspaceConnectionsResult,
  ProviderWorkspacePublicStatusResult,
  OwnerProviderOffboardingResult,
} from '@/components/ae/offerings/provider-workspace.functions'
import type { ProviderWorkspaceProjectionRow } from '@/components/ae/offerings/provider-workspace-projection'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'

export const PROVIDER_WORKSPACE_EARNINGS_COPY = {
  unavailable: 'Earnings source unavailable',
  retryAction: 'Try earnings again',
} as const


export type ProviderWorkspaceEarningsSectionProps = Readonly<{
  earningsDetail?: OwnerProviderEarningsReadback
  earningsReadAt?: number
  onRefreshEarnings?: () => void
  onLoadMoreEarnings?: () => void
  earningsOpen: boolean
  earningsPending: boolean
  earningsUnavailable: boolean
  onOpenEarnings: () => void
  onCloseEarnings: () => void
  onRetryEarnings: () => void
}>

export type AeProviderWorkspaceProps = Readonly<{
  inventory: ProviderWorkspaceInventoryResult
  inventoryQuery?: OwnerInventoryQuery
  lifecycle?: Promise<ProviderWorkspaceLifecycleResult>
  connections?: Promise<ProviderWorkspaceConnectionsResult>
  publicStatus?: Promise<ProviderWorkspacePublicStatusResult>
  offboarding?: Promise<OwnerProviderOffboardingResult>
}>

export type OnboardingSaveResult =
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'error'; message: string }>

export type WorkspaceInventoryGateProps = Readonly<
  | {
      kind: 'not_found'
      onSaveProfile: (input: Readonly<{ name: string; website: string }>) => Promise<OnboardingSaveResult>
    }
  | { kind: 'conflict' }
  | {
      kind: 'unavailable'
      reason?: 'inventory_index_pending'
      refreshPending: boolean
      onRefresh: () => void
    }
>

export type ProviderWorkspaceTableChrome = Readonly<{
  inventoryFilter: string
  onFilterChange: (value: string) => void
  inventorySorting: SortingState
  onSortingChange: (sorting: SortingState) => void
  activeRowActionId: string | undefined
  onActiveRowActionIdChange: (id: string | undefined) => void
  renderList: (rows: readonly ProviderWorkspaceProjectionRow[]) => ReactNode
}>

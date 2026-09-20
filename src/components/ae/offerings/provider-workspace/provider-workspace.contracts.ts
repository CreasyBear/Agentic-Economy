import type { SortingState } from '@tanstack/react-table'
import type { ReactNode } from 'react'

import type {
  ProviderWorkspaceInventoryResult,
  ProviderWorkspaceLifecycleResult,
  ProviderWorkspaceConnectionsResult,
  ProviderWorkspacePayoutResult,
  ProviderWorkspacePublicStatusResult,
  OwnerProviderOffboardingResult,
} from '@/components/ae/offerings/provider-workspace.functions'
import type { ProviderWorkspaceProjectionRow } from '@/components/ae/offerings/provider-workspace-projection'

export type AeProviderWorkspaceProps = Readonly<{
  inventory: ProviderWorkspaceInventoryResult
  lifecycle?: Promise<ProviderWorkspaceLifecycleResult>
  connections?: Promise<ProviderWorkspaceConnectionsResult>
  payouts?: Promise<ProviderWorkspacePayoutResult>
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

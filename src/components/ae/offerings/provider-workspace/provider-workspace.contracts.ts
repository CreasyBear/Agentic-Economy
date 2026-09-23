import type { SortingState } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import type { AeTone } from '@/lib/ui/status-presentation'

import type {
  ProviderWorkspaceInventoryResult,
  ProviderWorkspaceLifecycleResult,
  ProviderWorkspaceConnectionsResult,
  ProviderWorkspacePayoutResult,
  ProviderWorkspacePublicStatusResult,
  OwnerProviderOffboardingResult,
} from '@/components/ae/offerings/provider-workspace.functions'
import type { ProviderWorkspaceProjectionRow } from '@/components/ae/offerings/provider-workspace-projection'

export const PROVIDER_WORKSPACE_EARNINGS_COPY = {
  connectionTitle: 'Provider earnings and payout readiness.',
  connectAction: 'Connect Stripe',
  connectedSentence: 'Stripe is connected for payouts.',
  disconnectedSentence: 'Connect Stripe to receive payouts.',
  unavailableSentence: 'Stripe connection status could not be loaded.',
  retryAction: 'Try connection again',
  unavailable: 'Stripe connection state unavailable',
} as const

export type ProviderWorkspacePayoutConnectionState =
  | 'not_connected'
  | 'pending'
  | 'connected'
  | 'unavailable'

export type ProviderWorkspacePayoutConnectionPresentation = Readonly<{
  state: ProviderWorkspacePayoutConnectionState
  label: string
  sentence: string
  tone: AeTone
  action?: string
}>

export type ProviderWorkspaceEarningsSectionProps = Readonly<{
  payoutConnection: ProviderWorkspacePayoutConnectionPresentation
  earningsOpen: boolean
  earningsPending: boolean
  earningsDetailAvailable: boolean
  onOpenEarnings: () => void
  onCloseEarnings: () => void
  onRetryEarnings: () => void
}>

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

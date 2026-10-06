import type { OwnerPlanSummary } from '@/modules/capability-execution/plan/owner.contracts'
import type { ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import type { UsageReconciliation } from '@/modules/money/public'
import type {
  readOwnerCallsServer,
  readOwnerSpendServer,
  readOwnerUsageServer,
} from '@/lib/server/call-history.functions'

export const ACTIVITY_TACTILE_PRESS_CLASS =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export const ACTIVITY_FILTER_CHIP_CLASS = `rounded-full ${ACTIVITY_TACTILE_PRESS_CLASS}`

export const ACTIVITY_EXPORT_FORMAT_BUTTON_CLASS =
  'min-h-touch min-w-[4.75rem] enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type ActivityLoaderResult =
  | Readonly<{
      kind: 'available'
      calls: Awaited<ReturnType<typeof readOwnerCallsServer>>
      usage: Awaited<ReturnType<typeof readOwnerUsageServer>> | Readonly<{ kind: 'unavailable'; code: 'source_unavailable' }>
      spend: Awaited<ReturnType<typeof readOwnerSpendServer>> | Readonly<{ kind: 'unavailable'; code: 'source_unavailable' }> | Readonly<{ kind: 'not_requested' }>
      plans?: readonly OwnerPlanSummary[]
      reconciliation?: UsageReconciliation
      periodStart: string
      periodStartAt: number
      periodEndAt: number
      dateRangeFilter: ActivityDateRangeFilter
      filteredAgent?: string
    }>
  | Readonly<{ kind: 'unavailable' }>

export type CallPage = Extract<ActivityLoaderResult, { kind: 'available' }>['calls']
export type CallRow = CallPage['page'][number]

export type CallPaginationState = Readonly<{
  source: CallPage
  items: readonly CallRow[]
  cursor: string | undefined
  status: 'idle' | 'loading' | 'failed'
}>

export type ActivityStatusFilter = 'all' | 'completed' | 'refused' | 'outcome_unknown'
export type ActivityDateRangeFilter = 'all' | 'month' | 'today' | '7d' | '30d'

export type ActivityBadgeView = Readonly<{
  variant: 'success' | 'neutral'
  label: string
  warning?: boolean
}>

export type ActivityCallRowView = Readonly<{
  callRef: string
  toolLabel: string
  agentShortId: string
  agentTitle: string | undefined
  durationLabel: string
  latencyMs: number | undefined
  amountLabel: string
  amountUnits: string | undefined
  stateBadge: ActivityBadgeView
  purchaseBadge: ActivityBadgeView
  purchaseLabel: string
  paymentStateLabel: string
  whenLabel: string
  createdAt: number
  receiptHref: string
  receiptAccessibleLabel: string
}>

export type ActivityMonthlySummaryView = Readonly<{
  unavailable: boolean
  callCountLabel: string
  completedLabel: string
  refusedLabel: string
  attentionLabel: string
  spendLabel: string
  spendTitle: string
  spendBasis: string
  scopeLabel: string
  windowTooLarge: boolean
  deliveredRequestLabel: string
  currentDeliveredRequestLabel: string
  unknownDeliverySupportLabel: string
  serviceUnitCoverageLabel: string
  providerUnitCards?: ReadonlyArray<{label: string; value: string}>
  providerUnitCoverageLabel?: string
}>

export type AeActivityProps = Readonly<{
  draftRef?: string
  result: ActivityLoaderResult
}>

export type ActivityUnavailableStateProps = Readonly<{
  retryPending: boolean
  onRetry: () => void
}>

export type ActivityFilterBarProps = Readonly<{
  statusFilter: ActivityStatusFilter
  onStatusFilterChange: (filter: ActivityStatusFilter) => void
  statusCounts: Readonly<Record<ActivityStatusFilter, number>>
  statusChipLabel: (filter: ActivityStatusFilter) => string
  dateRangeFilter: ActivityDateRangeFilter
  onDateRangeFilterChange: (filter: ActivityDateRangeFilter) => void
  dateChipLabel: (filter: ActivityDateRangeFilter) => string
  filteredAgentShortId: string | undefined
  onClearAgent: () => void
  datePending: boolean
  filtersActive: boolean
  onResetFilters: () => void
}>

export type ActivityCallQueueProps = Readonly<{
  returnScope?: ActivityReturnScope
  title: string
  description: string
  rows: readonly ActivityCallRowView[]
  emptyMessage: string
  attention?: boolean
}>

export type ActivityPaginationControlProps = Readonly<{
  pagination: CallPaginationState
  onLoadMore: () => Promise<void>
}>

export type ActivityMonthlySummaryProps = Readonly<{
  periodStart: string
  monthly: ActivityMonthlySummaryView
  retryPending: boolean
  onRetry: () => void
}>

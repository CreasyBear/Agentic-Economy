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
      spend: Awaited<ReturnType<typeof readOwnerSpendServer>> | Readonly<{ kind: 'unavailable'; code: 'source_unavailable' }>
      periodStart: string
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
export type ActivityDateRangeFilter = 'all' | 'today' | '7d' | '30d'

export type ActivityBadgeView = Readonly<{
  variant: 'secondary' | 'outline'
  label: string
  warning?: boolean
}>

export type ActivityCallRowView = Readonly<{
  callRef: string
  toolLabel: string
  agentShortId: string
  agentTitle: string | undefined
  durationLabel: string
  amountLabel: string
  stateBadge: ActivityBadgeView
  purchaseBadge: ActivityBadgeView
  purchaseLabel: string
  paymentStateLabel: string
  whenLabel: string
  receiptHref: string
  receiptAccessibleLabel: string
}>

export type ActivityMonthlySummaryView = Readonly<{
  unavailable: boolean
  callCountLabel: string
  completedLabel: string
  attentionLabel: string
  spendLabel: string
}>

export type AeActivityProps = Readonly<{
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
  filtersActive: boolean
  onResetFilters: () => void
}>

export type ActivityCallQueueProps = Readonly<{
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

import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import {
  projectCallSummaryPurchaseStatus,
  type BuyerCallSummaryFacts,
} from '@/modules/capability-execution/call-receipt-view'
import { readOwnerCallsServer } from '@/lib/server/call-history.functions'
import { calculateAudGstSplit, formatDisplayAmount } from '@/modules/money/public'
import { toast } from '@/lib/ui/toast'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import {
  downloadCsv,
  downloadJson,
  EXPORT_ERROR_IMPACT,
  EXPORT_ERROR_WHAT,
  formatExportSuccessToast,
  formatExportingPreview,
  generateCallsCsv,
  toExportDocument,
} from '@/lib/export/csv-export'

import type {
  ActivityBadgeView,
  ActivityCallRowView,
  ActivityDateRangeFilter,
  ActivityLoaderResult,
  ActivityMonthlySummaryView,
  ActivityStatusFilter,
  CallPage,
  CallPaginationState,
  CallRow,
} from './activity.contracts'

const AUD_INCLUSIVE_GST_BPS = 1_000

function unitsToAudDollarsFixed(units: string): string {
  if (!units) return '0.00'
  return (Number(units) / 1_000_000).toFixed(2)
}

function formatPaymentStateLabel(
  paymentState: BuyerCallSummaryFacts['paymentState'],
): string {
  switch (paymentState) {
    case 'settled':
      return 'Settled'
    case 'released':
      return 'Released'
    case 'unknown':
      return 'Not confirmed'
    case 'not_applicable':
      return 'Not applicable'
    default: {
      const _exhaustive: never = paymentState
      return _exhaustive
    }
  }
}

function callStateStatusBadge(state: BuyerCallSummaryFacts['state']): ActivityBadgeView {
  switch (state) {
    case 'completed':
      return { variant: 'secondary', label: 'Completed' }
    case 'refused':
      return { variant: 'outline', label: 'Refused' }
    case 'outcome_unknown':
      return { variant: 'outline', label: 'Needs Attention', warning: true }
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

function purchaseStatusBadge(
  purchase: ReturnType<typeof projectCallSummaryPurchaseStatus>,
): ActivityBadgeView {
  switch (purchase.kind) {
    case 'delivered':
      return { variant: 'secondary', label: purchase.label }
    case 'refunded':
    case 'failed':
      return { variant: 'outline', label: purchase.label }
    case 'uncertain':
      return { variant: 'outline', label: 'Needs review', warning: true }
    case 'pending':
      return { variant: 'outline', label: purchase.label, warning: true }
    default: {
      const _exhaustive: never = purchase.kind
      return _exhaustive
    }
  }
}

function initialCallPaginationState(source: CallPage): CallPaginationState {
  return {
    source,
    items: source.page,
    cursor: source.isDone ? undefined : source.continueCursor,
    status: 'idle',
  }
}

function useCallPagination(initial: CallPage, principalRef?: string) {
  const [state, setState] = useState(() => initialCallPaginationState(initial))

  async function loadNextPage() {
    if (state.cursor === undefined || state.status === 'loading') return
    const source = state.source
    const cursor = state.cursor
    setState((current) => current.source === source && current.cursor === cursor
      ? { ...current, status: 'loading' }
      : current)
    try {
      const next = await readOwnerCallsServer({ data: { cursor, ...(principalRef ? { principalRef } : {}) } })
      setState((current) => current.source === source && current.cursor === cursor
        ? {
            source,
            items: [...current.items, ...next.page],
            cursor: next.isDone ? undefined : next.continueCursor,
            status: 'idle',
          }
        : current)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setState((current) => current.source === source && current.cursor === cursor
        ? { ...current, status: 'failed' }
        : current)
    }
  }

  return { state, loadNextPage }
}

function buildActivityExportRows(items: readonly CallRow[]) {
  return items.map((item) => {
    const grossUnits = item.audAmountUnits ?? '0'
    const split = calculateAudGstSplit(grossUnits, AUD_INCLUSIVE_GST_BPS)
    return {
      date: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      callRef: item.callRef,
      toolName: item.toolLabel,
      provider: 'Agentic Economy Seller',
      agentName: item.principalRef ?? 'Unspecified Agent',
      costAud: unitsToAudDollarsFixed(grossUnits),
      gstAud: split === undefined ? '0.00' : unitsToAudDollarsFixed(split.gstUnits),
      netAud: split === undefined ? '0.00' : unitsToAudDollarsFixed(split.netUnits),
      status: projectCallSummaryPurchaseStatus(item).label,
    }
  })
}

function activityDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '—'
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} s`
  if (milliseconds < 3_600_000) return `${Math.floor(milliseconds / 60_000)} min ${Math.floor(milliseconds / 1_000) % 60} s`
  return `${Math.floor(milliseconds / 3_600_000)} hr ${Math.floor(milliseconds / 60_000) % 60} min`
}

function projectCallRow(item: CallRow, reviewMode: boolean): ActivityCallRowView {
  const purchase = projectCallSummaryPurchaseStatus(item)
  return {
    callRef: item.callRef,
    toolLabel: item.toolLabel,
    agentShortId: item.principalRef ? item.principalRef.split(':').pop() ?? '—' : '—',
    agentTitle: item.principalRef,
    durationLabel: activityDuration(item.latencyMs),
    amountLabel: item.paymentState === 'released' ? 'No charge'
      : item.paymentState === 'unknown' ? 'Not confirmed' : item.audAmountUnits === undefined
      ? '—'
      : formatDisplayAmount({ currency: 'AUD', exponent: 6, units: item.audAmountUnits }),
    stateBadge: callStateStatusBadge(item.state),
    purchaseBadge: purchaseStatusBadge(purchase),
    purchaseLabel: purchase.label,
    paymentStateLabel: formatPaymentStateLabel(item.paymentState),
    whenLabel: `${formatUtcTimestamp(item.createdAt)} UTC`,
    receiptHref: `/calls/${encodeURIComponent(item.callRef)}`,
    receiptAccessibleLabel: `${reviewMode ? 'Review' : 'View receipt for'} ${item.toolLabel}`,
  }
}

export type UseAeActivityInput = Readonly<{
  initial: CallPage
  usage: Extract<ActivityLoaderResult, { kind: 'available' }>['usage']
  spend: Extract<ActivityLoaderResult, { kind: 'available' }>['spend']
  periodStart: string
  filteredAgent?: string
}>

export function useAeActivity({
  initial,
  usage,
  spend,
  periodStart,
  filteredAgent,
}: UseAeActivityInput) {
  const router = useRouter()
  const [summaryRetryPending, setSummaryRetryPending] = useState(false)
  const { state: pagination, loadNextPage } = useCallPagination(initial, filteredAgent)
  const [statusFilter, setStatusFilter] = useState<ActivityStatusFilter>('all')
  const [dateRangeFilter, setDateRangeFilter] = useState<ActivityDateRangeFilter>('all')
  const [nowMs] = useState(() => Date.now())

  const dateFilteredItems = useMemo(() => {
    if (dateRangeFilter === 'all') return pagination.items
    const cutoff = dateRangeFilter === 'today'
      ? nowMs - 24 * 60 * 60 * 1000
      : dateRangeFilter === '7d'
        ? nowMs - 7 * 24 * 60 * 60 * 1000
        : nowMs - 30 * 24 * 60 * 60 * 1000
    return pagination.items.filter((item) => item.createdAt >= cutoff)
  }, [pagination.items, dateRangeFilter, nowMs])

  const statusCounts = useMemo(() => ({
    all: dateFilteredItems.length,
    completed: dateFilteredItems.filter((item) => item.state === 'completed').length,
    refused: dateFilteredItems.filter((item) => item.state === 'refused').length,
    outcome_unknown: dateFilteredItems.filter((item) => item.state === 'outcome_unknown').length,
  }), [dateFilteredItems])

  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') return dateFilteredItems
    return dateFilteredItems.filter((item) => item.state === statusFilter)
  }, [dateFilteredItems, statusFilter])

  const filtersActive = statusFilter !== 'all'
    || dateRangeFilter !== 'all'
    || filteredAgent !== undefined

  const statusChipLabel = (s: ActivityStatusFilter) => {
    if (s === 'all') return 'All'
    if (s === 'completed') return 'Completed'
    if (s === 'refused') return 'Refused'
    return 'Needs Attention'
  }

  const dateChipLabel = (d: ActivityDateRangeFilter) => {
    if (d === 'all') return 'All time'
    if (d === 'today') return 'Today'
    return d
  }

  const filteredAgentShortId = filteredAgent?.split(':').pop()

  const attentionItems = useMemo(
    () => filteredItems.filter((item) => projectCallSummaryPurchaseStatus(item).attention),
    [filteredItems],
  )
  const recentItems = useMemo(
    () => filteredItems.filter((item) => !projectCallSummaryPurchaseStatus(item).attention),
    [filteredItems],
  )

  const attentionRows = useMemo(
    () => attentionItems.map((item) => projectCallRow(item, true)),
    [attentionItems],
  )
  const recentRows = useMemo(
    () => recentItems.map((item) => projectCallRow(item, false)),
    [recentItems],
  )

  const exportPreviewLabel = formatExportingPreview(filteredItems.length, {
    ...(pagination.cursor === undefined ? {} : { loadedOnly: true }),
  })

  const monthly: ActivityMonthlySummaryView = {
    unavailable: usage.kind !== 'available' || spend.kind !== 'available',
    callCountLabel: usage.kind === 'available' ? usage.callCountUnits : '—',
    completedLabel: usage.kind === 'available' ? usage.completedCountUnits : '—',
    attentionLabel: usage.kind === 'available' ? usage.outcomeUnknownCountUnits : '—',
    spendLabel: spend.kind === 'available'
      ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units: spend.spendUnits })
      : '—',
  }

  function resetFilters() {
    setStatusFilter('all')
    setDateRangeFilter('all')
    if (filteredAgent !== undefined) {
      void router.navigate({ to: '/activity' })
    }
  }

  function exportCsv() {
    try {
      const exportRows = buildActivityExportRows(filteredItems)
      const count = exportRows.length
      const csv = generateCallsCsv(exportRows)
      downloadCsv(`activity-calls-${new Date().toISOString().slice(0, 10)}.csv`, csv)
      toast.success(formatExportSuccessToast(count, 'CSV'))
    } catch (cause) {
      void cause
      toast.error(EXPORT_ERROR_WHAT, { description: EXPORT_ERROR_IMPACT })
    }
  }

  function exportJson() {
    try {
      const exportRows = buildActivityExportRows(filteredItems)
      const count = exportRows.length
      const document = toExportDocument('activity-calls', exportRows)
      downloadJson(`activity-calls-${new Date().toISOString().slice(0, 10)}.json`, document)
      toast.success(formatExportSuccessToast(count, 'JSON'))
    } catch (cause) {
      void cause
      toast.error(EXPORT_ERROR_WHAT, { description: EXPORT_ERROR_IMPACT })
    }
  }

  function retrySummaries() {
    if (summaryRetryPending) return
    setSummaryRetryPending(true)
    void router.invalidate()
      .catch((cause) => captureClientExceptionOnClient(cause))
      .finally(() => setSummaryRetryPending(false))
  }

  const attentionDescription = pagination.cursor === undefined
    ? 'Open a Call to check its latest result and payment, or get help. Do not start a replacement while it needs review.'
    : 'Calls needing confirmation in the loaded Account history. Load more to check older Calls.'

  const attentionEmptyMessage = pagination.cursor === undefined
    ? 'No Calls need attention.'
    : 'No loaded Calls need attention.'

  return {
    pagination,
    loadNextPage,
    statusFilter,
    setStatusFilter,
    dateRangeFilter,
    setDateRangeFilter,
    statusCounts,
    statusChipLabel,
    dateChipLabel,
    filteredAgentShortId,
    filtersActive,
    resetFilters,
    exportPreviewLabel,
    exportDisabled: filteredItems.length === 0,
    exportCsv,
    exportJson,
    showFilterBar: pagination.items.length > 0,
    showEmptyNoCalls: pagination.items.length === 0 && pagination.cursor === undefined,
    showEmptyNoMatch: filteredItems.length === 0 && !(pagination.items.length === 0 && pagination.cursor === undefined),
    showQueues: filteredItems.length > 0,
    attentionRows,
    recentRows,
    attentionDescription,
    attentionEmptyMessage,
    usage,
    spend,
    periodStart,
    monthly,
    summaryRetryPending,
    retrySummaries,
  }
}

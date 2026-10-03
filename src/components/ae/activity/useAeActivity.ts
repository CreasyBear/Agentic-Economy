import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import {
  projectCallSummaryPurchaseStatus,
  type BuyerCallSummaryFacts,
} from '@/modules/capability-execution/call-receipt-view'
import { readOwnerCallsServer } from '@/lib/server/call-history.functions'
import { formatDisplayAmount, formatExactAmount } from '@/modules/money/public'
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

function formatAudExportUnits(units: string): string {
  const exact = formatExactAmount({ currency: 'AUD', exponent: 6, units })
  if (exact === undefined) throw new RangeError('Activity export requires valid exact AUD units')
  return exact
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
      return { variant: 'outline', label: 'Outcome unknown', warning: true }
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

function useCallPagination(initial: CallPage, periodStartAt: number, periodEndAt: number, principalRef?: string) {
  const [state, setState] = useState(() => initialCallPaginationState(initial))

  async function loadNextPage() {
    if (state.cursor === undefined || state.status === 'loading') return
    const source = state.source
    const cursor = state.cursor
    setState((current) => current.source === source && current.cursor === cursor
      ? { ...current, status: 'loading' }
      : current)
    try {
      const next = await readOwnerCallsServer({ data: { cursor, periodStartAt, periodEndAt, ...(principalRef ? { principalRef } : {}) } })
      setState((current) => current.source === source && current.cursor === cursor
        ? {
            source,
            items: [...new Map([...current.items, ...next.page].map((item) => [item.callRef, item])).values()],
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

function hasNoRecordedCharge(item: CallRow): boolean {
  return item.paymentState === 'released'
    || (item.paymentState === 'not_applicable' && item.state === 'refused' && item.deliveryState === 'not_delivered')
}

function buildActivityExportRows(items: readonly CallRow[]) {
  return items.map((item) => {
    const purchase = projectCallSummaryPurchaseStatus(item)
    const charged = item.paymentState === 'settled' && item.audAmountUnits !== undefined
    const notCharged = hasNoRecordedCharge(item)
    const grossUnits = charged ? item.audAmountUnits : notCharged ? '0' : undefined
    if (grossUnits !== undefined && !/^(?:0|[1-9]\d*)$/u.test(grossUnits)) {
      throw new RangeError('Activity export requires valid booked AUD units')
    }
    return {
      date: item.createdAt ? new Date(item.createdAt).toISOString() : '',
      callRef: item.callRef,
      toolName: item.toolLabel,
      provider: item.providerRef,
      agentName: item.principalRef ?? 'Unspecified Agent',
      costAud: grossUnits === undefined
        ? item.paymentState === 'settled' ? 'Amount unknown' : 'Not confirmed'
        : formatAudExportUnits(grossUnits),
      status: purchase.label,
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
    latencyMs: Number.isFinite(item.latencyMs) && item.latencyMs > 0 ? item.latencyMs : undefined,
    amountUnits: hasNoRecordedCharge(item) ? '0'
      : item.paymentState === 'settled' && item.audAmountUnits !== undefined
        && /^(?:0|[1-9]\d*)$/u.test(item.audAmountUnits) ? item.audAmountUnits : undefined,
    amountLabel: hasNoRecordedCharge(item) ? 'No charge'
      : item.paymentState !== 'settled' ? 'Not confirmed' : item.audAmountUnits === undefined
        ? 'Amount unknown'
        : formatDisplayAmount({ currency: 'AUD', exponent: 6, units: item.audAmountUnits }),
    stateBadge: callStateStatusBadge(item.state),
    purchaseBadge: purchaseStatusBadge(purchase),
    purchaseLabel: purchase.label,
    paymentStateLabel: formatPaymentStateLabel(item.paymentState),
    whenLabel: `${formatUtcTimestamp(item.createdAt)} UTC`,
    createdAt: item.createdAt,
    receiptHref: `/calls/${encodeURIComponent(item.callRef)}`,
    receiptAccessibleLabel: `${reviewMode ? 'Review' : 'View receipt for'} ${item.toolLabel}`,
  }
}

export type UseAeActivityInput = Readonly<{
  initial: CallPage
  usage: Extract<ActivityLoaderResult, { kind: 'available' }>['usage']
  spend: Extract<ActivityLoaderResult, { kind: 'available' }>['spend']
  periodStart: string
  periodStartAt: number
  periodEndAt: number
  dateRangeFilter: ActivityDateRangeFilter
  statusFilter: ActivityStatusFilter
  setStatusFilter: (filter: ActivityStatusFilter) => void
  filteredAgent?: string
}>

export function useAeActivity({
  initial,
  usage,
  spend,
  periodStart,
  periodStartAt,
  periodEndAt,
  dateRangeFilter,
  statusFilter,
  setStatusFilter,
  filteredAgent,
}: UseAeActivityInput) {
  const router = useRouter()
  const [summaryRetryPending, setSummaryRetryPending] = useState(false)
  const { state: pagination, loadNextPage } = useCallPagination(initial, periodStartAt, periodEndAt, filteredAgent)
  const [datePending, setDatePending] = useState(false)
  const dateFilteredItems = pagination.items

  function navigateScope(range: ActivityDateRangeFilter, agent: string | undefined) {
    if (datePending) return
    setDatePending(true)
    void Promise.resolve(router.navigate({ to: '/activity', search: { range, ...(agent === undefined ? {} : { agent }) } }))
      .catch((cause) => {
        captureClientExceptionOnClient(cause)
        toast.error('Could not change the Call filters.', { description: 'The previous period is still shown. Try selecting the period again.' })
      })
      .finally(() => setDatePending(false))
  }
  const setDateRangeFilter = (range: ActivityDateRangeFilter) => navigateScope(range, filteredAgent)
  const clearAgent = () => navigateScope(dateRangeFilter, undefined)

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
    || dateRangeFilter !== '30d'
    || filteredAgent !== undefined

  const statusChipLabel = (s: ActivityStatusFilter) => {
    if (s === 'all') return 'All'
    if (s === 'completed') return 'Completed'
    if (s === 'refused') return 'Refused'
    return 'Outcome unknown'
  }

  const dateChipLabel = (d: ActivityDateRangeFilter) => {
    if (d === 'all') return 'All time'
    if (d === 'month') return 'This month (UTC)'
    if (d === 'today') return 'Today (UTC)'
    if (d === '7d') return 'Last 7 days'
    return 'Last 30 days'
  }

  const filteredAgentShortId = filteredAgent

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
    windowTooLarge: (usage.kind === 'unavailable' && usage.code === 'usage_window_too_large')
      || (spend.kind === 'unavailable' && spend.code === 'formance_spend_window_too_large'),
    unavailable: usage.kind === 'unavailable' || (filteredAgent === undefined
      && spend.kind !== 'available' && spend.kind !== 'empty'),
    callCountLabel: usage.kind === 'available' ? usage.callCountUnits : usage.kind === 'empty' ? '0' : '—',
    completedLabel: usage.kind === 'available' ? usage.completedCountUnits : usage.kind === 'empty' ? '0' : '—',
    refusedLabel: usage.kind === 'available'
      ? (BigInt(usage.callCountUnits) - BigInt(usage.completedCountUnits) - BigInt(usage.outcomeUnknownCountUnits)).toString()
      : usage.kind === 'empty' ? '0' : '—',
    attentionLabel: usage.kind === 'available' ? usage.outcomeUnknownCountUnits : usage.kind === 'empty' ? '0' : '—',
    spendTitle: filteredAgent === undefined ? 'Gross settled charges' : 'Agent settled charges',
    spendLabel: filteredAgent === undefined
      ? spend.kind === 'available' ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units: spend.spendUnits })
        : spend.kind === 'empty' ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units: '0' }) : '—'
      : usage.kind === 'empty' ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units: '0' })
        : usage.kind === 'available' && usage.amountCoverage === 'complete' && usage.settledSpendUnits !== undefined
          ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units: usage.settledSpendUnits })
          : usage.kind === 'available' ? 'Amount coverage incomplete' : '—',
    scopeLabel: filteredAgent === undefined ? 'All Agents in this Account' : `Agent ${filteredAgent}`,
    spendBasis: filteredAgent === undefined
      ? 'Gross charges use ledger settlement dates in this period. Refunds are recorded separately and are not deducted here.'
      : 'Agent charges use current Call payment records for Calls created in this period. They are not an account ledger balance or a refund total.',
  }

  function resetFilters() {
    setStatusFilter('all')
    if (dateRangeFilter !== '30d' || filteredAgent !== undefined) navigateScope('30d', undefined)
  }

  function exportCsv() {
    try {
      const exportRows = buildActivityExportRows(filteredItems)
      const count = exportRows.length
      const csv = generateCallsCsv(exportRows)
      downloadCsv(`call-usage-${new Date().toISOString().slice(0, 10)}.csv`, csv)
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
      const document = { ...toExportDocument('call-usage', exportRows), periodStartAt, periodEndAt,
        coverage: pagination.cursor === undefined ? 'complete' : 'loaded_rows', statusFilter,
        ...(filteredAgent === undefined ? {} : { principalRef: filteredAgent }) }
      downloadJson(`call-usage-${new Date().toISOString().slice(0, 10)}.json`, document)
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
    clearAgent,
    datePending,
    filtersActive,
    resetFilters,
    exportPreviewLabel,
    exportDisabled: filteredItems.length === 0,
    exportCsv,
    exportJson,
    showFilterBar: true,
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

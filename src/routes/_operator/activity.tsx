import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Activity, Download } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  projectCallSummaryPurchaseStatus,
  type BuyerCallSummaryFacts,
} from '@/modules/capability-execution/call-receipt-view'
import {
  readOwnerCallsServer,
  readOwnerSpendServer,
  readOwnerUsageServer,
} from '@/lib/server/call-history.functions'
import { calculateAudGstSplit, formatDisplayAmount } from '@/modules/money/public'
import { toast } from '@/lib/ui/toast'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
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
import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'

const AUD_INCLUSIVE_GST_BPS = 1_000

const TACTILE_PRESS_CLASS =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const EXPORT_FORMAT_BUTTON_CLASS =
  'min-h-touch min-w-[4.75rem] enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

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
      return 'Unknown'
    case 'not_applicable':
      return 'Not applicable'
    default: {
      const _exhaustive: never = paymentState
      return _exhaustive
    }
  }
}

function callStateStatusBadge(state: BuyerCallSummaryFacts['state']) {
  switch (state) {
    case 'completed':
      return <Badge variant="secondary">Completed</Badge>
    case 'refused':
      return <Badge variant="outline">Refused</Badge>
    case 'outcome_unknown':
      return (
        <Badge variant="outline" className="border-warning/50 text-warning">
          Needs Attention
        </Badge>
      )
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

function purchaseStatusBadge(purchase: ReturnType<typeof projectCallSummaryPurchaseStatus>) {
  switch (purchase.kind) {
    case 'delivered':
      return <Badge variant="secondary">{purchase.label}</Badge>
    case 'refunded':
    case 'failed':
      return <Badge variant="outline">{purchase.label}</Badge>
    case 'uncertain':
    case 'pending':
      return (
        <Badge variant="outline" className="border-warning/50 text-warning">
          {purchase.label}
        </Badge>
      )
    default: {
      const _exhaustive: never = purchase.kind
      return _exhaustive
    }
  }
}

export const Route = createFileRoute('/_operator/activity')({
  staticData: {
    nav: {
      label: 'Calls',
      header: { order: 3 },
      footer: { column: 'Market', order: 3 },
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 0,
        icon: Activity,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 10,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): { agent?: string } => {
    const agent = typeof search.agent === 'string' && search.agent.trim().length > 0
      ? search.agent.trim()
      : undefined
    return { ...(agent === undefined ? {} : { agent }) }
  },
  loaderDeps: ({ search: { agent } }) => ({ agent }),
  loader: async (ctx): Promise<ActivityLoaderResult> => {
    const agent = ctx?.deps?.agent
    const periodStart = new Date().toISOString().slice(0, 7)
    const period = agent
      ? { dimensionKind: 'agent' as const, dimensionRef: agent, periodKind: 'month' as const, periodStart }
      : { dimensionKind: 'account' as const, periodKind: 'month' as const, periodStart }
    const [calls, usage, spend] = await Promise.allSettled([
      readOwnerCallsServer({ data: agent ? { principalRef: agent } : {} }),
      readOwnerUsageServer({ data: period }),
      readOwnerSpendServer({ data: period }),
    ])
    for (const result of [calls, usage, spend]) {
      if (result.status === 'rejected') captureRouteException(result.reason, { 'ae.surface': 'operator_activity_loader' })
    }
    if (calls.status === 'rejected') return { kind: 'unavailable' }
    return {
      kind: 'available',
      calls: calls.value,
      usage: usage.status === 'fulfilled' ? usage.value : { kind: 'unavailable', code: 'source_unavailable' },
      spend: spend.status === 'fulfilled' ? spend.value : { kind: 'unavailable', code: 'source_unavailable' },
      periodStart,
      ...(agent === undefined ? {} : { filteredAgent: agent }),
    }
  },
  head: () => ({ meta: [
    { title: 'Calls | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: ActivityRoute,
})

function ActivityRoute() {
  const result = Route.useLoaderData()
  return <ActivityPage result={result} />
}

export function ActivityPage({ result }: Readonly<{ result: ActivityLoaderResult }>) {
  const router = useRouter()
  const [retryPending, setRetryPending] = useState(false)
  if (result.kind === 'unavailable') {
    return (
      <AeOperatorPage
        operatorRole="owner"
        title="Calls"
        description="Review Calls that need attention, then inspect recent outcomes and receipts."
        currentPath="/activity"
      >
        <AeDegradedState
          title="Calls are temporarily unavailable"
          description="No call outcome is being inferred. Try loading the authoritative activity again."
          action={(
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={retryPending}
              aria-busy={retryPending || undefined}
              onClick={() => {
                if (retryPending) return
                setRetryPending(true)
                void router.invalidate()
                  .catch((cause) => captureClientExceptionOnClient(cause))
                  .finally(() => setRetryPending(false))
              }}
            >
              {retryPending ? 'Trying again…' : 'Try again'}
            </Button>
          )}
        />
      </AeOperatorPage>
    )
  }
  return <ActivityAvailable
    key={`${canonicalDigest(result.calls)}:${result.filteredAgent ?? 'all'}`}
    initial={result.calls}
    usage={result.usage}
    spend={result.spend}
    periodStart={result.periodStart}
    {...(result.filteredAgent === undefined ? {} : { filteredAgent: result.filteredAgent })}
  />
}

type CallPage = Extract<ActivityLoaderResult, { kind: 'available' }>['calls']
type CallRow = CallPage['page'][number]
type CallPaginationState = Readonly<{
  source: CallPage
  items: readonly CallRow[]
  cursor: string | undefined
  status: 'idle' | 'loading' | 'failed'
}>

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

function ActivityAvailable({
  initial,
  usage,
  spend,
  periodStart,
  filteredAgent,
}: Readonly<{
  initial: Extract<ActivityLoaderResult, { kind: 'available' }>['calls']
  usage: Extract<ActivityLoaderResult, { kind: 'available' }>['usage']
  spend: Extract<ActivityLoaderResult, { kind: 'available' }>['spend']
  periodStart: string
  filteredAgent?: string
}>) {
  const router = useRouter()
  const [summaryRetryPending, setSummaryRetryPending] = useState(false)
  const { state: pagination, loadNextPage } = useCallPagination(initial, filteredAgent)
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'refused' | 'outcome_unknown'>('all')
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | '7d' | '30d'>('all')
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

  const statusChipLabel = (s: 'all' | 'completed' | 'refused' | 'outcome_unknown') => {
    if (s === 'all') return 'All'
    if (s === 'completed') return 'Completed'
    if (s === 'refused') return 'Refused'
    return 'Needs Attention'
  }

  const dateChipLabel = (d: 'all' | 'today' | '7d' | '30d') => {
    if (d === 'all') return 'All time'
    if (d === 'today') return 'Today'
    return d
  }

  const filteredAgentShortId = filteredAgent?.split(':').pop()

  const attention = filteredItems.filter((item) => projectCallSummaryPurchaseStatus(item).attention)
  const recent = filteredItems.filter((item) => !projectCallSummaryPurchaseStatus(item).attention)
  const columns = useMemo<ColumnDef<CallRow, unknown>[]>(
    () => [
      {
        id: 'task',
        accessorFn: (item) => item.toolLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Task" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.toolLabel}
          </span>
        ),
      },
      {
        id: 'agent',
        accessorFn: (item) => item.principalRef,
        header: ({ column }) => <AeOperatorSortableHeader label="Caller Agent" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px] block" title={row.original.principalRef}>
            {row.original.principalRef ? row.original.principalRef.split(':').pop() : '—'}
          </span>
        ),
      },
      {
        id: 'duration',
        accessorFn: (item) => item.latencyMs,
        header: ({ column }) => <AeOperatorSortableHeader label="Duration" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.latencyMs > 0 ? `${row.original.latencyMs}ms` : '—'}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorFn: (item) => item.audAmountUnits ?? '',
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {row.original.audAmountUnits === undefined
              ? '—'
              : formatDisplayAmount({ currency: 'AUD', exponent: 6, units: row.original.audAmountUnits })}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (item) => item.state,
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => callStateStatusBadge(row.original.state),
      },
      {
        id: 'outcome',
        accessorFn: (item) => projectCallSummaryPurchaseStatus(item).label,
        header: ({ column }) => <AeOperatorSortableHeader label="Purchase status" column={column} />,
        cell: ({ row }) => {
          const purchase = projectCallSummaryPurchaseStatus(row.original)
          return (
            <div className="grid gap-1">
              {purchaseStatusBadge(purchase)}
              <div className="text-xs text-muted-foreground">
                Payment: {formatPaymentStateLabel(row.original.paymentState)}
              </div>
            </div>
          )
        },
      },
      {
        id: 'when',
        accessorKey: 'createdAt',
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatUtcTimestamp(row.original.createdAt)} UTC
          </time>
        ),
      },
    ],
    [],
  )

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Calls"
      description="Review Calls that need attention, then inspect recent outcomes and receipts."
      currentPath="/activity"
    >
      <div className="grid gap-section">
        {pagination.items.length > 0 ? (
          <div className="flex min-h-[3rem] flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <div className="flex items-center gap-1">
                  {(['all', 'completed', 'refused', 'outcome_unknown'] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={statusFilter === s ? 'secondary' : 'ghost'}
                      size="sm"
                      className={`min-h-9 text-xs sm:min-h-8 ${TACTILE_PRESS_CLASS}`}
                      aria-pressed={statusFilter === s}
                      onClick={() => setStatusFilter(s)}
                    >
                      {statusChipLabel(s)}
                      {' '}
                      <span className="font-mono tabular-nums">{statusCounts[s]}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Date:</span>
                <div className="flex items-center gap-1">
                  {(['all', 'today', '7d', '30d'] as const).map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant={dateRangeFilter === d ? 'secondary' : 'ghost'}
                      size="sm"
                      className={`min-h-9 text-xs sm:min-h-8 ${TACTILE_PRESS_CLASS}`}
                      aria-pressed={dateRangeFilter === d}
                      onClick={() => setDateRangeFilter(d)}
                    >
                      {dateChipLabel(d)}
                    </Button>
                  ))}
                </div>
              </div>

              {filteredAgentShortId ? (
                <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
                  <span className="text-muted-foreground">
                    Agent · <span className="font-mono text-foreground">{filteredAgentShortId}</span>
                  </span>
                  <Link
                    to="/activity"
                    aria-label="Clear agent filter"
                    className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), `h-6 px-1.5 text-xs ${TACTILE_PRESS_CLASS}`)}
                  >
                    ×
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filtersActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`min-h-9 text-xs text-muted-foreground sm:min-h-8 ${TACTILE_PRESS_CLASS}`}
                  onClick={() => {
                    setStatusFilter('all')
                    setDateRangeFilter('all')
                    if (filteredAgent !== undefined) {
                      void router.navigate({ to: '/activity' })
                    }
                  }}
                >
                  Reset filters
                </Button>
              ) : null}

              <span className="min-w-[12rem] text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {formatExportingPreview(filteredItems.length, {
                    ...(pagination.cursor === undefined ? {} : { loadedOnly: true }),
                  })}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 text-xs ${EXPORT_FORMAT_BUTTON_CLASS}`}
                disabled={filteredItems.length === 0}
                onClick={() => {
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
                }}
              >
                <Download className="size-3.5 shrink-0" aria-hidden="true" />
                CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 text-xs ${EXPORT_FORMAT_BUTTON_CLASS}`}
                disabled={filteredItems.length === 0}
                onClick={() => {
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
                }}
              >
                <Download className="size-3.5 shrink-0" aria-hidden="true" />
                JSON
              </Button>
            </div>
          </div>
        ) : null}
        {pagination.items.length === 0 && pagination.cursor === undefined ? (
          <AeEmptyState
            title="No Calls yet"
            description="Find a Tool and complete one Call. Its task, outcome, amount, and receipt will appear here."
            action={<Link to="/owner/market" className={cn(buttonVariants(), 'min-h-touch')}>Find Tools</Link>}
          />
        ) : filteredItems.length === 0 ? (
          <AeEmptyState
            title="No calls match these filters"
            description="No calls match the current filter criteria."
          />
        ) : (
          <>
            <CallQueue
              title="Needs attention"
              description={pagination.cursor === undefined
                ? 'Calls whose outcome still needs confirmation.'
                : 'Calls needing confirmation in the loaded Account history. Load more to check older Calls.'}
              rows={attention}
              emptyMessage={pagination.cursor === undefined ? 'No Calls need attention.' : 'No loaded Calls need attention.'}
              columns={columns}
              attention
            />
            <CallQueue
              title="Recent Calls"
              description="Completed and refused Calls, separate from work that still needs a decision."
              rows={recent}
              emptyMessage="No routine Calls in the loaded history."
              columns={columns}
            />
            <CallPaginationControl pagination={pagination} onLoadMore={loadNextPage} />
          </>
        )}
        <MonthlyCallSummary
          usage={usage}
          spend={spend}
          periodStart={periodStart}
          retryPending={summaryRetryPending}
          onRetry={() => {
            if (summaryRetryPending) return
            setSummaryRetryPending(true)
            void router.invalidate()
              .catch((cause) => captureClientExceptionOnClient(cause))
              .finally(() => setSummaryRetryPending(false))
          }}
        />
      </div>
    </AeOperatorPage>
  )
}

function CallQueue({
  title,
  description,
  rows,
  emptyMessage,
  columns,
  attention = false,
}: Readonly<{
  title: string
  description: string
  rows: readonly CallRow[]
  emptyMessage: string
  columns: ColumnDef<CallRow, unknown>[]
  attention?: boolean
}>) {
  return (
    <AeSection title={title} description={description}>
      {rows.length === 0 ? (
        <AeTableEmptyState
          title={attention ? 'No calls need attention' : 'No calls in history'}
          description={emptyMessage}
        />
      ) : (
        <AeRecordTable
          columns={columns}
          data={rows}
          caption={title}
          countLabel={attention ? 'Calls needing attention' : 'recent Calls'}
          filterPlaceholder={attention ? 'Filter attention queue…' : 'Filter recent Calls…'}
          hideFilter={rows.length <= 1}
          getRowId={(item) => item.callRef}
          rowAction={{
            kind: 'link',
            label: attention ? 'Review' : 'View receipt',
            getHref: (item) => `/calls/${encodeURIComponent(item.callRef)}`,
            getAccessibleLabel: (item) => `${attention ? 'Review' : 'View receipt for'} ${item.toolLabel}`,
          }}
        />
      )}
    </AeSection>
  )
}

function CallPaginationControl({
  pagination,
  onLoadMore,
}: Readonly<{ pagination: CallPaginationState; onLoadMore: () => Promise<void> }>) {
  if (pagination.cursor === undefined) return null
  return (
    <div className="flex flex-col items-center gap-intra border-t border-border pt-related">
      {pagination.status === 'failed' ? (
        <Alert>
          <AlertTitle>Could not load older calls.</AlertTitle>
          <AlertDescription>
            A$0.00 affected — your account balance is unchanged. Check your connection and try loading more again.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className={`min-h-touch ${TACTILE_PRESS_CLASS}`}
        disabled={pagination.status === 'loading'}
        aria-busy={pagination.status === 'loading' || undefined}
        onClick={() => { void onLoadMore() }}
      >
        {pagination.status === 'loading' ? 'Loading…' : pagination.status === 'failed' ? 'Try loading more again' : 'Load more'}
      </Button>
    </div>
  )
}

function MonthlyCallSummary({
  usage,
  spend,
  periodStart,
  retryPending,
  onRetry,
}: Readonly<{
  usage: Extract<ActivityLoaderResult, { kind: 'available' }>['usage']
  spend: Extract<ActivityLoaderResult, { kind: 'available' }>['spend']
  periodStart: string
  retryPending: boolean
  onRetry: () => void
}>) {
  const unavailable = usage.kind !== 'available' || spend.kind !== 'available'
  return (
    <AeSection title="This month" description={`Account-level Call and spend summary for ${periodStart}.`}>
      {unavailable ? (
        <Alert>
          <AlertTitle>Some summaries are unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Call history is still on this page. A$0.00 affected — your account balance is unchanged.
              Check your connection and try refreshing summaries again.
            </span>
            <Button
              type="button"
              variant="secondary"
              className={TACTILE_PRESS_CLASS}
              disabled={retryPending}
              onClick={onRetry}
            >
              {retryPending ? 'Refreshing…' : 'Refresh summaries'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-related sm:grid-cols-2 lg:grid-cols-4">
        <ActivityMetric label="Calls" value={usage.kind === 'available' ? usage.callCountUnits : '—'} />
        <ActivityMetric label="Completed" value={usage.kind === 'available' ? usage.completedCountUnits : '—'} />
        <ActivityMetric label="Needs attention" value={usage.kind === 'available' ? usage.outcomeUnknownCountUnits : '—'} />
        <ActivityMetric
          label="Account spend"
          value={spend.kind === 'available'
            ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units: spend.spendUnits })
            : '—'}
        />
      </div>
    </AeSection>
  )
}

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

function ActivityMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-intra rounded-md border border-border px-gutter py-related">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums text-foreground">{value}</span>
    </div>
  )
}

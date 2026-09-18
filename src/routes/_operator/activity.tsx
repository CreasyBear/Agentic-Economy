import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Activity } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectCallSummaryPurchaseStatus } from '@/modules/capability-execution/call-receipt-view'
import {
  readOwnerCallsServer,
  readOwnerSpendServer,
  readOwnerUsageServer,
} from '@/lib/server/call-history.functions'
import { formatDisplayAmount } from '@/modules/money/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { downloadCsv, generateCallsCsv } from '@/lib/export/csv-export'
import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'

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

  const filteredItems = useMemo(() => {
    let result = pagination.items
    if (statusFilter !== 'all') {
      result = result.filter((item) => item.state === statusFilter)
    }
    if (dateRangeFilter !== 'all') {
      const cutoff = dateRangeFilter === 'today'
        ? nowMs - 24 * 60 * 60 * 1000
        : dateRangeFilter === '7d'
          ? nowMs - 7 * 24 * 60 * 60 * 1000
          : nowMs - 30 * 24 * 60 * 60 * 1000
      result = result.filter((item) => item.createdAt >= cutoff)
    }
    return result
  }, [pagination.items, statusFilter, dateRangeFilter, nowMs])

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
        id: 'outcome',
        accessorFn: (item) => projectCallSummaryPurchaseStatus(item).label,
        header: ({ column }) => <AeOperatorSortableHeader label="Purchase status" column={column} />,
        cell: ({ row }) => projectCallSummaryPurchaseStatus(row.original).label,
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
        {filteredAgent && (
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Filtered by Agent: <code className="font-mono font-medium text-foreground">{filteredAgent}</code>
            </span>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/activity">Clear filter</Link>
            </Button>
          </div>
        )}

        {pagination.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
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
                      className="h-7 text-xs capitalize"
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === 'all' ? 'All' : s.replace('_', ' ')}
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
                      className="h-7 text-xs uppercase"
                      onClick={() => setDateRangeFilter(d)}
                    >
                      {d === 'all' ? 'All time' : d}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {(statusFilter !== 'all' || dateRangeFilter !== 'all') ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  setStatusFilter('all')
                  setDateRangeFilter('all')
                }}
              >
                Reset filters
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const exportRows = filteredItems.map((item) => ({
                  date: item.createdAt ? new Date(item.createdAt).toISOString() : '',
                  callRef: item.callRef,
                  toolName: item.toolRef,
                  provider: 'Agentic Economy Seller',
                  agentName: item.principalRef ?? 'Unspecified Agent',
                  costAud: item.audAmountUnits ? (Number(item.audAmountUnits) / 1_000_000).toFixed(2) : '0.00',
                  gstAud: item.audAmountUnits ? (Number(item.audAmountUnits) / 11_000_000).toFixed(2) : '0.00',
                  status: projectCallSummaryPurchaseStatus(item).label,
                }))
                const csv = generateCallsCsv(exportRows)
                downloadCsv(`activity-calls-${new Date().toISOString().slice(0, 10)}.csv`, csv)
              }}
            >
              Export CSV
            </Button>
          </div>
        ) : null}
        {pagination.items.length === 0 && pagination.cursor === undefined ? (
          <AeEmptyState
            title="No Calls yet"
            description="Find a Tool and complete one Call. Its task, outcome, amount, and receipt will appear here."
            action={<Button asChild className="min-h-touch"><Link to="/owner/market">Find Tools</Link></Button>}
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
        <p role="alert" className="text-sm text-muted-foreground">More Calls could not be loaded. Current Calls and the continuation are unchanged.</p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className="min-h-touch"
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
            <span>Available Calls remain visible. No missing count or amount is being inferred.</span>
            <Button type="button" variant="secondary" disabled={retryPending} onClick={onRetry}>
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

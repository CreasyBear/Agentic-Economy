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
  loader: async (): Promise<ActivityLoaderResult> => {
    const periodStart = new Date().toISOString().slice(0, 7)
    const period = { dimensionKind: 'account' as const, periodKind: 'month' as const, periodStart }
    const [calls, usage, spend] = await Promise.allSettled([
      readOwnerCallsServer({ data: {} }),
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
        description="Your agent’s calls in task language, with the amount, outcome, and durable receipt together."
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
    key={canonicalDigest(result.calls)}
    initial={result.calls}
    usage={result.usage}
    spend={result.spend}
    periodStart={result.periodStart}
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

function useCallPagination(initial: CallPage) {
  const [state, setState] = useState(() => initialCallPaginationState(initial))

  async function loadNextPage() {
    if (state.cursor === undefined || state.status === 'loading') return
    const source = state.source
    const cursor = state.cursor
    setState((current) => current.source === source && current.cursor === cursor
      ? { ...current, status: 'loading' }
      : current)
    try {
      const next = await readOwnerCallsServer({ data: { cursor } })
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
}: Readonly<{
  initial: Extract<ActivityLoaderResult, { kind: 'available' }>['calls']
  usage: Extract<ActivityLoaderResult, { kind: 'available' }>['usage']
  spend: Extract<ActivityLoaderResult, { kind: 'available' }>['spend']
  periodStart: string
}>) {
  const router = useRouter()
  const [summaryRetryPending, setSummaryRetryPending] = useState(false)
  const { state: pagination, loadNextPage } = useCallPagination(initial)
  const attention = pagination.items.filter((item) => projectCallSummaryPurchaseStatus(item).attention)
  const recent = pagination.items.filter((item) => !projectCallSummaryPurchaseStatus(item).attention)
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
      description="Your agent’s calls in task language, with the amount, outcome, and durable receipt together."
      currentPath="/activity"
    >
      {usage.kind !== 'available' || spend.kind !== 'available' ? (
        <Alert>
          <AlertTitle>Some summaries are unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Available Calls remain visible. No missing count or amount is being inferred.</span>
            <Button
              type="button"
              variant="secondary"
              disabled={summaryRetryPending}
              onClick={() => {
                if (summaryRetryPending) return
                setSummaryRetryPending(true)
                void router.invalidate()
                  .catch((cause) => captureClientExceptionOnClient(cause))
                  .finally(() => setSummaryRetryPending(false))
              }}
            >
              {summaryRetryPending ? 'Refreshing…' : 'Refresh summaries'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-section">
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
        <MonthlyCallSummary usage={usage} spend={spend} periodStart={periodStart} />
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
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : (
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
}: Readonly<{
  usage: Extract<ActivityLoaderResult, { kind: 'available' }>['usage']
  spend: Extract<ActivityLoaderResult, { kind: 'available' }>['spend']
  periodStart: string
}>) {
  return (
    <AeSection title="This month" description={`Account-level Call and spend summary for ${periodStart}.`}>
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

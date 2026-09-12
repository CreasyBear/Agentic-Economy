import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Activity } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readOwnerCallsServer,
  readOwnerSpendServer,
  readOwnerUsageServer,
} from '@/lib/server/call-history.functions'
import { formatExactAmount } from '@/modules/money/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

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
    try {
      const periodStart = new Date().toISOString().slice(0, 7)
      const period = { dimensionKind: 'account' as const, periodKind: 'month' as const, periodStart }
      const [calls, usage, spend] = await Promise.all([
        readOwnerCallsServer({ data: {} }),
        readOwnerUsageServer({ data: period }),
        readOwnerSpendServer({ data: period }),
      ])
      return { kind: 'available', calls, usage, spend, periodStart }
    } catch (cause) {
      captureRouteException(cause, { 'ae.surface': 'operator_activity_loader' })
      return { kind: 'unavailable' }
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
    initial={result.calls}
    usage={result.usage}
    spend={result.spend}
    periodStart={result.periodStart}
  />
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
  const [activity, setActivity] = useState(initial.page)
  const [cursor, setCursor] = useState(initial.isDone ? undefined : initial.continueCursor)
  const [loadMorePending, setLoadMorePending] = useState(false)
  const [selected, setSelected] = useState<CallRow | undefined>()
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
              : `AUD ${formatExactAmount({ currency: 'AUD', exponent: 6, units: row.original.audAmountUnits }) ?? row.original.audAmountUnits}`}
          </span>
        ),
      },
      {
        id: 'outcome',
        accessorFn: (item) => callStateLabel(item.state),
        header: ({ column }) => <AeOperatorSortableHeader label="Outcome" column={column} />,
        cell: ({ row }) => callStateLabel(row.original.state),
      },
      {
        id: 'when',
        accessorKey: 'createdAt',
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString()}
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
      <div className="grid gap-section">
        <AeSection
          title="Usage"
          description={`Exact Call counts for ${periodStart}. Counts belong to this Account, across credentials.`}
        >
          <div className="grid gap-related sm:grid-cols-3">
            <ActivityMetric label="Calls" value={usage.kind === 'available' ? usage.callCountUnits : '—'} />
            <ActivityMetric label="Completed" value={usage.kind === 'available' ? usage.completedCountUnits : '—'} />
            <ActivityMetric label="Needs reconciliation" value={usage.kind === 'available' ? usage.outcomeUnknownCountUnits : '—'} />
          </div>
        </AeSection>
        <AeSection
          title="Spend"
          description={`Captured buyer spend for ${periodStart}. Corporate treasury remains separate.`}
        >
          <ActivityMetric
            label="Account spend"
            value={spend.kind === 'available'
              ? `AUD ${formatExactAmount({ currency: 'AUD', exponent: 6, units: spend.spendUnits }) ?? spend.spendUnits}`
              : '—'}
          />
        </AeSection>
      </div>
      {activity.length === 0 ? (
        <AeEmptyState
          title="No calls yet"
          description="Find a capability and complete one call. Its task, outcome, amount, and receipt will appear here."
          action={
            <Button asChild className="min-h-touch">
              <Link to="/market">Discover capabilities</Link>
            </Button>
          }
        />
      ) : (
        <>
          <AeRecordTable
            columns={columns}
            data={activity}
            caption="Calls"
            countLabel="calls"
            filterPlaceholder="Filter calls…"
            getRowId={(item) => item.callRef}
            rowAction={{
              kind: 'button',
              label: 'View',
              onOpen: setSelected,
              getAccessibleLabel: (item) =>
                `View ${item.toolLabel}`,
            }}
          />
          <AeRecordSheet
            open={selected !== undefined}
            onOpenChange={(open) => {
              if (!open) setSelected(undefined)
            }}
            title={selected === undefined ? 'Call' : selected.toolLabel}
            {...(selected === undefined ? {} : { facts: activityFacts(selected) })}
            {...(selected === undefined
              ? {}
              : {
                  action: (
                    <Button asChild className="min-h-touch">
                      <Link
                        to="/calls/$callRef"
                        params={{ callRef: selected.callRef }}
                      >
                        View receipt
                      </Link>
                    </Button>
                  ),
                })}
          />
          {cursor === undefined ? null : (
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                variant="secondary"
                className="min-h-touch"
                disabled={loadMorePending}
                onClick={() => {
                  if (loadMorePending) return
                  setLoadMorePending(true)
                  void readOwnerCallsServer({ data: { cursor } })
                    .then((next) => {
                      setActivity((current) => [...current, ...next.page])
                      setCursor(next.isDone ? undefined : next.continueCursor)
                    })
                    .catch((cause) => captureClientExceptionOnClient(cause))
                    .finally(() => setLoadMorePending(false))
                }}
              >
                {loadMorePending ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </AeOperatorPage>
  )
}

export type ActivityLoaderResult =
  | Readonly<{
      kind: 'available'
      calls: Awaited<ReturnType<typeof readOwnerCallsServer>>
      usage: Awaited<ReturnType<typeof readOwnerUsageServer>>
      spend: Awaited<ReturnType<typeof readOwnerSpendServer>>
      periodStart: string
    }>
  | Readonly<{ kind: 'unavailable' }>

type CallRow = Extract<ActivityLoaderResult, { kind: 'available' }>['calls']['page'][number]

function activityFacts(item: CallRow) {
  return [
    { label: 'Amount', value: item.audAmountUnits === undefined ? 'Not applicable' : `AUD ${formatExactAmount({ currency: 'AUD', exponent: 6, units: item.audAmountUnits }) ?? item.audAmountUnits}`, mono: true },
    { label: 'Outcome', value: callStateLabel(item.state) },
    { label: 'Delivery', value: item.deliveryState.replaceAll('_', ' ') },
    { label: 'Payment', value: item.paymentState.replaceAll('_', ' ') },
    ...(item.providerObligationState === undefined
      ? []
      : [{ label: 'Provider obligation', value: item.providerObligationState.replaceAll('_', ' ') }]),
    ...(item.providerAmountUnits === undefined
      ? []
      : [{ label: 'Provider amount', value: `USDC ${formatExactAmount({ currency: 'USDC', exponent: 6, units: item.providerAmountUnits }) ?? item.providerAmountUnits}`, mono: true }]),
    { label: 'Latency', value: `${item.latencyMs} ms`, mono: true },
    { label: 'When', value: new Date(item.createdAt).toLocaleString() },
    { label: 'Call reference', value: shortReference(item.callRef), mono: true },
    { label: 'Provider', value: item.providerRef, mono: true },
    ...(item.receiptRef === undefined ? [] : [{ label: 'Receipt', value: shortReference(item.receiptRef), mono: true }]),
    ...(item.recoveryRef === undefined ? [] : [{ label: 'Recovery', value: shortReference(item.recoveryRef), mono: true }]),
  ]
}

function callStateLabel(state: CallRow['state']): string {
  if (state === 'outcome_unknown') return 'reconciliation required'
  return state
}

function shortReference(reference: string): string {
  return reference.length <= 20 ? reference : `${reference.slice(0, 10)}…${reference.slice(-6)}`
}

function ActivityMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-intra rounded-md border border-border px-gutter py-related">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums text-foreground">{value}</span>
    </div>
  )
}

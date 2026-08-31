import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/ui/button'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { formatExactAmount } from '@/modules/money/public'
import type { AgentActivityView } from '@/modules/agent-access/agent-operator-view-model'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

export const Route = createFileRoute('/_operator/activity')({
  ...operatorRouteOptions,
  loader: async (): Promise<ActivityLoaderResult> => {
    try {
      return { kind: 'available', directory: await readAgentDirectoryServer() }
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
      <AeOperatorShell
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
      </AeOperatorShell>
    )
  }
  return <ActivityAvailable directory={result.directory} />
}

function ActivityAvailable({
  directory,
}: Readonly<{ directory: Extract<ActivityLoaderResult, { kind: 'available' }>['directory'] }>) {
  const activity = directory.details
    .flatMap((readback) => readback.activity)
    .toSorted((left, right) => right.observedAt - left.observedAt)
  const [selected, setSelected] = useState<AgentActivityView | undefined>()
  const columns = useMemo<ColumnDef<AgentActivityView, unknown>[]>(
    () => [
      {
        id: 'task',
        accessorFn: (item) => item.operation?.label ?? taskLabel(item.operationKey),
        header: ({ column }) => <AeOperatorSortableHeader label="Task" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.operation?.label ?? taskLabel(row.original.operationKey)}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorFn: (item) => formatExactAmount(item.grossAmount) ?? item.grossAmount.units,
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {row.original.grossAmount.currency} {formatExactAmount(row.original.grossAmount) ?? row.original.grossAmount.units}
          </span>
        ),
      },
      {
        id: 'outcome',
        accessorFn: (item) => chargeLabel(item.chargeState),
        header: ({ column }) => <AeOperatorSortableHeader label="Outcome" column={column} />,
        cell: ({ row }) => chargeLabel(row.original.chargeState),
      },
      {
        id: 'when',
        accessorKey: 'observedAt',
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {new Date(row.original.observedAt).toLocaleString()}
          </time>
        ),
      },
    ],
    [],
  )

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Calls"
      description="Your agent’s calls in task language, with the amount, outcome, and durable receipt together."
      currentPath="/activity"
    >
      {activity.length === 0 ? (
        <AeEmptyState
          title="No calls yet"
          description="Find a capability and complete one call. Its task, outcome, amount, and receipt will appear here."
          action={
            <Button asChild className="min-h-touch">
              <Link to="/market" search={{ window: '30d' }}>Discover capabilities</Link>
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
            getRowId={(item) => item.invocationRef}
            rowAction={{
              kind: 'button',
              label: 'View',
              onOpen: setSelected,
              getAccessibleLabel: (item) =>
                `View ${item.operation?.label ?? taskLabel(item.operationKey)}`,
            }}
          />
          <AeRecordSheet
            open={selected !== undefined}
            onOpenChange={(open) => {
              if (!open) setSelected(undefined)
            }}
            title={selected === undefined ? 'Call' : (selected.operation?.label ?? taskLabel(selected.operationKey))}
            {...(selected === undefined ? {} : { facts: activityFacts(selected) })}
            {...(selected === undefined
              ? {}
              : {
                  action: (
                    <Button asChild className="min-h-touch">
                      <Link
                        to="/operations/invocations/$invocationRef"
                        params={{ invocationRef: selected.invocationRef }}
                      >
                        View receipt
                      </Link>
                    </Button>
                  ),
                })}
          />
        </>
      )}
    </AeOperatorShell>
  )
}

export type ActivityLoaderResult =
  | Readonly<{ kind: 'available'; directory: Awaited<ReturnType<typeof readAgentDirectoryServer>> }>
  | Readonly<{ kind: 'unavailable' }>

function activityFacts(item: AgentActivityView) {
  return [
    { label: 'Amount', value: `${item.grossAmount.currency} ${formatExactAmount(item.grossAmount) ?? item.grossAmount.units}`, mono: true },
    { label: 'Outcome', value: chargeLabel(item.chargeState) },
    { label: 'When', value: new Date(item.observedAt).toLocaleString() },
    { label: 'Receipt', value: shortReference(item.invocationRef), mono: true },
    ...(item.operation === undefined ? [] : [{ label: 'Supplier', value: item.operation.supplier }]),
  ]
}

function taskLabel(operationKey: string): string {
  const words = operationKey.replaceAll(/[._:/-]+/g, ' ').trim()
  return words.length === 0 ? 'Used a capability' : `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function chargeLabel(state: AgentActivityView['chargeState']): string {
  if (state === 'free_tier') return 'completed free'
  if (state === 'paid') return 'completed'
  if (state === 'refunded') return 'refunded'
  if (state === 'outcome_unknown') return 'payment being verified'
  if (state === 'insufficient_credit') return 'not run · funding required'
  return state
}

function shortReference(reference: string): string {
  return reference.length <= 20 ? reference : `${reference.slice(0, 10)}…${reference.slice(-6)}`
}

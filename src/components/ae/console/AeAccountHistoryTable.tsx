'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { formatTimestamp } from '@/lib/ui/format-time'
import type {
  AccountHistoryEntry,
  AccountHistoryResult,
} from '@/modules/money/public'
import type { AccountHistoryPort } from '@/modules/money/account-history.contracts'
import {
  accountHistoryLabel,
  deduplicateHistory,
  formatSignedAmount,
} from './owner-credit-format'

type AvailableAccountHistory = Extract<AccountHistoryResult, { kind: 'available' }>

type AccountHistoryState = Readonly<{
  source: AvailableAccountHistory
  entries: readonly AccountHistoryEntry[]
  cursor: string | undefined
  coverage: AvailableAccountHistory['coverage']
  status: 'idle' | 'loading' | 'failed'
}>

export function CreditSectionEmptyState({
  title,
  description,
  action,
}: Readonly<{ title: string; description: string; action?: ReactNode }>) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="font-medium text-foreground">{title}</span>
      <span className="text-muted-foreground">{description}</span>
      {action === undefined ? null : action}
    </div>
  )
}

export function AccountHistory({
  result,
  port,
  loading,
  unavailable,
  onRefresh,
}: Readonly<{
  result?: AccountHistoryResult
  port?: AccountHistoryPort
  loading: boolean
  unavailable: boolean
  onRefresh?: () => void | Promise<void>
}>) {
  if (result?.kind !== 'available') {
    return <UnavailableAccountHistory loading={loading} {...(onRefresh === undefined ? {} : { onRefresh })} />
  }
  return (
    <AvailableAccountHistoryFrame
      result={result}
      {...(port === undefined ? {} : { port })}
      refreshUnavailable={unavailable}
      loading={loading}
      {...(onRefresh === undefined ? {} : { onRefresh })}
    />
  )
}

function UnavailableAccountHistory({
  loading,
  onRefresh,
}: Readonly<{ loading: boolean; onRefresh?: () => void | Promise<void> }>) {
  if (loading) {
    return (
      <div className="grid gap-intra" aria-busy="true" aria-label="Loading balance history">
        <Skeleton className="h-touch w-full" />
        <Skeleton className="h-touch w-full" />
      </div>
    )
  }
  return (
    <Alert>
      <AlertTitle>Balance history unavailable</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Known Account balance remains visible. No missing transaction or amount is being inferred.</span>
        {onRefresh === undefined ? null : (
          <Button type="button" variant="secondary" onClick={() => { void onRefresh() }}>Refresh history</Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function AvailableAccountHistoryFrame({
  result,
  port,
  refreshUnavailable,
  loading,
  onRefresh,
}: Readonly<{
  result: AvailableAccountHistory
  port?: AccountHistoryPort
  refreshUnavailable: boolean
  loading: boolean
  onRefresh?: () => void | Promise<void>
}>) {
  return (
    <div className="grid gap-4">
      <HistoryRefreshWarning
        visible={refreshUnavailable}
        loading={loading}
        {...(onRefresh === undefined ? {} : { onRefresh })}
      />
      <AvailableAccountHistoryView initial={result} {...(port === undefined ? {} : { port })} />
    </div>
  )
}

function HistoryRefreshWarning({
  visible,
  loading,
  onRefresh,
}: Readonly<{ visible: boolean; loading: boolean; onRefresh?: () => void | Promise<void> }>) {
  if (!visible) return null
  return (
    <Alert>
      <AlertTitle>Balance history could not be refreshed</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>The last booked transactions remain visible. No later transaction or amount is being inferred.</span>
        {onRefresh === undefined ? null : (
          <Button type="button" variant="secondary" disabled={loading} onClick={() => { void onRefresh() }}>
            {loading ? 'Refreshing…' : 'Try history again'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function AvailableAccountHistoryView({
  initial,
  port,
}: Readonly<{ initial: AvailableAccountHistory; port?: AccountHistoryPort }>) {
  const [state, setState] = useState<AccountHistoryState>(() => ({
    source: initial,
    entries: deduplicateHistory([], initial.entries),
    cursor: initial.isDone ? undefined : initial.continueCursor,
    coverage: initial.coverage,
    status: 'idle',
  }))
  const columns = useMemo<ColumnDef<AccountHistoryEntry, unknown>[]>(() => [
    {
      id: 'activity',
      accessorFn: (entry) => accountHistoryLabel(entry.kind),
      header: ({ column }) => <AeOperatorSortableHeader label="Activity" column={column} />,
      cell: ({ row }) => (
        <div className="grid gap-1">
          <span className="font-medium text-foreground">{accountHistoryLabel(row.original.kind)}</span>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Transaction details</summary>
            <dl className="mt-2 grid gap-1">
              <div><dt className="inline">Transaction ID: </dt><dd className="inline font-mono">{row.original.transactionId}</dd></div>
              <div><dt className="inline">Reference: </dt><dd className="inline font-mono">{row.original.transactionRef ?? 'Not recorded'}</dd></div>
              <div><dt className="inline">Occurred: </dt><dd className="inline font-mono">{formatTimestamp(row.original.occurredAt)}</dd></div>
              <div><dt className="inline">Source link: </dt><dd className="inline">Unavailable from Account history</dd></div>
              {row.original.sourceDigest === null ? null : (
                <div><dt className="inline">Evidence digest: </dt><dd className="inline break-all font-mono">{row.original.sourceDigest}</dd></div>
              )}
              {row.original.revertedAt === null ? null : (
                <div><dt className="inline">Reverted: </dt><dd className="inline font-mono">{formatTimestamp(row.original.revertedAt)}</dd></div>
              )}
            </dl>
          </details>
        </div>
      ),
    },
    {
      id: 'accountEffect',
      accessorFn: (entry) => BigInt(entry.accountEffect.units),
      header: ({ column }) => <AeOperatorSortableHeader label="Balance effect" column={column} />,
      cell: ({ row }) => row.original.accountEffect.units === '0'
        ? <span className="text-muted-foreground">No Balance change</span>
        : <span className="font-mono font-medium tabular-nums">{formatSignedAmount(row.original.accountEffect)}</span>,
    },
    {
      id: 'documentEffect',
      accessorFn: (entry) => BigInt(entry.documentEffectUnits),
      header: ({ column }) => <AeOperatorSortableHeader label="Document effect" column={column} />,
      cell: ({ row }) => row.original.documentEffectUnits === '0'
        ? <span className="text-muted-foreground">None</span>
        : <span className="font-mono tabular-nums">{formatSignedAmount({ currency: 'AUD', exponent: 6, units: row.original.documentEffectUnits })}</span>,
    },
    {
      id: 'recorded',
      accessorFn: (entry) => entry.recordedAt ?? entry.occurredAt,
      header: ({ column }) => <AeOperatorSortableHeader label="Recorded" column={column} />,
      cell: ({ row }) => (
        <div className="grid gap-0.5">
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(row.original.recordedAt ?? row.original.occurredAt)}
          </time>
          {row.original.recordedAt === null ? <span className="text-xs text-muted-foreground">Occurred time</span> : null}
        </div>
      ),
    },
    {
      id: 'status',
      accessorFn: (entry) => entry.reverted ? 'Reverted' : 'Booked',
      header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
      cell: ({ row }) => row.original.reverted ? 'Reverted' : 'Booked',
    },
  ], [])

  async function loadNextPage() {
    if (state.cursor === undefined || state.status === 'loading' || port === undefined) return
    const source = state.source
    const cursor = state.cursor
    setState((current) => current.source === source && current.cursor === cursor
      ? { ...current, status: 'loading' }
      : current)
    try {
      const next = await port.read({ cursor })
      if (next.kind !== 'available'
        || next.snapshotAt !== source.snapshotAt
        || next.source !== source.source
        || next.ordering !== source.ordering) {
        throw new Error('account_history_continuation_mismatch')
      }
      setState((current) => current.source === source && current.cursor === cursor
        ? {
            source,
            entries: deduplicateHistory(current.entries, next.entries),
            cursor: next.isDone ? undefined : next.continueCursor,
            coverage: current.coverage === 'partial' || next.coverage === 'partial' ? 'partial' : 'complete',
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

  return (
    <div className="grid gap-4">
      {state.coverage === 'partial' ? (
        <Alert>
          <AlertTitle>Some transaction attribution is incomplete</AlertTitle>
          <AlertDescription>Known booked transactions remain visible. Reversal netting or attribution may be incomplete, so these effects are not presented as a reconciliation to the balance above.</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Ordered by recorded transaction sequence, not effective date. Receipts and Call links are not available from this history yet.
      </p>
      {state.entries.length === 0 ? (
        <CreditSectionEmptyState title="No booked Account transactions yet" description="Confirmed funding, Call spend, reversals, and document adjustments will appear here." />
      ) : (
        <AeRecordTable
          columns={columns}
          data={state.entries}
          caption="Booked Account transactions"
          countLabel="transactions"
          filterPlaceholder="Filter Account history…"
          hideFilter={state.entries.length <= 1}
          getRowId={(entry) => entry.transactionId}
        />
      )}
      {state.status === 'failed' ? (
        <Alert>
          <AlertTitle>More history could not be loaded</AlertTitle>
          <AlertDescription>Existing transactions remain visible. Retry continues from the same Account cursor.</AlertDescription>
        </Alert>
      ) : null}
      {state.cursor === undefined ? null : port === undefined ? (
        <p className="text-sm text-muted-foreground">More booked transactions exist, but continuation is unavailable on this surface.</p>
      ) : (
        <div>
          <Button type="button" variant="secondary" disabled={state.status === 'loading'} onClick={() => { void loadNextPage() }}>
            {state.status === 'loading' ? 'Loading more…' : state.status === 'failed' ? 'Retry more history' : 'Load more history'}
          </Button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ReceiptText as ReceiptTextIcon } from 'lucide-react'

import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/arc/drawer/AeDrawerContent'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { formatTimestamp } from '@/lib/ui/format-time'
import type {
  AccountHistoryEntry,
  AccountHistoryResult,
} from '@/modules/money/public'
import type { AccountHistoryPort } from '@/modules/money/account-history.contracts'
import { AccountHistorySourceLink } from './AccountHistorySourceLink'
import { accountHistoryLabel, accountHistorySourceLabel, deduplicateHistory, formatSignedAmount } from './owner-credit-format'
import './owner-credit/components/CreditRecordsComposition.css'

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
    <AeEmptyState
      title={title}
      description={description}
      action={action}
      icon={<ReceiptTextIcon size={32} />}
      compact
      titleAs="p"
    />
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
    return (
      <div className="arc-market arc-credit-records">
        <UnavailableAccountHistory loading={loading} {...(onRefresh === undefined ? {} : { onRefresh })} />
      </div>
    )
  }
  return (
    <div className="arc-market arc-credit-records">
      <AvailableAccountHistoryFrame
        result={result}
        {...(port === undefined ? {} : { port })}
        refreshUnavailable={unavailable}
        loading={loading}
        {...(onRefresh === undefined ? {} : { onRefresh })}
      />
    </div>
  )
}

function UnavailableAccountHistory({
  loading,
  onRefresh,
}: Readonly<{ loading: boolean; onRefresh?: () => void | Promise<void> }>) {
  if (loading) {
    return (
      <div className="grid gap-intra" role="status" aria-busy="true" aria-label="Loading credit history">
        <div className="h-touch w-full" aria-hidden="true"><Skeleton lines={2} /></div>
        <div className="h-touch w-full" aria-hidden="true"><Skeleton lines={2} /></div>
      </div>
    )
  }
  return (
    <Alert>
      <AlertTitle>Credit history unavailable</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>Known Account balance remains visible. No missing transaction or amount is being inferred.</span>
        {onRefresh === undefined ? null : (
          <ArcButton type="button" variant="secondary" aria-busy={loading} onClick={() => { void onRefresh() }}>Try again</ArcButton>
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
    <div className="arc-credit-history-stack">
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
      <AlertTitle>Credit history could not be refreshed</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>The last booked transactions remain visible. No later transaction or amount is being inferred.</span>
        {onRefresh === undefined ? null : (
          <ArcButton type="button" variant="secondary" disabled={loading} aria-busy={loading} onClick={() => { void onRefresh() }}>
            {loading ? 'Trying again…' : 'Try again'}
          </ArcButton>
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
  // Requires current booked rows and stable transaction IDs. The Arc drawer
  // shows only the selected current row; it never fetches or mutates a transaction.
  // Amounts, source attribution and continuation guards remain authoritative.
  // A removed selection closes before commit so it cannot later reopen itself.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | undefined>()
  const selectedEntry = selectedId === null ? undefined : state.entries.find((entry) => entry.transactionId === selectedId)
  if (selectedId !== null && selectedEntry === undefined) setSelectedId(null)
  const columns = useMemo<ColumnDef<AccountHistoryEntry, unknown>[]>(() => [
    {
      id: 'activity',
      accessorFn: (entry) => accountHistoryLabel(entry.kind),
      header: ({ column }) => <AeOperatorSortableHeader label="Activity" column={column} />,
      meta: { label: 'Activity', truncate: true },
      cell: ({ row }) => <span className="font-medium text-foreground" title={accountHistoryLabel(row.original.kind)}>{accountHistoryLabel(row.original.kind)}</span>,
    },
    {
      id: 'accountEffect',
      accessorFn: (entry) => BigInt(entry.accountEffect.units),
      header: ({ column }) => <AeOperatorSortableHeader label="Balance effect" column={column} />,
      meta: { label: 'Balance effect', numeric: true },
      cell: ({ row }) => row.original.accountEffect.units === '0'
        ? <span className="arc-credit-history-amount text-muted-foreground">No Balance change</span>
        : <span className="arc-credit-history-amount font-mono font-medium tabular-nums">{formatSignedAmount(row.original.accountEffect)}</span>,
    },
    {
      id: 'documentEffect',
      accessorFn: (entry) => BigInt(entry.documentEffectUnits),
      header: ({ column }) => <AeOperatorSortableHeader label="Document effect" column={column} />,
      meta: { label: 'Document effect', numeric: true },
      cell: ({ row }) => row.original.documentEffectUnits === '0'
        ? <span className="arc-credit-history-amount text-muted-foreground">None</span>
        : <span className="arc-credit-history-amount font-mono tabular-nums">{formatSignedAmount({ currency: 'AUD', exponent: 6, units: row.original.documentEffectUnits })}</span>,
    },
    {
      id: 'recorded',
      accessorFn: (entry) => entry.recordedAt ?? entry.occurredAt,
      header: ({ column }) => <AeOperatorSortableHeader label="Recorded" column={column} />,
      meta: { label: 'Recorded', numeric: false, truncate: true },
      cell: ({ row }) => (
        <div className="grid gap-0.5">
          <time className="arc-credit-history-time font-mono text-xs tabular-nums text-muted-foreground" title={formatTimestamp(row.original.recordedAt ?? row.original.occurredAt)}>
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
      meta: { label: 'Status', truncate: true },
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
    <div className="arc-credit-history-stack">
      {state.coverage === 'partial' ? (
        <Alert>
          <AlertTitle>Some transaction attribution is incomplete</AlertTitle>
          <AlertDescription>Known booked transactions remain visible. Reversal netting or attribution may be incomplete, so these effects are not presented as a reconciliation to the balance above.</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Ordered by recorded transaction sequence, not effective date.
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
          rowAction={{
            kind: 'button',
            label: 'View details',
            getAccessibleLabel: (entry) => `View ${accountHistoryLabel(entry.kind)} transaction ${entry.transactionId}`,
            onOpen: (entry) => { setActiveRowId(entry.transactionId); setSelectedId(entry.transactionId) },
          }}
          rowActionFocus={{
            ...(activeRowId === undefined ? {} : { currentId: activeRowId }),
            onCurrentIdChange: setActiveRowId,
            restore: selectedId === null,
          }}
        />
      )}
      <Drawer open={selectedEntry !== undefined} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        {selectedEntry === undefined ? null : (
          <DrawerContent title="Account transaction" description={accountHistoryLabel(selectedEntry.kind)}>
            <AccountTransactionDetails entry={selectedEntry} />
          </DrawerContent>
        )}
      </Drawer>
      {state.status === 'failed' ? (
        <Alert>
          <AlertTitle>More history could not be loaded</AlertTitle>
          <AlertDescription>Existing transactions remain visible. Retry continues from the same Account cursor.</AlertDescription>
        </Alert>
      ) : null}
      {state.cursor === undefined ? null : port === undefined ? (
        <p className="text-sm text-muted-foreground">More booked transactions exist, but continuation is unavailable on this surface.</p>
      ) : (
        <div className="arc-credit-history-continuation">
          <ArcButton type="button" variant="secondary" disabled={state.status === 'loading'} aria-busy={state.status === 'loading'} onClick={() => { void loadNextPage() }}>
            {state.status === 'loading' ? 'Loading more…' : 'Load more'}
          </ArcButton>

        </div>
      )}
    </div>
  )
}

function AccountTransactionDetails({ entry }: Readonly<{ entry: AccountHistoryEntry }>) {
  return <>
    <AeFactList density="compact" className="arc-credit-history-detail-facts" facts={[
      { label: 'Transaction ID', value: entry.transactionId, mono: true },
      { label: 'Reference', value: entry.transactionRef ?? 'Not recorded', mono: true },
      { label: 'Balance effect', value: entry.accountEffect.units === '0' ? 'No Balance change' : formatSignedAmount(entry.accountEffect), mono: true },
      { label: 'Document effect', value: entry.documentEffectUnits === '0' ? 'None' : formatSignedAmount({ currency: 'AUD', exponent: 6, units: entry.documentEffectUnits }), mono: true },
      { label: 'Status', value: entry.reverted ? 'Reverted' : 'Booked' },
      { label: 'Recorded', value: entry.recordedAt === null ? 'Not recorded' : formatTimestamp(entry.recordedAt), mono: true },
      { label: 'Occurred', value: formatTimestamp(entry.occurredAt), mono: true },
      { label: 'Source', value: accountHistorySourceLabel(entry), mono: true },
      ...(entry.sourceDigest === null ? [] : [{ label: 'Evidence digest', value: entry.sourceDigest, mono: true }]),
      ...(entry.revertedAt === null ? [] : [{ label: 'Reverted', value: formatTimestamp(entry.revertedAt), mono: true }]),
    ]} />
    <div className="arc-credit-history-detail-actions"><AccountHistorySourceLink entry={entry} /></div>
  </>
}

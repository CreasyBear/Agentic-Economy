import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import type { AccountSecurityHistoryItem } from '@/modules/security/account-security'

export function AeSecurityHistoryTable({
  rows,
  caption,
  emptyMessage,
  isDone,
  loading,
  loadFailed = false,
  onLoadMore,
  showActorAndTarget = true,
}: Readonly<{
  rows: readonly AccountSecurityHistoryItem[]
  caption: string
  emptyMessage: string
  isDone: boolean
  loading: boolean
  loadFailed?: boolean
  onLoadMore(): void
  showActorAndTarget?: boolean
}>) {
  const columns = useMemo(() => historyColumns(showActorAndTarget), [showActorAndTarget])
  return (
    <div className="grid gap-related">
      <AeRecordTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.eventRef}
        caption={caption}
        countLabel="events"
        filterPlaceholder="Filter security history…"
        emptyMessage={emptyMessage}
        maxHeight="32rem"
      />
      <div className="min-h-[2.5rem]" role="status" aria-live="polite">
        {loadFailed ? (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              <strong>What happened:</strong> Older security events could not be loaded.
            </p>
            <p className="font-mono text-xs tabular-nums">
              <strong>Financial impact:</strong> A$0.00 affected — known security history remains visible.
            </p>
            <p>
              <strong>Next step:</strong> Check your connection and retry older events.
            </p>
          </div>
        ) : null}
      </div>
      {isDone ? null : (
        <Button
          type="button"
          variant="secondary"
          className="min-h-touch min-w-[11rem] justify-self-start enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? 'Loading…' : loadFailed ? 'Retry older events' : 'Load older events'}
        </Button>
      )}
    </div>
  )
}

function historyColumns(showActorAndTarget: boolean): ColumnDef<AccountSecurityHistoryItem, unknown>[] {
  return [
    {
      id: 'activity',
      header: 'Activity',
      accessorFn: (row) => `${row.eventType} ${row.outcome}`,
      cell: ({ row }) => (
        <span className="grid gap-1">
          <span className="font-medium text-foreground">{eventLabel(row.original.eventType)}</span>
          <Badge variant="secondary" className="w-fit">{humanize(row.original.outcome)}</Badge>
        </span>
      ),
    },
    {
      id: 'time',
      header: 'Time',
      accessorFn: (row) => row.observedAt ?? row.recordedAt,
      cell: ({ row }) => (
        <span className="grid gap-1 whitespace-nowrap">
          <span>{row.original.observedAt === undefined ? 'Observed time unavailable' : `${formatUtcTimestamp(row.original.observedAt)} UTC`}</span>
          <span className="text-xs text-muted-foreground">Recorded {formatUtcTimestamp(row.original.recordedAt)} UTC</span>
        </span>
      ),
    },
    {
      accessorKey: 'sourceSystem',
      header: 'Source',
      cell: ({ row }) => sourceLabel(row.original.sourceSystem),
    },
    {
      id: 'evidence',
      header: 'Evidence',
      enableSorting: false,
      cell: ({ row }) => (
        <details className="min-w-48 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">Evidence details</summary>
          <dl className="mt-2 grid gap-2">
            {showActorAndTarget ? (
              <>
                <div className="grid gap-1">
                  <dt>Actor · {actorLabel(row.original.actorKind)}</dt>
                  <dd><AeCopyReference label="Actor reference" value={row.original.actorRef} /></dd>
                </div>
                <div className="grid gap-1">
                  <dt>Target · {targetLabel(row.original.targetType)}</dt>
                  <dd><AeCopyReference label="Target reference" value={row.original.targetRef} /></dd>
                </div>
              </>
            ) : null}
            <div className="grid gap-1">
              <dt>Correlation reference</dt>
              <dd><AeCopyReference label="Reference" value={row.original.correlationRef} /></dd>
            </div>
          </dl>
        </details>
      ),
    },
  ]
}

function actorLabel(value: string): string {
  return humanize(value)
}

function eventLabel(value: string): string {
  return humanize(value.replace(/^account\./u, ''))
}

function targetLabel(value: string): string {
  return humanize(value)
}

function sourceLabel(value: AccountSecurityHistoryItem['sourceSystem']): string {
  if (value === 'clerk_observed') return 'Clerk observed'
  if (value === 'provider_observed') return 'Provider observed'
  return 'AE recorded'
}

function humanize(value: string): string {
  const words = value.replaceAll(/[._-]+/gu, ' ')
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

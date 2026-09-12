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
  onLoadMore,
  showActorAndTarget = true,
}: Readonly<{
  rows: readonly AccountSecurityHistoryItem[]
  caption: string
  emptyMessage: string
  isDone: boolean
  loading: boolean
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
      {isDone ? null : (
        <Button
          type="button"
          variant="secondary"
          className="justify-self-start"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? 'Loading…' : 'Load older events'}
        </Button>
      )}
    </div>
  )
}

function historyColumns(showActorAndTarget: boolean): ColumnDef<AccountSecurityHistoryItem, unknown>[] {
  return [
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
      accessorKey: 'eventType',
      header: 'Event',
      cell: ({ row }) => eventLabel(row.original.eventType),
    },
    ...(showActorAndTarget ? [{
      id: 'actor',
      header: 'Actor',
      accessorFn: (row: AccountSecurityHistoryItem) => `${row.actorKind} ${row.actorRef}`,
      cell: ({ row }: { row: { original: AccountSecurityHistoryItem } }) => (
        <span className="grid min-w-0 gap-1">
          <span>{actorLabel(row.original.actorKind)}</span>
          <AeCopyReference label="Actor reference" value={row.original.actorRef} />
        </span>
      ),
    }, {
      id: 'target',
      header: 'Target',
      accessorFn: (row: AccountSecurityHistoryItem) => `${row.targetType} ${row.targetRef}`,
      cell: ({ row }: { row: { original: AccountSecurityHistoryItem } }) => (
        <span className="grid min-w-0 gap-1">
          <span>{targetLabel(row.original.targetType)}</span>
          <AeCopyReference label="Target reference" value={row.original.targetRef} />
        </span>
      ),
    }] satisfies ColumnDef<AccountSecurityHistoryItem, unknown>[] : []),
    {
      accessorKey: 'outcome',
      header: 'Outcome',
      cell: ({ row }) => <Badge variant="secondary">{humanize(row.original.outcome)}</Badge>,
    },
    {
      accessorKey: 'sourceSystem',
      header: 'Source',
      cell: ({ row }) => sourceLabel(row.original.sourceSystem),
    },
    {
      accessorKey: 'correlationRef',
      header: 'Reference',
      cell: ({ row }) => <AeCopyReference label="Reference" value={row.original.correlationRef} />,
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

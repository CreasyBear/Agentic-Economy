import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
          <span>{row.original.observedAt === undefined ? 'Observed time unavailable' : formatTime(row.original.observedAt)}</span>
          <span className="text-xs text-muted-foreground">Recorded {formatTime(row.original.recordedAt)}</span>
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
        <span className="grid gap-1">
          <span className="capitalize">{row.original.actorKind}</span>
          <code className="text-xs text-muted-foreground">{row.original.actorRef}</code>
        </span>
      ),
    }, {
      id: 'target',
      header: 'Target',
      accessorFn: (row: AccountSecurityHistoryItem) => `${row.targetType} ${row.targetRef}`,
      cell: ({ row }: { row: { original: AccountSecurityHistoryItem } }) => (
        <span className="grid gap-1">
          <span>{targetLabel(row.original.targetType)}</span>
          <code className="text-xs text-muted-foreground">{row.original.targetRef}</code>
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
      cell: ({ row }) => <code className="text-xs">{row.original.correlationRef}</code>,
    },
  ]
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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

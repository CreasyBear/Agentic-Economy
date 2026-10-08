import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import type { AccountSecurityHistoryItem } from '@/modules/security/account-security'
import './SecurityHistoryComposition.css'

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
  const [selectedEventRef, setSelectedEventRef] = useState<string | null>(null)
  const selectedEvent = selectedEventRef === null
    ? undefined
    : rows.find((row) => row.eventRef === selectedEventRef)
  const tableView = useMemo(
    () => ({ rows: [...rows], showActorAndTarget }),
    [rows, showActorAndTarget],
  )
  const columns = useMemo(
    () => historyColumns(tableView.showActorAndTarget, (eventRef) => setSelectedEventRef(eventRef)),
    [setSelectedEventRef, tableView.showActorAndTarget],
  )

  useEffect(() => {
    if (selectedEventRef !== null && !rows.some((row) => row.eventRef === selectedEventRef)) {
      setSelectedEventRef(null)
    }
  }, [rows, selectedEventRef])

  return (
    <div className="arc-market arc-security-history">
      <AeRecordTable
        columns={columns}
        data={tableView.rows}
        getRowId={(row) => row.eventRef}
        caption={caption}
        countLabel="events"
        filterPlaceholder="Filter security history…"
        emptyMessage={emptyMessage}
        maxHeight="32rem"
      />
      <Drawer
        open={selectedEvent !== undefined}
        onOpenChange={(open) => { if (!open) setSelectedEventRef(null) }}
      >
        {selectedEvent === undefined ? null : (
          <DrawerContent
            title="Security event"
            description={`${eventLabel(selectedEvent.eventType)} · ${humanize(selectedEvent.outcome)}`}
          >
            <AeFactList
              className="arc-security-drawer-facts"
              facts={[
                {
                  label: 'Event reference',
                  value: <AeCopyReference label="Event reference" value={selectedEvent.eventRef} />,
                },
                { label: 'Source', value: sourceLabel(selectedEvent.sourceSystem) },
                {
                  label: 'Observed time',
                  value: selectedEvent.observedAt === undefined
                    ? 'Observed time unavailable'
                    : `${formatUtcTimestamp(selectedEvent.observedAt)} UTC`,
                },
                {
                  label: 'Recorded time',
                  value: `${formatUtcTimestamp(selectedEvent.recordedAt)} UTC`,
                },
                ...(showActorAndTarget
                  ? [
                      {
                        label: `Actor · ${actorLabel(selectedEvent.actorKind)}`,
                        value: <AeCopyReference label="Actor reference" value={selectedEvent.actorRef} />,
                      },
                      {
                        label: `Target · ${targetLabel(selectedEvent.targetType)}`,
                        value: <AeCopyReference label="Target reference" value={selectedEvent.targetRef} />,
                      },
                    ]
                  : []),
                {
                  label: 'Correlation reference',
                  value: <AeCopyReference label="Correlation reference" value={selectedEvent.correlationRef} />,
                },
              ]}
            />
          </DrawerContent>
        )}
      </Drawer>
      <div className="arc-security-pagination-status" role="status" aria-live="polite">
        {loadFailed ? (
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              <strong>What happened:</strong> Older security events could not be loaded.
            </p>
            <p className="font-mono text-xs tabular-nums">
              <strong>Financial impact:</strong> Financial impact has not been assessed here. Known security history remains visible.
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
          size="md"
          loading={loading}
          aria-busy={loading || undefined}
          className="arc-security-load"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? 'Loading…' : loadFailed ? 'Retry older events' : 'Load older events'}
        </Button>
      )}
    </div>
  )
}

function historyColumns(
  showActorAndTarget: boolean,
  onSelectEvent: (eventRef: string) => void,
): ColumnDef<AeRecordTableFeatures, AccountSecurityHistoryItem, unknown>[] {
  return [
    {
      id: 'activity',
      header: 'Activity',
      accessorFn: (row) => `${row.eventType} ${row.outcome}`,
      cell: ({ row }) => (
        <span className="arc-security-activity" title={eventLabel(row.original.eventType)}>
          <span className="arc-security-activity-name">{eventLabel(row.original.eventType)}</span>
          <span className="arc-security-outcome">{humanize(row.original.outcome)}</span>
        </span>
      ),
    },
    {
      id: 'time',
      header: 'Time',
      accessorFn: (row) => row.observedAt ?? row.recordedAt,
      cell: ({ row }) => (
        <span className="arc-security-time">
          <span>{row.original.observedAt === undefined ? 'Observed time unavailable' : `${formatUtcTimestamp(row.original.observedAt)} UTC`}</span>
          <span className="arc-security-recorded">Recorded {formatUtcTimestamp(row.original.recordedAt)} UTC</span>
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
      accessorFn: (row) => [
        row.eventRef,
        row.correlationRef,
        ...(showActorAndTarget
          ? [row.actorKind, row.actorRef, row.targetType, row.targetRef]
          : []),
      ].join(' '),
      cell: ({ row }) => (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="arc-security-evidence-trigger"
          aria-label={`View details for security event ${row.original.eventRef}`}
          onClick={() => onSelectEvent(row.original.eventRef)}
        >
          View details
        </Button>
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

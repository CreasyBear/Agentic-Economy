import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import { enumLabel } from '@/lib/ui/enum-label'
import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { formatTimestamp } from '@/lib/ui/format-time'
import { aeStatusPresentation, statusToneOf, type AeStatus } from '@/lib/ui/status-presentation'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { Badge } from '@/components/arc/badge/badge'
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
            description={`${eventLabel(selectedEvent.eventType)} · ${enumLabel(selectedEvent.outcome)}`}
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
                    : `${formatTimestamp(selectedEvent.observedAt, 'UTC')} UTC`,
                },
                {
                  label: 'Recorded time',
                  value: `${formatTimestamp(selectedEvent.recordedAt, 'UTC')} UTC`,
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
      accessorFn: (row) => eventLabel(row.eventType),
      meta: { truncate: true },
      cell: ({ row }) => <span className="arc-security-activity-name">{eventLabel(row.original.eventType)}</span>,
    },
    {
      id: 'outcome',
      header: 'Outcome',
      accessorKey: 'outcome',
      // outcome is a free string; only canonical statuses can use AeStatusBadge (it throws on unknown values)
      cell: ({ row }) => Object.hasOwn(aeStatusPresentation, row.original.outcome)
        ? <AeStatusBadge status={row.original.outcome as AeStatus} density="cell" />
        : <Badge tone={statusToneOf(row.original.outcome)} size="sm">{enumLabel(row.original.outcome)}</Badge>,
    },
    {
      accessorKey: 'sourceSystem',
      header: 'Source',
      cell: ({ row }) => sourceLabel(row.original.sourceSystem),
    },
    {
      id: 'time',
      header: 'Time',
      accessorFn: (row) => row.observedAt ?? row.recordedAt,
      cell: ({ row }) => (
        <span className="arc-security-time">
          <RecordTime at={row.original.observedAt ?? row.original.recordedAt} />
          {row.original.observedAt === undefined ? <span className="arc-security-recorded">Observed time unavailable</span> : null}
        </span>
      ),
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
  return enumLabel(value)
}

function eventLabel(value: string): string {
  return enumLabel(value.replace(/^account\./u, ''))
}

function targetLabel(value: string): string {
  return enumLabel(value)
}

function sourceLabel(value: AccountSecurityHistoryItem['sourceSystem']): string {
  if (value === 'clerk_observed') return 'Clerk observed'
  if (value === 'provider_observed') return 'Provider observed'
  return 'AE recorded'
}

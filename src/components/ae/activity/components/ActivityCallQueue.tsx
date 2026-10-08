import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import { scopedCallHref } from '@/lib/call-recovery/activity-return-scope'
import { useId, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/arc/badge/badge'

import type { ActivityBadgeView, ActivityCallQueueProps, ActivityCallRowView } from '../activity.contracts'
import './ActivityQueueComposition.css'

function ActivityBadge({ badge }: Readonly<{ badge: ActivityBadgeView }>) {
  return (
    <Badge
      tone={badge.variant}
      className={`arc-activity-badge${badge.warning ? ' border-warning/50 text-warning' : ''}`}
    >
      {badge.label}
    </Badge>
  )
}

export function ActivityCallQueue({
  title,
  description,
  rows,
  emptyMessage,
  attention = false,
  returnScope,
}: ActivityCallQueueProps) {
  const headingId = useId()
  const columns = useMemo<ColumnDef<AeRecordTableFeatures, ActivityCallRowView, unknown>[]>(
    () => [
      {
        id: 'call',
        accessorKey: 'callRef',
        meta: { label: 'Call' },
        header: ({ column }) => <AeOperatorSortableHeader label="Call" column={column} />,
        cell: ({ row }) => (
          <span
            className="arc-activity-reference"
            title={row.original.callRef}
          >
            {row.original.callRef}
          </span>
        ),
      },
      {
        id: 'agent',
        accessorFn: (item) => item.agentTitle,
        meta: { label: 'Caller Agent' },
        header: ({ column }) => <AeOperatorSortableHeader label="Caller Agent" column={column} />,
        cell: ({ row }) => (
          <span className="arc-activity-reference" title={row.original.agentTitle ?? 'Not available'}>
            {row.original.agentTitle ?? 'Not available'}
          </span>
        ),
      },
      {
        id: 'tool',
        accessorFn: (item) => item.toolLabel,
        meta: { label: 'Tool' },
        header: ({ column }) => <AeOperatorSortableHeader label="Tool" column={column} />,
        cell: ({ row }) => (
          <span className="arc-activity-tool font-medium text-foreground" title={row.original.toolLabel}>
            {row.original.toolLabel}
          </span>
        ),
      },
      {
        id: 'duration',
        accessorFn: (item) => item.latencyMs,
        meta: { label: 'Time to outcome', numeric: true },
        sortUndefined: 'last',
        header: ({ column }) => <AeOperatorSortableHeader label="Time to outcome" column={column} />,
        cell: ({ row }) => (
          <span className="arc-activity-number">
            {row.original.durationLabel}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorFn: (item) => item.amountUnits,
        meta: { label: 'Amount', numeric: true },
        sortUndefined: 'last',
        sortFn: (left, right) => {
          const a = BigInt(left.original.amountUnits ?? '0')
          const b = BigInt(right.original.amountUnits ?? '0')
          return a < b ? -1 : a > b ? 1 : 0
        },
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="arc-activity-number arc-activity-amount">
            {row.original.amountLabel}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (item) => item.stateBadge.label,
        meta: { label: 'Call status' },
        header: ({ column }) => <AeOperatorSortableHeader label="Call status" column={column} />,
        cell: ({ row }) => <ActivityBadge badge={row.original.stateBadge} />,
      },
      {
        id: 'outcome',
        accessorFn: (item) => item.purchaseLabel,
        meta: { label: 'Purchase status' },
        header: ({ column }) => <AeOperatorSortableHeader label="Purchase status" column={column} />,
        cell: ({ row }) => (
          <div className="arc-activity-purchase">
            <ActivityBadge badge={row.original.purchaseBadge} />
            <div className="arc-activity-detail">
              Payment: {row.original.paymentStateLabel}
            </div>
          </div>
        ),
      },
      {
        id: 'when',
        accessorKey: 'createdAt',
        meta: { label: 'When', numeric: true },
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time className="arc-activity-number" dateTime={new Date(row.original.createdAt).toISOString()}>
            {row.original.whenLabel}
          </time>
        ),
      },
    ],
    [],
  )

  return (
    <section className="arc-market arc-activity-queue" aria-labelledby={headingId} data-attention={attention || undefined}>
      <header className="arc-activity-queue-header">
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </header>
      {rows.length === 0 ? (
        <AeTableEmptyState
          title={attention ? 'No Calls need attention' : 'No Calls in history'}
          description={emptyMessage}
        />
      ) : (
        <AeRecordTable
          columns={columns}
          data={rows}
          caption={title}
          countLabel={attention ? 'Calls needing attention' : 'recent Calls'}
          filterPlaceholder={attention ? 'Filter attention queue…' : 'Filter recent Calls…'}
          hideFilter
          getRowId={(item) => item.callRef}
          rowAction={{
            kind: 'link',
            label: attention ? 'Review' : 'View receipt',
            getHref: (item) => scopedCallHref(item.receiptHref, returnScope),
            getAccessibleLabel: (item) => item.receiptAccessibleLabel,
          }}
        />
      )}
    </section>
  )
}

import { useId, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeFactList } from '@/components/ae/data/AeFactList'
import buttonStyles from '@/components/arc/button/button.module.css'
import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'

import type { ActivityBadgeView, ActivityCallQueueProps, ActivityCallRowView } from '../activity.contracts'
import './ActivityQueueComposition.css'

function ActivityBadge({ badge }: Readonly<{ badge: ActivityBadgeView }>) {
  return (
    <Badge
      variant={badge.variant}
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
}: ActivityCallQueueProps) {
  const headingId = useId()
  const columns = useMemo<ColumnDef<ActivityCallRowView, unknown>[]>(
    () => [
      {
        id: 'call',
        accessorKey: 'callRef',
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
        header: ({ column }) => <AeOperatorSortableHeader label="Caller Agent" column={column} />,
        cell: ({ row }) => (
          <span className="arc-activity-reference" title={row.original.agentTitle}>
            {row.original.agentShortId}
          </span>
        ),
      },
      {
        id: 'tool',
        accessorFn: (item) => item.toolLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Tool" column={column} />,
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.toolLabel}
          </span>
        ),
      },
      {
        id: 'duration',
        accessorFn: (item) => item.latencyMs,
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
        sortUndefined: 'last',
        sortingFn: (left, right) => {
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
        header: ({ column }) => <AeOperatorSortableHeader label="Call status" column={column} />,
        cell: ({ row }) => <ActivityBadge badge={row.original.stateBadge} />,
      },
      {
        id: 'outcome',
        accessorFn: (item) => item.purchaseLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Purchase status" column={column} />,
        cell: ({ row }) => (
          <div className="grid gap-1">
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
            getHref: (item) => item.receiptHref,
            getAccessibleLabel: (item) => item.receiptAccessibleLabel,
          }}
          compactContent={(
            <div className="arc-activity-mobile-records">
              {rows.map((row) => (
                <article key={row.callRef} className="arc-activity-record">
                  <header className="arc-activity-record-header">
                    <h3>{row.toolLabel}</h3>
                    <ActivityBadge badge={row.purchaseBadge} />
                  </header>
                  <div className="arc-activity-record-facts">
                    <AeFactList density="compact" facts={[
                      { label: 'Call reference', value: <span className="arc-activity-reference">{row.callRef}</span> },
                      { label: 'Caller Agent', value: row.agentTitle ?? 'Not available' },
                      { label: 'Time to outcome', value: row.durationLabel },
                      { label: 'Amount', value: <span className="font-mono tabular-nums">{row.amountLabel}</span> },
                      { label: 'Status', value: row.stateBadge.label },
                      { label: 'Purchase status', value: row.purchaseLabel },
                      { label: 'Payment', value: row.paymentStateLabel },
                      { label: 'When', value: row.whenLabel },
                    ]} />
                  </div>
                  <footer>
                    <a href={row.receiptHref} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>{attention ? 'Review Call' : 'View receipt'} <span className="sr-only">for {row.toolLabel}</span></a>
                  </footer>
                </article>
              ))}
            </div>
          )}
        />
      )}
    </section>
  )
}

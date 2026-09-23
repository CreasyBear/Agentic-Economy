import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'

import type { ActivityBadgeView, ActivityCallQueueProps, ActivityCallRowView } from '../activity.contracts'

function ActivityBadge({ badge }: Readonly<{ badge: ActivityBadgeView }>) {
  return (
    <Badge
      variant={badge.variant}
      className={badge.warning ? 'border-warning/50 text-warning' : undefined}
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
  const columns = useMemo<ColumnDef<ActivityCallRowView, unknown>[]>(
    () => [
      {
        id: 'call',
        accessorKey: 'callRef',
        header: ({ column }) => <AeOperatorSortableHeader label="Call" column={column} />,
        cell: ({ row }) => (
          <span
            className="font-mono text-xs text-muted-foreground truncate max-w-[120px] block"
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
          <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px] block" title={row.original.agentTitle}>
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
        accessorFn: (item) => item.durationLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Time to outcome" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.durationLabel}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorFn: (item) => item.amountLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {row.original.amountLabel}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (item) => item.stateBadge.label,
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => <ActivityBadge badge={row.original.stateBadge} />,
      },
      {
        id: 'outcome',
        accessorFn: (item) => item.purchaseLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Purchase status" column={column} />,
        cell: ({ row }) => (
          <div className="grid gap-1">
            <ActivityBadge badge={row.original.purchaseBadge} />
            <div className="text-xs text-muted-foreground">
              Payment: {row.original.paymentStateLabel}
            </div>
          </div>
        ),
      },
      {
        id: 'when',
        accessorKey: 'whenLabel',
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time className="font-mono text-xs tabular-nums text-muted-foreground">
            {row.original.whenLabel}
          </time>
        ),
      },
    ],
    [],
  )

  return (
    <AeSection title={title} description={description}>
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
        />
      )}
    </AeSection>
  )
}

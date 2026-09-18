'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { formatDisplayAmount } from '@/modules/money/public'
import { projectCallSummaryPurchaseStatus } from '@/modules/capability-execution/call-receipt-view'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import type {
  AgentActivityView,
  AgentUsageSummary,
} from '@/modules/agent-access/agent-operator-view-model'

export type AeAgentCallHistoryTableProps = Readonly<{
  activity: readonly AgentActivityView[]
  usage?: AgentUsageSummary
  showStats?: boolean
}>

function purchaseStatusBadgeVariant(
  kind: 'delivered' | 'failed' | 'pending' | 'refunded' | 'uncertain',
): 'success' | 'destructive' | 'warning' | 'outline' {
  switch (kind) {
    case 'delivered':
      return 'success'
    case 'failed':
      return 'destructive'
    case 'refunded':
      return 'outline'
    case 'uncertain':
    case 'pending':
      return 'warning'
    default:
      return 'outline'
  }
}

export function AeAgentCallHistoryTable({
  activity,
  usage,
  showStats = false,
}: AeAgentCallHistoryTableProps) {
  const columns = useMemo<ColumnDef<AgentActivityView, unknown>[]>(
    () => [
      {
        id: 'task',
        accessorFn: (item) => item.tool?.label ?? item.toolLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Tool / Task" column={column} />,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground text-xs">
              {row.original.tool?.label ?? row.original.toolLabel}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]">
              {row.original.toolRef}
            </span>
          </div>
        ),
      },
      {
        id: 'provider',
        accessorFn: (item) => item.tool?.provider ?? item.providerRef,
        header: ({ column }) => <AeOperatorSortableHeader label="Provider" column={column} />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.tool?.provider ?? row.original.providerRef}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorFn: (item) => item.audAmountUnits ?? '',
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => {
          const units = row.original.audAmountUnits
          return (
            <span className="font-mono text-xs tabular-nums text-foreground">
              {units === undefined
                ? '—'
                : formatDisplayAmount({ currency: 'AUD', exponent: 6, units })}
            </span>
          )
        },
      },
      {
        id: 'status',
        accessorFn: (item) => projectCallSummaryPurchaseStatus(item).label,
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = projectCallSummaryPurchaseStatus(row.original)
          return (
            <Badge variant={purchaseStatusBadgeVariant(status.kind)} className="text-[11px]">
              {status.label}
            </Badge>
          )
        },
      },
      {
        id: 'when',
        accessorKey: 'createdAt',
        header: ({ column }) => <AeOperatorSortableHeader label="When" column={column} />,
        cell: ({ row }) => (
          <time
            dateTime={new Date(row.original.createdAt).toISOString()}
            className="font-mono text-[11px] tabular-nums text-muted-foreground"
          >
            {formatUtcTimestamp(row.original.createdAt)} UTC
          </time>
        ),
      },
      {
        id: 'receipt',
        accessorKey: 'callRef',
        header: () => null,
        cell: ({ row }) => (
          <a
            href={`/calls/${encodeURIComponent(row.original.callRef)}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
            aria-label={`View call receipt ${row.original.callRef}`}
          >
            <span>Receipt</span>
            <ArrowUpRightIcon className="size-3" />
          </a>
        ),
      },
    ],
    [],
  )

  return (
    <div className="grid gap-3 pt-2">
      {showStats && usage && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border bg-background/50 p-2.5">
            <span className="text-muted-foreground block text-[11px]">Calls this month</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {usage.callCount}
            </span>
          </div>
          <div className="rounded border bg-background/50 p-2.5">
            <span className="text-muted-foreground block text-[11px]">Settled spend</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {usage.settledSpend ? formatDisplayAmount(usage.settledSpend) : 'A$0.00'}
            </span>
          </div>
          <div className="rounded border bg-background/50 p-2.5">
            <span className="text-muted-foreground block text-[11px]">Needs checking</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {usage.outcomeUnknownCallCount}
            </span>
          </div>
        </div>
      )}

      {activity.length === 0 ? (
        <AeEmptyState
          title="No calls recorded yet"
          description="When this agent executes tools via MCP or API keys, its calls, outcomes, and receipts will appear here."
        />
      ) : (
        <AeRecordTable
          data={activity}
          columns={columns}
          getRowId={(row) => row.callRef}
          emptyMessage="No calls found."
        />
      )}
    </div>
  )
}

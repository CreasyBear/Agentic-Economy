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
import './AgentConnectionRecordsComposition.css'

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
        accessorFn: (item) => item.toolLabel,
        header: ({ column }) => <AeOperatorSortableHeader label="Tool / Task" column={column} />,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground text-sm">
              {row.original.toolLabel}
            </span>
            <span className="font-mono text-sm text-muted-foreground aeAgentCallReference">
              {row.original.toolRef}
            </span>
          </div>
        ),
      },
      {
        id: 'provider',
        accessorFn: (item) => item.providerRef,
        header: ({ column }) => <AeOperatorSortableHeader label="Provider" column={column} />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.providerRef}
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
            <span className="font-mono text-sm tabular-nums text-foreground">
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
            <Badge variant={purchaseStatusBadgeVariant(status.kind)}>
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
            className="font-mono text-sm tabular-nums text-muted-foreground"
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
            className="aeAgentCallReceipt inline-flex items-center gap-1 text-sm text-primary hover:underline font-mono"
            aria-label={`View call receipt ${row.original.callRef}`}
          >
            <span>Receipt</span>
            <ArrowUpRightIcon className="size-3" aria-hidden="true" />
          </a>
        ),
      },
    ],
    [],
  )

  return (
    <div className="arc-market aeAgentCallHistory">
      {/* Requires complete amount coverage and an exact settled amount; ensures
          recorded zero stays zero and absent/partial amounts never imply zero.
          On violation show the existing Agent amount-coverage refusal. */}
      {showStats && usage && (
        <div className="aeAgentCallMetrics">
          <div className="aeAgentCallMetric">
            <span className="aeAgentCallMetricLabel">Calls this month</span>
            <span className="font-mono aeAgentCallMetricValue">
              {usage.callCount}
            </span>
          </div>
          <div className="aeAgentCallMetric">
            <span className="aeAgentCallMetricLabel">Settled spend</span>
            <span className="font-mono aeAgentCallMetricValue">
              {usage.amountCoverage === 'complete' && usage.settledSpend !== undefined
                ? formatDisplayAmount(usage.settledSpend)
                : 'Amount coverage incomplete'}
            </span>
          </div>
          <div className="aeAgentCallMetric">
            <span className="aeAgentCallMetricLabel">Needs checking</span>
            <span className="font-mono aeAgentCallMetricValue">
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

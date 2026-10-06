'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRightIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { formatDisplayAmount } from '@/modules/money/public'
import { projectCallSummaryPurchaseStatus } from '@/modules/capability-execution/call-receipt-view'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
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
        meta: { label: 'Tool / Task' },
        header: ({ column }) => <AeOperatorSortableHeader label="Tool / Task" column={column} />,
        cell: ({ row }) => (
          <div className="aeAgentCallIdentity">
            <span className="aeAgentCallIdentityName font-medium text-foreground" title={row.original.toolLabel}>
              {row.original.toolLabel}
            </span>
            <span className="font-mono text-muted-foreground aeAgentCallReference" title={row.original.toolRef}>
              {row.original.toolRef}
            </span>
          </div>
        ),
      },
      {
        id: 'provider',
        accessorFn: (item) => item.providerRef,
        meta: { label: 'Provider' },
        header: ({ column }) => <AeOperatorSortableHeader label="Provider" column={column} />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground aeAgentCallProvider" title={row.original.providerRef}>
            {row.original.providerRef}
          </span>
        ),
      },
      {
        id: 'amount',
        meta: { label: 'Amount', numeric: true },
        accessorFn: (item) => item.paymentState === 'released'
          || (item.paymentState === 'not_applicable' && item.state === 'refused' && item.deliveryState === 'not_delivered') ? '0'
          : item.paymentState === 'settled' && item.audAmountUnits !== undefined
            && /^(?:0|[1-9]\d*)$/u.test(item.audAmountUnits) ? item.audAmountUnits : undefined,
        sortUndefined: 'last',
        sortingFn: (left, right) => {
          const a = BigInt(left.getValue<string | undefined>('amount') ?? '0')
          const b = BigInt(right.getValue<string | undefined>('amount') ?? '0')
          return a < b ? -1 : a > b ? 1 : 0
        },
        header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
        cell: ({ row }) => {
          const units = row.getValue<string | undefined>('amount')
          return (
            <span className="font-mono text-sm tabular-nums text-foreground">
              {units === undefined ? row.original.paymentState === 'settled' ? 'Amount unknown' : 'Not confirmed'
                : row.original.paymentState === 'settled' ? formatDisplayAmount({ currency: 'AUD', exponent: 6, units }) : 'No charge'}
            </span>
          )
        },
      },
      {
        id: 'status',
        accessorFn: (item) => projectCallSummaryPurchaseStatus(item).label,
        meta: { label: 'Status' },
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
        meta: { label: 'When' },
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
        enableSorting: false,
        meta: { label: 'Receipt' },
        header: () => null,
        cell: ({ row }) => (
          <a
            href={`/calls/${encodeURIComponent(row.original.callRef)}`}
            className={actionLinkClassName('ghost', 'sm')}
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
            <span className="aeAgentCallMetricLabel">Calls this UTC month</span>
            <span className="font-mono aeAgentCallMetricValue">
              {usage.callCount}
            </span>
          </div>
          <div className="aeAgentCallMetric">
            <span className="aeAgentCallMetricLabel">Projected settled charges</span>
            <span className="font-mono aeAgentCallMetricValue">
              {usage.amountCoverage === 'complete' && usage.settledSpend !== undefined
                ? formatDisplayAmount(usage.settledSpend)
                : 'Amount coverage incomplete'}
            </span>
          </div>
          <div className="aeAgentCallMetric">
            <span className="aeAgentCallMetricLabel">Outcome unknown</span>
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

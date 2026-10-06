import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { AeApproximateQuotaMeter } from '@/components/ae/shared/usage-meter/AeApproximateQuotaMeter'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { stagedListPhase, useFirstLoadPending } from '@/components/ui/data-state'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { suggestNextAction } from '@/modules/market/suggested-next-action'
import type { AgentDirectoryItem } from '@/modules/agent-access/agent-operator-view-model'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import {
  agentStatusBadgeVariant,
  agentStatusLabel,
  authorityCellText,
  authorityIsHistorical,
  currentAuthorityLabel,
  environmentLabel,
  monthlySpendLabel,
  monthlyUtilization,
  scopeLabel,
} from './agent-operator-console-model'
import './AgentDirectoryComposition.css'

export type AeAgentDirectoryTableProps = Readonly<{
  directoryItems: readonly AgentDirectoryItem[]
  loading: boolean
  onRenameAgent?: (principalRef: string, expectedRevision: number, displayName: string) => Promise<boolean>
  getAgentHref?: (principalId: string) => string
  onOpenAgent: (item: AgentDirectoryItem) => void
}>

export function AeAgentDirectoryTable({
  directoryItems,
  loading,
  onRenameAgent,
  getAgentHref,
  onOpenAgent,
}: AeAgentDirectoryTableProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | AgentDirectoryItem['status']>('all')
  const firstLoadPending = useFirstLoadPending(loading)
  const agentsPhase = stagedListPhase({ firstLoadPending, rows: directoryItems })
  const missingAgentNextAction = suggestNextAction({
    subject: 'connection',
    state: 'missing',
    actor: 'buyer',
  })

  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') return directoryItems
    return directoryItems.filter((item) => item.status === statusFilter)
  }, [directoryItems, statusFilter])

  const columns = useMemo<ColumnDef<AgentDirectoryItem, unknown>[]>(
    () => [
      {
        id: 'agent',
        accessorFn: (item) => item.displayName,
        meta: { label: 'Agent' },
        header: ({ column }) => <AeOperatorSortableHeader label="Agent" column={column} />,
        cell: ({ row }) => (
          <div className="arc-agent-directory-cell arc-agent-directory-identity" title={row.original.displayName}>
            <div className="arc-agent-directory-identity-primary">
              <InlineEditField
                value={row.original.displayName}
                label={`Rename ${row.original.displayName} (${environmentLabel(row.original.environment)} · ${row.original.principalRef})`}
                readOnly={onRenameAgent === undefined}
                errorMessage="Could not rename this Agent. Current saved name has been restored."
                onSave={async (displayName) => onRenameAgent?.(
                  row.original.principalRef,
                  row.original.principalRevision,
                  displayName,
                ) ?? false}
              />
              <Badge variant="outline" className="arc-agent-directory-state">{environmentLabel(row.original.environment)}</Badge>
            </div>
            <span className="arc-agent-directory-reference" title={row.original.principalRef}>
              {row.original.principalRef}
            </span>
          </div>
        ),
      },
      {
        id: 'connection',
        accessorFn: (item) => item.connectionsAvailable === false ? '' : item.connectorDisplayNames.join(', '),
        meta: { label: 'Connection' },
        header: ({ column }) => <AeOperatorSortableHeader label="Connection" column={column} />,
        cell: ({ row }) => {
          const connectionText = row.original.connectionsAvailable === false
            ? 'Connection details unavailable'
            : row.original.connectionCount === 0
              ? 'Direct key'
              : row.original.connectorDisplayNames.join(', ')
          return <span className="arc-agent-directory-connection" title={connectionText}>{connectionText}</span>
        },
      },
      {
        id: 'authority',
        accessorFn: (item) => authorityCellText(item),
        meta: { label: 'Authority' },
        header: ({ column }) => <AeOperatorSortableHeader label="Authority" column={column} />,
        cell: ({ row }) => {
          const current = currentAuthorityLabel(row.original.status, row.original.authorityMode)
          if (!authorityIsHistorical(row.original.status)) return current
          return (
            <div className="arc-agent-directory-cell">
              <span>{current}</span>
              <span className="arc-agent-directory-note">Previous authority: {scopeLabel(row.original.authorityMode)}</span>
            </div>
          )
        },
      },
      {
        id: 'monthlyCalls',
        accessorFn: (item) => item.usage?.callCount,
        meta: { label: 'Calls this UTC month', numeric: true },
        sortUndefined: 'last',
        header: ({ column }) => <AeOperatorSortableHeader label="Calls this UTC month" column={column} />,
        cell: ({ row }) => row.original.usage === undefined ? 'Usage unavailable' : (
          <div className="arc-agent-directory-cell">
            <span className="font-mono tabular-nums">{row.original.usage.callCount}</span>
            <span className="arc-agent-directory-note">{row.original.usage.completedCallCount} completed · {row.original.usage.outcomeUnknownCallCount} outcome unknown</span>
          </div>
        ),
      },
      {
        id: 'monthlySpend',
        accessorFn: (item) => item.monthlySpendCoverage === 'complete' ? item.monthlySettledSpend?.units : undefined,
        meta: { label: 'Charges / UTC month limit', numeric: true },
        sortUndefined: 'last',
        sortingFn: (left, right) => {
          const a = BigInt(left.getValue<string | undefined>('monthlySpend') ?? '0')
          const b = BigInt(right.getValue<string | undefined>('monthlySpend') ?? '0')
          return a < b ? -1 : a > b ? 1 : 0
        },
        header: ({ column }) => <AeOperatorSortableHeader label="Charges / UTC month limit" column={column} />,
        cell: ({ row }) => {
          const spendText = monthlySpendLabel(row.original)
          const utilization = monthlyUtilization(row.original)
          if (utilization === undefined) {
            return (
              <span className="arc-agent-directory-note">{spendText}</span>
            )
          }
          const thresholdText = utilization.limitState === 'under'
            ? 'Under the limit.'
            : utilization.limitState === 'at'
              ? 'At the limit.'
              : 'Over the limit.'
          return (
            <div className="arc-agent-directory-utilization">
              <span className="arc-agent-directory-money">{spendText}</span>
              <AeApproximateQuotaMeter
                label="UTC month utilization"
                percentage={utilization.percent}
                limitState={utilization.limitState}
                summary={`${utilization.percent}% (${spendText}). ${thresholdText}`}
              />
            </div>
          )
        },
      },
      {
        id: 'lastUsed',
        accessorFn: (item) => item.lastSeenAt ?? 0,
        meta: { label: 'Last used' },
        header: ({ column }) => <AeOperatorSortableHeader label="Last used" column={column} />,
        cell: ({ row }) => {
          const lastSeenAt = row.original.lastSeenAt
          if (lastSeenAt === undefined) return 'No activity'
          return (
            <time
              dateTime={timestampIso(lastSeenAt)}
              title={formatTimestamp(lastSeenAt)}
              className="arc-agent-directory-date"
            >
              {formatRelativeTime(lastSeenAt)}
            </time>
          )
        },
      },
      {
        id: 'status',
        accessorFn: (item) => agentStatusLabel(item.status),
        meta: { label: 'Status' },
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = agentStatusLabel(row.original.status)
          const variant = agentStatusBadgeVariant(row.original.status)
          return <Badge variant={variant} className="arc-agent-directory-state">{status}</Badge>
        },
      },
    ],
    [onRenameAgent],
  )

  if (agentsPhase === 'unloaded') {
    return (
      <div className="arc-market arc-agent-directory">
          <AeRecordTable
            columns={columns}
            data={[]}
            caption="Agents"
            countLabel="agents"
            loading
            hideFilter
          />
      </div>
    )
  }

  if (directoryItems.length === 0) {
    return (
      <div className="arc-market arc-agent-directory">
        <AeEmptyState
          title="No agent is connected yet"
          description="Start setup from the agent and approve the request to create access you can revoke."
          action={
            <a
              href={missingAgentNextAction.href}
              className={actionLinkClassName('primary', 'md')}
            >
              {missingAgentNextAction.label}
            </a>
          }
        />
      </div>
    )
  }

  return (
    <div className="arc-market arc-agent-directory">
    <AeRecordTable
      columns={columns}
      data={filteredItems}
      caption="Agents"
      countLabel="agents"
      filterPlaceholder="Filter agents…"
      hideFilter={directoryItems.length <= 1}
      action={
        <SegmentedControl
          label="Filter by status"
          value={statusFilter}
          onValueChange={(val) => setStatusFilter(val as typeof statusFilter)}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'connected', label: 'Connected' },
            { value: 'attention', label: 'Needs attention' },
            { value: 'expired', label: 'Expired' },
            { value: 'disconnected', label: 'Disconnected' },
          ]}
        />
      }
      getRowId={(item) => item.principalRef}
      {...(getAgentHref === undefined
        ? {
            rowAction: {
              kind: 'button' as const,
              label: 'View',
              onOpen: onOpenAgent,
              getAccessibleLabel: (item: AgentDirectoryItem) =>
                `View ${item.displayName} (${environmentLabel(item.environment)} · ${item.principalRef})`,
            },
          }
        : {
            rowAction: {
              kind: 'link' as const,
              label: 'Open',
              getHref: (item: AgentDirectoryItem) =>
                getAgentHref(item.principalRef),
              getAccessibleLabel: (item: AgentDirectoryItem) =>
                `Open ${item.displayName} (${environmentLabel(item.environment)} · ${item.principalRef})`,
            },
          })}
    />
    </div>
  )
}

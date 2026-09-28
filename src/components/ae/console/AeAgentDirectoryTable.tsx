import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { stagedListPhase, useFirstLoadPending } from '@/components/ui/data-state'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { suggestNextAction } from '@/modules/market/suggested-next-action'
import type { AgentDirectoryItem } from '@/modules/agent-access/agent-operator-view-model'
import {
  agentStatusBadgeVariant,
  agentStatusLabel,
  environmentLabel,
  monthlySpendLabel,
  monthlyUtilizationPercent,
  scopeLabel,
} from './agent-operator-console-model'

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
        header: ({ column }) => <AeOperatorSortableHeader label="Agent" column={column} />,
        cell: ({ row }) => (
          <div className="grid gap-1">
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
            <Badge variant="outline" className="w-fit">{environmentLabel(row.original.environment)}</Badge>
            <span className="break-all font-mono text-xs text-muted-foreground" title={row.original.principalRef}>
              {row.original.principalRef}
            </span>
          </div>
        ),
      },
      {
        id: 'connection',
        accessorFn: (item) => item.connectionsAvailable === false ? '' : item.connectorDisplayNames.join(', '),
        header: ({ column }) => <AeOperatorSortableHeader label="Connection" column={column} />,
        cell: ({ row }) => row.original.connectionsAvailable === false
          ? 'Connection details unavailable'
          : row.original.connectionCount === 0
            ? 'Legacy credential'
            : row.original.connectorDisplayNames.join(', '),
      },
      {
        id: 'authority',
        accessorFn: (item) => scopeLabel(item.authorityMode),
        header: ({ column }) => <AeOperatorSortableHeader label="Authority" column={column} />,
        cell: ({ row }) => scopeLabel(row.original.authorityMode),
      },
      {
        id: 'monthlySpend',
        accessorFn: (item) => monthlyUtilizationPercent(item) ?? -1,
        header: ({ column }) => <AeOperatorSortableHeader label="Monthly spend" column={column} />,
        cell: ({ row }) => {
          const spendText = monthlySpendLabel(row.original)
          const percent = monthlyUtilizationPercent(row.original)
          if (percent === undefined) {
            return (
              <span className="text-xs text-muted-foreground">{spendText}</span>
            )
          }
          return (
            <div className="grid gap-1.5 min-w-[120px]">
              <span className="font-mono tabular-nums text-xs">{spendText}</span>
              <Progress
                value={percent}
                className="h-1.5"
                aria-label={`${percent}% (${spendText})`}
              />
            </div>
          )
        },
      },
      {
        id: 'lastUsed',
        accessorFn: (item) => item.lastSeenAt ?? 0,
        header: ({ column }) => <AeOperatorSortableHeader label="Last used" column={column} />,
        cell: ({ row }) => {
          const lastSeenAt = row.original.lastSeenAt
          if (lastSeenAt === undefined) return 'No activity'
          return (
            <time
              dateTime={timestampIso(lastSeenAt)}
              title={formatTimestamp(lastSeenAt)}
              className="font-mono tabular-nums text-xs"
            >
              {formatRelativeTime(lastSeenAt)}
            </time>
          )
        },
      },
      {
        id: 'status',
        accessorFn: (item) => agentStatusLabel(item.status),
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = agentStatusLabel(row.original.status)
          const variant = agentStatusBadgeVariant(row.original.status)
          return <Badge variant={variant}>{status}</Badge>
        },
      },
    ],
    [onRenameAgent],
  )

  if (agentsPhase === 'unloaded') {
    return (
      <AeRecordTable
        columns={columns}
        data={[]}
        caption="Agents"
        countLabel="agents"
        loading
        hideFilter
      />
    )
  }

  if (directoryItems.length === 0) {
    return (
      <AeEmptyState
        title="No agent is connected yet"
        description="Start setup from the agent and approve the request to create access you can revoke."
        action={
          <a
            href={missingAgentNextAction.href}
            className={cn(buttonVariants(), 'min-h-touch')}
          >
            {missingAgentNextAction.label}
          </a>
        }
      />
    )
  }

  return (
    <AeRecordTable
      columns={columns}
      data={filteredItems}
      caption="Agents"
      countLabel="agents"
      filterPlaceholder="Filter agents…"
      hideFilter={directoryItems.length <= 1}
      action={
        <Select
          value={statusFilter}
          onValueChange={(val) => setStatusFilter(val as typeof statusFilter)}
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="connected">Connected</SelectItem>
              <SelectItem value="attention">Needs attention</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="disconnected">Disconnected</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
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
  )
}

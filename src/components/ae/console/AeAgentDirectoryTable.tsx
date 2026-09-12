import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import {
  AeOperatorSortableHeader,
  AeRecordTable,
} from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stagedListPhase, useFirstLoadPending } from '@/components/ui/data-state'
import { InlineEditField } from '@/components/ui/inline-edit-field'
import { formatTimestamp } from '@/lib/ui/format-time'
import { suggestNextAction } from '@/modules/market/suggested-next-action'
import type { AgentDirectoryItem } from '@/modules/agent-access/agent-operator-view-model'
import { agentStatusLabel, environmentLabel, scopeLabel } from './agent-operator-console-model'

export function AeAgentDirectoryTable({
  directoryItems,
  loading,
  onRenameAgent,
  getAgentHref,
  onOpenAgent,
}: Readonly<{
  directoryItems: readonly AgentDirectoryItem[]
  loading: boolean
  onRenameAgent?: (principalRef: string, expectedRevision: number, displayName: string) => Promise<boolean>
  getAgentHref?: (principalId: string) => string
  onOpenAgent: (item: AgentDirectoryItem) => void
}>) {
  const firstLoadPending = useFirstLoadPending(loading)
  const agentsPhase = stagedListPhase({ firstLoadPending, rows: directoryItems })
  const missingAgentNextAction = suggestNextAction({
    subject: 'connection',
    state: 'missing',
    actor: 'buyer',
  })
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
              label={`Rename ${row.original.displayName}`}
              readOnly={onRenameAgent === undefined}
              errorMessage="Could not rename this Agent. Current saved name has been restored."
              onSave={async (displayName) => onRenameAgent?.(
                row.original.principalRef,
                row.original.principalRevision,
                displayName,
              ) ?? false}
            />
            <Badge variant="outline" className="w-fit">{environmentLabel(row.original.environment)}</Badge>
          </div>
        ),
      },
      {
        id: 'connection',
        accessorFn: (item) => item.connectorDisplayNames.join(', '),
        header: ({ column }) => <AeOperatorSortableHeader label="Connection" column={column} />,
        cell: ({ row }) => row.original.connectionCount === 0
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
        id: 'lastUsed',
        accessorFn: (item) => item.lastSeenAt ?? 0,
        header: ({ column }) => <AeOperatorSortableHeader label="Last used" column={column} />,
        cell: ({ row }) => row.original.lastSeenAt === undefined
          ? 'No activity'
          : <span className="font-mono tabular-nums">{formatTimestamp(row.original.lastSeenAt)}</span>,
      },
      {
        id: 'status',
        accessorFn: (item) => agentStatusLabel(item.status),
        header: ({ column }) => <AeOperatorSortableHeader label="Status" column={column} />,
        cell: ({ row }) => {
          const status = agentStatusLabel(row.original.status)
          return <Badge variant={status === 'Connected' ? 'default' : 'outline'}>{status}</Badge>
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
          <Button asChild className="min-h-touch">
            <a href={missingAgentNextAction.href}>{missingAgentNextAction.label}</a>
          </Button>
        }
      />
    )
  }

  return (
    <AeRecordTable
      columns={columns}
      data={directoryItems}
      caption="Agents"
      countLabel="agents"
      filterPlaceholder="Filter agents…"
      hideFilter={directoryItems.length <= 1}
      getRowId={(item) => item.principalRef}
      {...(getAgentHref === undefined
        ? {
            rowAction: {
              kind: 'button' as const,
              label: 'View',
              onOpen: onOpenAgent,
              getAccessibleLabel: (item: AgentDirectoryItem) =>
                `View ${item.displayName}`,
            },
          }
        : {
            rowAction: {
              kind: 'link' as const,
              label: 'Open',
              getHref: (item: AgentDirectoryItem) =>
                getAgentHref(item.principalRef),
              getAccessibleLabel: (item: AgentDirectoryItem) =>
                `Open ${item.displayName}`,
            },
          })}
    />
  )
}

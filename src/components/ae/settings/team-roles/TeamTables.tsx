import { useMemo, useState, type ReactNode } from 'react'
import { useTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { Search, X } from 'lucide-react'
import { DataGrid, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { InviteQueueCard } from '@/components/ae/shared/reui-pro/team/InviteQueueCard'
import type { TeamMemberView } from './team-roles.contracts'
import type { PendingTeamInvitation } from './team-access.contracts'

export type TeamTableMember = Pick<TeamMemberView, 'key' | 'name' | 'email' | 'role'>

/**
 * Licensed Profile 2 member-management-table.tsx and Solution Users 4 invite-queue-view.tsx:
 * https://reui.io/preview/base/profile-2 · https://reui.io/preview/base/solution-users-4
 * SHA-256 3ea978cffc0dc86049c46f23c746c5bf973be50cc014ef19da7e107cc56381c9
 * SHA-256 6371f51b510e29c48dfa8783d9b5b21c544b438b0b510e38ec0c207649fb5b3c
 * Retains card/toolbar/grid composition. Recorded facts and owner actions replace demos.
 * Owner pagination uses Load more; search and sorting apply to loaded rows only.
 * No synthetic totals, selection, optimistic access changes or second table engine.
 */
function TeamSearch({ label, query, onChange }: { label: string; query: string; onChange: (value: string) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
    <InputGroup className="w-full sm:max-w-sm">
      <InputGroupAddon align="inline-start"><Search aria-hidden="true" /></InputGroupAddon>
      <InputGroupInput type="search" aria-label={label} placeholder={label} value={query} onChange={event => onChange(event.target.value)} />
      {query ? <InputGroupAddon align="inline-end"><InputGroupButton aria-label={`Clear ${label.toLowerCase()}`} size="icon-xs" onClick={() => onChange('')}><X aria-hidden="true" /></InputGroupButton></InputGroupAddon> : null}
    </InputGroup>
  </div>
}

export function TeamMembersTable({ members, renderActions, footer }: {
  members: readonly TeamTableMember[]; renderActions: (member: TeamTableMember) => ReactNode; footer?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return members.filter(member => [member.name, member.email, member.role].some(value => value?.toLowerCase().includes(needle)))
  }, [members, query])
  const columns = useMemo<ColumnDef<DataGridFeatures, TeamTableMember, unknown>[]>(() => [
    { id: 'name', accessorKey: 'name', header: ({ column }) => <DataGridColumnHeader column={column} title="Member" />, size: 300,
      cell: ({ row }) => <div className="min-w-0 py-1"><p className="font-medium">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.email ?? 'Email not available'}</p></div> },
    { id: 'role', accessorKey: 'role', header: ({ column }) => <DataGridColumnHeader column={column} title="Workspace role" />, size: 150 },
    { id: 'actions', header: 'Access', enableSorting: false, size: 220, cell: ({ row }) => renderActions(row.original) },
  ], [renderActions])
  const table = useTable({ features: dataGridFeatures, columns, data: rows, getRowId: row => row.key,
    manualPagination: true, enableRowSelection: false, state: { sorting }, onSortingChange: setSorting })
  return <DataGrid table={table} recordCount={rows.length} tableAriaLabel="Workspace members"
    emptyMessage={query.trim() ? 'No members match this search.' : 'No members yet.'}
    tableLayout={{ columnsPinnable: false, columnsMovable: false, columnsVisibility: false, columnsResizable: false, dense: true }}>
    <InviteQueueCard title="Members" description="Recorded workspace roles. Search and sorting apply to the members shown." footer={footer}>
      <TeamSearch label="Find a member" query={query} onChange={setQuery} />
      <Separator /><DataGridScrollArea><DataGridTable /></DataGridScrollArea>
    </InviteQueueCard>
  </DataGrid>
}

export function TeamInvitationsTable({ invitations, complete, renderActions, action, footer }: {
  invitations: readonly PendingTeamInvitation[]; complete: boolean; renderActions: (invitation: PendingTeamInvitation) => ReactNode; action?: ReactNode; footer?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const rows = useMemo(() => invitations.filter(invitation => invitation.email.toLowerCase().includes(query.trim().toLowerCase())), [invitations, query])
  const columns = useMemo<ColumnDef<DataGridFeatures, PendingTeamInvitation, unknown>[]>(() => [
    { id: 'email', accessorKey: 'email', header: ({ column }) => <DataGridColumnHeader column={column} title="Invitee" />, size: 260 },
    { id: 'role', accessorKey: 'role', header: ({ column }) => <DataGridColumnHeader column={column} title="Role" />, size: 120,
      cell: ({ row }) => row.original.role === 'org:admin' ? 'Admin' : 'Member' },
    { id: 'expires', accessorKey: 'expiresAt', header: ({ column }) => <DataGridColumnHeader column={column} title="Expires" />, size: 140,
      cell: ({ row }) => <time dateTime={new Date(row.original.expiresAt).toISOString()}>{new Date(row.original.expiresAt).toLocaleDateString('en-AU')}</time> },
    { id: 'actions', header: 'Actions', enableSorting: false, size: 230, cell: ({ row }) => renderActions(row.original) },
  ], [renderActions])
  const table = useTable({ features: dataGridFeatures, columns, data: rows, getRowId: row => row.invitationId,
    manualPagination: true, enableRowSelection: false, state: { sorting }, onSortingChange: setSorting })
  return <DataGrid table={table} recordCount={rows.length} tableAriaLabel="Pending invitations"
    emptyMessage={query.trim() ? 'No loaded invitations match this search.' : complete ? 'No pending invitations.' : 'No invitations in this page. Load more to continue.'}
    tableLayout={{ columnsPinnable: false, columnsMovable: false, columnsVisibility: false, columnsResizable: false, dense: true }}>
    <InviteQueueCard title="Pending invitations" description={complete ? 'Current pending invitations. Accepted members appear above.' : 'Partial list. Search and sorting apply to loaded invitations.'} action={action} footer={footer}>
      <TeamSearch label="Search loaded invitations" query={query} onChange={setQuery} />
      <Separator /><DataGridScrollArea><DataGridTable /></DataGridScrollArea>
    </InviteQueueCard>
  </DataGrid>
}

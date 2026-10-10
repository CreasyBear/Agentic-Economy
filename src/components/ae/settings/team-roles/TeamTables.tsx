import { useMemo, useState, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { AeSortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import { InviteQueueCard } from '@/components/ae/shared/reui-pro/team/InviteQueueCard'
import type { TeamMemberView } from './team-roles.contracts'
import type { PendingTeamInvitation } from './team-access.contracts'

export type TeamTableMember = Pick<TeamMemberView, 'key' | 'name' | 'email' | 'role'>

/**
 * Licensed Profile 2 member-management-table.tsx and Solution Users 4 invite-queue-view.tsx:
 * https://reui.io/preview/base/profile-2 · https://reui.io/preview/base/solution-users-4
 * SHA-256 3ea978cffc0dc86049c46f23c746c5bf973be50cc014ef19da7e107cc56381c9
 * SHA-256 6371f51b510e29c48dfa8783d9b5b21c544b438b0b510e38ec0c207649fb5b3c
 * Retains card/toolbar composition; rows render through the shared AeSortableDataTable.
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
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return members.filter(member => [member.name, member.email, member.role].some(value => value?.toLowerCase().includes(needle)))
  }, [members, query])
  return <InviteQueueCard title="Members" description="Recorded workspace roles. Search and sorting apply to the members shown." footer={footer}>
    <TeamSearch label="Find a member" query={query} onChange={setQuery} />
    <Separator />
    <AeSortableDataTable
      rows={rows}
      rowKey="key"
      caption="Workspace members"
      itemName={{ one: 'member', other: 'members' }}
      emptyMessage={query.trim() ? 'No members match this search.' : 'No members yet.'}
      columns={[
        { key: 'name', label: 'Member', render: (_value, member) => <div className="min-w-0"><p className="font-medium">{member.name}</p><p className="text-xs text-muted-foreground">{member.email ?? 'Email not available'}</p></div> },
        { key: 'role', label: 'Role' },
        { key: 'actions', label: 'Access', sortable: false, render: (_value, member) => renderActions(member) },
      ]}
    />
  </InviteQueueCard>
}

export function TeamInvitationsTable({ invitations, complete, renderActions, action, footer }: {
  invitations: readonly PendingTeamInvitation[]; complete: boolean; renderActions: (invitation: PendingTeamInvitation) => ReactNode; action?: ReactNode; footer?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const rows = useMemo(() => invitations.filter(invitation => invitation.email.toLowerCase().includes(query.trim().toLowerCase())), [invitations, query])
  return <InviteQueueCard title="Pending invitations" description={complete ? 'Current pending invitations. Accepted members appear above.' : 'Partial list. Search and sorting apply to loaded invitations.'} action={action} footer={footer}>
    <TeamSearch label="Search loaded invitations" query={query} onChange={setQuery} />
    <Separator />
    <AeSortableDataTable
      rows={rows}
      rowKey="invitationId"
      caption="Pending invitations"
      itemName={{ one: 'invitation', other: 'invitations' }}
      emptyMessage={query.trim() ? 'No loaded invitations match this search.' : complete ? 'No pending invitations.' : 'No invitations in this page. Load more to continue.'}
      columns={[
        { key: 'email', label: 'Invitee' },
        { key: 'role', label: 'Role', render: (_value, invitation) => invitation.role === 'org:admin' ? 'Admin' : 'Member' },
        { key: 'expiresAt', label: 'Expires', numeric: false, render: (_value, invitation) => <RecordTime at={invitation.expiresAt} /> },
        { key: 'actions', label: 'Actions', sortable: false, render: (_value, invitation) => renderActions(invitation) },
      ]}
    />
  </InviteQueueCard>
}

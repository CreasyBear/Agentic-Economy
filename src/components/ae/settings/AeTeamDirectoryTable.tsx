import { useState, type ReactElement } from 'react'

import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'

export type DirectoryOwner = Readonly<{
  kind: 'owner'
  principalRef: string
  displayName: string
  email: string | null
  ownershipRef: string
  joinedAt: number
}>

export type DirectoryMember = Readonly<{
  kind: 'member'
  principalRef: string
  displayName: string
  email: string | null
  membershipRef: string
  role: 'admin' | 'member'
  lifecycle: 'active'
  joinedAt: number
}>

export type TeamDirectoryData = Readonly<{
  accountRef: string
  owner: DirectoryOwner
  members: DirectoryMember[]
}>

export type AeTeamDirectoryTableProps = Readonly<{
  directory: TeamDirectoryData
}>

type DirectoryRow =
  | (DirectoryOwner & { roleLabel: 'Owner'; statusLabel: 'Active' })
  | (DirectoryMember & { roleLabel: 'Admin' | 'Member'; statusLabel: 'Active' })

export function AeTeamDirectoryTable({ directory }: AeTeamDirectoryTableProps): ReactElement {
  const [searchTerm, setSearchTerm] = useState('')

  const allRows: DirectoryRow[] = [
    { ...directory.owner, roleLabel: 'Owner', statusLabel: 'Active' },
    ...directory.members.map((member) => ({
      ...member,
      roleLabel: member.role === 'admin' ? 'Admin' as const : 'Member' as const,
      statusLabel: 'Active' as const,
    })),
  ]

  const normalizedFilter = searchTerm.trim().toLowerCase()
  const filteredRows = normalizedFilter.length === 0
    ? allRows
    : allRows.filter((row) => row.displayName.toLowerCase().includes(normalizedFilter))

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <label className="relative flex-1 max-w-sm">
          <span className="sr-only">Filter team members</span>
          <input
            type="search"
            role="searchbox"
            placeholder="Filter by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>
      </div>

      <div className="rounded-md border">
        <table aria-label="Team directory" className="w-full caption-bottom text-sm text-left">
          <thead className="border-b bg-muted/50 text-xs text-muted-foreground font-medium uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Email</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRows.map((row) => (
              <tr key={row.kind === 'owner' ? row.ownershipRef : row.membershipRef} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{row.displayName}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
                    {row.roleLabel}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-success/15 text-success">
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {`${formatUtcTimestamp(row.joinedAt)} UTC`}
                </td>
              </tr>
            ))}
            {directory.members.length === 0 && (
              <tr>
                <td colSpan={5} className="p-0">
                  <AeTableEmptyState
                    title="No other members in this workspace"
                    description="Invite collaborators or administrators to access workspace resources."
                    action={(
                      <a
                        href="#invite"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        + Invite Member
                      </a>
                    )}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

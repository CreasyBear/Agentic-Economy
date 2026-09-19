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

export type DirectoryRow =
  | (DirectoryOwner & { roleLabel: 'Owner'; statusLabel: 'Active' })
  | (DirectoryMember & { roleLabel: 'Admin' | 'Member'; statusLabel: 'Active' })

export type TeamDirectoryRoleFilter = 'all' | 'owner' | 'admin' | 'member'

export type TeamDirectoryRoleCounts = Readonly<{
  all: number
  owner: number
  admin: number
  member: number
}>

export function toDirectoryRows(directory: TeamDirectoryData): DirectoryRow[] {
  return [
    { ...directory.owner, roleLabel: 'Owner', statusLabel: 'Active' },
    ...directory.members.map((member) => ({
      ...member,
      roleLabel: member.role === 'admin' ? 'Admin' as const : 'Member' as const,
      statusLabel: 'Active' as const,
    })),
  ]
}

export function roleCounts(directory: TeamDirectoryData | undefined): TeamDirectoryRoleCounts {
  if (directory === undefined) {
    return { all: 0, owner: 0, admin: 0, member: 0 }
  }
  const admin = directory.members.filter((member) => member.role === 'admin').length
  const member = directory.members.filter((member) => member.role === 'member').length
  return {
    all: 1 + directory.members.length,
    owner: 1,
    admin,
    member,
  }
}

export function matchesSearch(row: DirectoryRow, normalizedFilter: string): boolean {
  if (normalizedFilter.length === 0) return true
  if (row.displayName.toLowerCase().includes(normalizedFilter)) return true
  if (row.email !== null && row.email.toLowerCase().includes(normalizedFilter)) return true
  return false
}

export function matchesRole(row: DirectoryRow, roleFilter: TeamDirectoryRoleFilter): boolean {
  switch (roleFilter) {
    case 'all':
      return true
    case 'owner':
      return row.kind === 'owner'
    case 'admin':
      return row.kind === 'member' && row.role === 'admin'
    case 'member':
      return row.kind === 'member' && row.role === 'member'
    default: {
      const _exhaustive: never = roleFilter
      return _exhaustive
    }
  }
}

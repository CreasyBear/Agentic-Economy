export type TeamRole = 'Owner' | 'Admin' | 'Member'
export type TeamMemberView = Readonly<{
  key: string
  name: string
  email: string | null
  role: TeamRole
  joinedAt: number
}>
export type TeamRolesView = Readonly<{
  accountRef?: string
  members: readonly TeamMemberView[]
  inviteAvailability: 'available' | 'role_restricted' | 'organization_unset' | 'binding_unavailable'
}>
export type TeamRolesPageProps = TeamRolesView & Readonly<{ transferRequested?: boolean }>

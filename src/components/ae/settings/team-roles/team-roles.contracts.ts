import type { FormEvent } from 'react'

export type TeamRole = 'Owner' | 'Admin' | 'Member'
export type TeamMemberView = Readonly<{
  key: string
  name: string
  email: string | null
  role: TeamRole
  joinedAt: number
}>
export type TeamRolesView = Readonly<{
  members: readonly TeamMemberView[]
  inviteAvailability: 'available' | 'role_restricted' | 'organization_unset' | 'binding_unavailable'
}>
export type TeamRolesPageProps = TeamRolesView

export type TeamMemberRowsProps = Pick<TeamRolesView, 'members'>

export type TeamInviteFormProps = Readonly<{
  email: string
  role: 'admin' | 'member'
  pending: boolean
  message: string
  error: string
  onEmailChange: (email: string) => void
  onRoleChange: (role: 'admin' | 'member') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}>

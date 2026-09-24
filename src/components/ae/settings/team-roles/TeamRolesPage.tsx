import { SettingsEmptyState, SettingsPage } from '../settings-shell/components/SettingsSections'
import { TeamInviteForm } from './components/TeamInviteForm'
import { TeamMemberRows } from './components/TeamMemberRows'
import type { TeamRolesPageProps } from './team-roles.contracts'
import { useInviteTeamMember } from './useInviteTeamMember'

export function TeamRolesPage({ members, canInvite }: TeamRolesPageProps) {
  const invite = useInviteTeamMember()
  return <SettingsPage title="Team & roles" description="People who can act for this workspace and their Agentic Economy roles.">
    {members.length > 0 ? <TeamMemberRows members={members} /> : <SettingsEmptyState title="No members yet" description="Invite someone to work in this workspace." />}
    {canInvite && <TeamInviteForm email={invite.email} role={invite.role} pending={invite.pending} message={invite.message} error={invite.error} onEmailChange={invite.setEmail} onRoleChange={invite.setRole} onSubmit={invite.submit} />}
  </SettingsPage>
}

import { SettingsEmptyState, SettingsPage } from '../settings-shell/components/SettingsSections'
import { TeamInviteForm } from './components/TeamInviteForm'
import { TeamMemberRows } from './components/TeamMemberRows'
import type { TeamRolesPageProps } from './team-roles.contracts'
import { useInviteTeamMember } from './useInviteTeamMember'

export function TeamRolesPage({ members, inviteAvailability }: TeamRolesPageProps) {
  const invite = useInviteTeamMember()
  const inviteReason = {
    role_restricted: 'Only workspace owners and admins can invite members. Ask an owner or admin to send the invitation.',
    organization_unset: 'Invitations become available once your Business is set up. If you just created it, refresh in a few seconds.',
    binding_unavailable: 'This workspace has an unavailable organization binding. Ask the workspace owner to resolve its active bindings before inviting members.',
  } as const
  return <SettingsPage title="Team & roles" description="People who can act for this workspace and their Agentic Economy roles.">
    {members.length > 0 ? <TeamMemberRows members={members} /> : inviteAvailability === 'available' ? <SettingsEmptyState title="No members yet" description="Invite someone to work in this workspace." /> : null}
    {inviteAvailability === 'available'
      ? <TeamInviteForm email={invite.email} role={invite.role} pending={invite.pending} message={invite.message} error={invite.error} emailError={invite.emailError} onEmailChange={invite.setEmail} onRoleChange={invite.setRole} onSubmit={invite.submit} />
      : <SettingsEmptyState title="Invitations unavailable" description={inviteReason[inviteAvailability]} />}
  </SettingsPage>
}

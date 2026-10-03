import { TeamMembers } from '@/components/arc/blocks/team-members/team-members'
import { SettingsPage } from '../settings-shell/components/SettingsSections'
import type { TeamRolesPageProps } from './team-roles.contracts'
import { useInviteTeamMember } from './useInviteTeamMember'

const inviteReasons = {
  role_restricted: 'Only workspace owners and admins can invite members. Ask an owner or admin to send the invitation.',
  organization_unset: 'Invitations become available once your Business is set up. If you just created it, refresh in a few seconds.',
  binding_unavailable: 'This workspace has an unavailable organization binding. Ask the workspace owner to resolve its active bindings before inviting members.',
} as const

export function TeamRolesPage({ members, inviteAvailability }: TeamRolesPageProps) {
  const invite = useInviteTeamMember()
  return <SettingsPage title="Team & roles" description="People who can act for this workspace and their Agentic Economy roles.">
    <TeamMembers
      members={members}
      invitation={inviteAvailability === 'available'
        ? { kind: 'available', ...invite, onEmailChange: invite.setEmail, onRoleChange: invite.setRole, onSubmit: invite.submit }
        : { kind: 'unavailable', reason: inviteReasons[inviteAvailability] }}
    />
  </SettingsPage>
}

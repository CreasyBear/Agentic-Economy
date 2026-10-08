import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { useEffect, useRef, useState } from 'react'
import { readTeamRolesServer } from './team-roles.functions'
import { SettingsPage } from '../settings-shell/components/SettingsSections'
import type { TeamRolesPageProps } from './team-roles.contracts'
import { TeamAccessManagement } from './TeamAccessManagement'
import { useInviteTeamMember } from './useInviteTeamMember'
import { Skeleton } from '@/components/ui/skeleton'

const inviteReasons = {
  role_restricted: 'Only workspace owners and admins can invite members. Ask an owner or admin to send the invitation.',
  organization_unset: 'Invitations become available once your Business is set up. If you just created it, refresh in a few seconds.',
  binding_unavailable: 'This workspace has an unavailable organization binding. Ask the workspace owner to resolve its active bindings before inviting members.',
} as const

export function TeamRolesPage(props: TeamRolesPageProps) {
  return <TeamRolesWorkspace key={props.accountRef} {...props} />
}

export function TeamRolesPending() {
  return <div role="status" aria-label="Loading team and roles" aria-busy="true" className="grid gap-5">
    <Skeleton className="h-8 w-44" /><Skeleton className="h-64 w-full rounded-xl" />
  </div>
}

function TeamRolesWorkspace({ accountRef, members, inviteAvailability, transferRequested = false }: TeamRolesPageProps) {
  const [roster, setRoster] = useState(members)
  useEffect(() => setRoster(members), [members])
  const saveActionRef = useRef<HTMLButtonElement | null>(null)
  const headingRef = useRef<HTMLDivElement | null>(null)
  const invite = useInviteTeamMember(transferRequested, accountRef)
  return <AeNavigationSafetyBoundary state={{ dirty: invite.pending, pending: invite.pending && !invite.unconfirmed, saveOutcome: invite.unconfirmed ? 'outcome_unknown' : 'idle' }}
    title="Leave an unconfirmed invitation?" pendingTitle="Invitation is still pending"
    description="Leaving loses the original invitation's recovery context. Stay and refresh pending invitations to check this address and role before sending again."
    pendingDescription="Wait for the identity provider's response before leaving or sending another invitation."
    cancelLabel="Check this invitation" saveActionRef={saveActionRef} headingRef={headingRef}>
    <div ref={headingRef} tabIndex={-1}><SettingsPage title="Team & roles" description="People who can act for this workspace and their Agentic Economy roles.">
    {transferRequested ? <p>Invite the next owner and wait for their accepted membership to be recorded. <a href="/owner/settings/workspace" className="underline underline-offset-4">Return to ownership transfer</a>.</p> : null}
    <TeamAccessManagement members={roster} {...(accountRef === undefined ? {} : { accountRef })} inviteActionRef={saveActionRef}
      {...(inviteAvailability === 'available' ? { invitation: invite } : { inviteReason: inviteReasons[inviteAvailability] })}
      onRecordedRead={async view => { const recorded = await readTeamRolesServer(); if (recorded.accountRef !== view.accountRef) throw new Error('workspace_changed'); setRoster(recorded.members); invite.observeInvitations(view) }} />
  </SettingsPage></div></AeNavigationSafetyBoundary>
}

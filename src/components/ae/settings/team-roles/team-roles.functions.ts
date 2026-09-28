import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { degrade } from '@/lib/observability/degrade'
import { api } from '../../../../../convex/_generated/api'
import { callSourceQuery } from '@/lib/server/convex-source'
import type { TeamMemberView, TeamRolesView } from './team-roles.contracts'

export const readTeamRolesServer = createServerFn({ method: 'GET' }).handler(async (): Promise<TeamRolesView> => {
  const directory = await callSourceQuery(api.workspaceTeam.listDirectory, {})
  const invitation = await callSourceQuery(api.workspaceTeam.invitationContext, {})
  const people = [directory.owner, ...directory.members]
  const members: TeamMemberView[] = await Promise.all(people.map(async (person) => {
    const clerkUserId = person.clerkUserId
    const clerk = clerkUserId === null
      ? null
      : await Promise.resolve().then(() => clerkClient().users.getUser(clerkUserId))
          .catch((cause) => degrade(cause, null, { site: 'readTeamRolesServer.memberName', reason: 'source_unavailable' }))
    const clerkName = clerk && [clerk.firstName, clerk.lastName].filter(Boolean).join(' ').trim()
    const name = clerkName || person.displayName
    return {
      key: person.kind === 'owner' ? person.ownershipRef : person.membershipRef,
      name,
      email: clerk?.primaryEmailAddress?.emailAddress ?? person.email,
      role: person.kind === 'owner' ? 'Owner' : person.role === 'admin' ? 'Admin' : 'Member',
      joinedAt: person.joinedAt,
    }
  }))
  return { members, inviteAvailability: invitation.kind }
})

export const inviteTeamMemberServer = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.email(), role: z.enum(['admin', 'member']) }))
  .handler(async ({ data }) => {
    const session = await auth()
    if (!session.userId) throw new Error('Sign in to invite a member.')
    const invitation = await callSourceQuery(api.workspaceTeam.invitationContext, {})
    if (invitation.kind !== 'available') throw new Error('Invitations are no longer available. Refresh Team & roles to see why.')
    await clerkClient().organizations.createOrganizationInvitation({
      organizationId: invitation.organizationId,
      inviterUserId: session.userId,
      emailAddress: data.email.trim(),
      role: data.role === 'admin' ? 'org:admin' : 'org:member',
      redirectUrl: '/owner/settings/team',
    })
    return { invited: true as const }
  })

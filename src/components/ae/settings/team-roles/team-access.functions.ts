import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { api } from '../../../../../convex/_generated/api'
import { callSourceQuery } from '@/lib/server/convex-source'
import { readClerkMfaConsequenceProof } from '@/lib/server/clerk-consequence-proof'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import type { TeamAccessView, TeamAccessResult } from './team-access.contracts'

async function context() {
  const session = await auth()
  if (!session.userId) throw new Error('authentication_required')
  const directory = await callSourceQuery(api.workspaceTeam.listDirectory, {})
  const invitation = await callSourceQuery(api.workspaceTeam.invitationContext, {})
  const organizationId = invitation.kind === 'available' && invitation.accountRef === directory.accountRef && session.orgId === invitation.organizationId
    ? invitation.organizationId : null
  return { session, directory, organizationId }
}

export const readTeamAccessServer = createServerFn({ method: 'GET' })
  .inputValidator(z.strictObject({ memberOffset: z.number().int().min(0).max(1_000_000).optional(), invitationOffset: z.number().int().min(0).max(1_000_000).optional() }))
  .handler(async ({ data }): Promise<TeamAccessView> => {
  const memberOffset = data.memberOffset ?? 0
  const invitationOffset = data.invitationOffset ?? 0
  const { session, directory, organizationId } = await context()
  const canManageMembers = organizationId !== null && directory.owner.clerkUserId === session.userId
  const organizations = clerkClient().organizations
  const invitations = organizationId === null ? null : await organizations.getOrganizationInvitationList({ organizationId, status: ['pending'], limit: 100, offset: invitationOffset })
  const upstream = organizationId === null || !canManageMembers ? null : await organizations.getOrganizationMembershipList({ organizationId, limit: 100, offset: memberOffset })
  return {
    accountRef: directory.accountRef, accountRevision: directory.accountRevision, ownershipRevision: directory.owner.revision,
    ownerName: directory.owner.displayName, canManageMembers, canManageInvitations: organizationId !== null,
    members: directory.members.flatMap(member => {
      const recorded = upstream?.data.find(row => row.publicUserData?.userId === member.clerkUserId)
      // A missing or drifting identity record is a barrier, never speculative access.
      return recorded === undefined || member.clerkUserId === null || recorded.role !== `org:${member.role}` ? [] : [{
        membershipRef: member.membershipRef, revision: member.revision, userId: member.clerkUserId,
        name: member.displayName, role: member.role, upstreamUpdatedAt: recorded.updatedAt,
      }]
    }),
    invitations: invitations?.data.flatMap(row => row.role === 'org:admin' || row.role === 'org:member' ? [{
      invitationId: row.id, email: row.emailAddress, role: row.role, updatedAt: row.updatedAt, expiresAt: row.expiresAt,
    }] : []) ?? [],
    membersComplete: upstream === null || memberOffset + upstream.data.length >= upstream.totalCount,
    nextMemberOffset: upstream !== null && memberOffset + upstream.data.length < upstream.totalCount ? memberOffset + upstream.data.length : null,
    invitationsComplete: invitations === null || invitationOffset + invitations.data.length >= invitations.totalCount,
    nextInvitationOffset: invitations !== null && invitationOffset + invitations.data.length < invitations.totalCount ? invitationOffset + invitations.data.length : null,
  }
})

const revisionFields = {
  accountRef: z.string().min(1).max(200), accountRevision: z.number().int().nonnegative(),
  ownershipRevision: z.number().int().nonnegative(),
}
export const changeTeamAccessServer = createServerFn({ method: 'POST' })
  .inputValidator(z.strictObject({ ...revisionFields, membershipRef: z.string().min(1).max(200),
    membershipRevision: z.number().int().nonnegative(), upstreamUpdatedAt: z.number().int().nonnegative(),
    action: z.enum(['admin', 'member', 'remove']),
  }))
  .handler(async ({ data }): Promise<TeamAccessResult> => {
    try {
      const { session, directory, organizationId } = await context()
      if (organizationId === null || directory.owner.clerkUserId !== session.userId) return { kind: 'refused', code: 'forbidden' }
      if (directory.accountRef !== data.accountRef || directory.accountRevision !== data.accountRevision
        || directory.owner.revision !== data.ownershipRevision) return { kind: 'refused', code: 'stale' }
      const member = directory.members.find(row => row.membershipRef === data.membershipRef)
      if (member !== undefined && member.clerkUserId !== null && member.clerkUserId === directory.owner.clerkUserId) return { kind: 'refused', code: 'last_owner' }
      if (member === undefined || member.revision !== data.membershipRevision || member.clerkUserId === null) return { kind: 'refused', code: 'stale' }
      if (await readClerkMfaConsequenceProof() === undefined) return { kind: 'refused', code: 'mfa_reverification_required' }
      const organizations = clerkClient().organizations
      const current = await organizations.getOrganizationMembershipList({ organizationId, userId: [member.clerkUserId], limit: 2 })
      const target = current.data[0]
      if (current.totalCount !== 1 || target === undefined || target.updatedAt !== data.upstreamUpdatedAt
        || target.role !== `org:${member.role}`) return { kind: 'refused', code: 'stale' }
      if (target.role === 'org:admin' && data.action !== 'admin') {
        const admins = await organizations.getOrganizationMembershipList({ organizationId, role: ['org:admin'], limit: 2 })
        if (admins.totalCount < 2) return { kind: 'refused', code: 'last_admin' }
      }
      if (data.action === 'remove') await organizations.deleteOrganizationMembership({ organizationId, userId: member.clerkUserId })
      else if (data.action !== member.role) await organizations.updateOrganizationMembership({ organizationId, userId: member.clerkUserId, role: `org:${data.action}` })
      // Clerk owns identity changes. Only its verified webhook advances AE membership.
      return { kind: 'accepted' }
    } catch (cause) {
      captureRouteException(cause, { site: 'changeTeamAccessServer' })
      return { kind: 'refused', code: 'source_unavailable' }
    }
  })

export const manageTeamInvitationServer = createServerFn({ method: 'POST' })
  .inputValidator(z.strictObject({ ...revisionFields, invitationId: z.string().min(1).max(200),
    expectedUpdatedAt: z.number().int().nonnegative(), action: z.enum(['cancel', 'resend']),
  }))
  .handler(async ({ data }): Promise<TeamAccessResult> => {
    try {
      const { session, directory, organizationId } = await context()
      if (organizationId === null) return { kind: 'refused', code: 'forbidden' }
      if (directory.accountRef !== data.accountRef || directory.accountRevision !== data.accountRevision
        || directory.owner.revision !== data.ownershipRevision) return { kind: 'refused', code: 'stale' }
      const organizations = clerkClient().organizations
      const invitation = await organizations.getOrganizationInvitation({ organizationId, invitationId: data.invitationId })
      if (invitation.status !== 'pending' || invitation.updatedAt !== data.expectedUpdatedAt
        || (invitation.role !== 'org:admin' && invitation.role !== 'org:member')) return { kind: 'refused', code: 'stale' }
      // Revoke the exact original before replacement; failure never leaves two active invitations.
      await organizations.revokeOrganizationInvitation({ organizationId, invitationId: invitation.id, requestingUserId: session.userId })
      if (data.action === 'resend') await organizations.createOrganizationInvitation({
        organizationId, inviterUserId: session.userId, emailAddress: invitation.emailAddress,
        role: invitation.role, redirectUrl: '/owner/settings/team',
      })
      return { kind: 'accepted' }
    } catch (cause) {
      captureRouteException(cause, { site: 'manageTeamInvitationServer' })
      return { kind: 'refused', code: 'source_unavailable' }
    }
  })

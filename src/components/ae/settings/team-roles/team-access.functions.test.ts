import { beforeEach, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import type * as TanstackReactStartModule from '@tanstack/react-start'
const boundary = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), proof: vi.fn(), list: vi.fn(), update: vi.fn(), remove: vi.fn(),
  getInvitation: vi.fn(), revoke: vi.fn(), invite: vi.fn(), pending: vi.fn() }))
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: boundary.auth, clerkClient: () => ({ organizations: {
  getOrganizationMembershipList: boundary.list, updateOrganizationMembership: boundary.update, deleteOrganizationMembership: boundary.remove,
  getOrganizationInvitation: boundary.getInvitation, revokeOrganizationInvitation: boundary.revoke, createOrganizationInvitation: boundary.invite,
  getOrganizationInvitationList: boundary.pending,
} }) }))
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({ handler: (handler: unknown) => handler, inputValidator: () => ({ handler: (handler: unknown) => handler }) }),
}))
vi.mock('@/lib/server/convex-source', () => ({ callSourceQuery: boundary.query }))
vi.mock('@/lib/server/clerk-consequence-proof', () => ({ readClerkMfaConsequenceProof: boundary.proof }))
vi.mock('@/lib/observability/capture-route-exception', () => ({ captureRouteException: vi.fn() }))
import { changeTeamAccessServer, manageTeamInvitationServer, readTeamAccessServer } from './team-access.functions'
const directory = { accountRef: 'account:1', accountRevision: 4, owner: { clerkUserId: 'user_owner', revision: 2 },
  members: [{ membershipRef: 'membership:1', revision: 3, clerkUserId: 'user_member', role: 'admin', displayName: 'Recorded member' }] }
const memberCommand = { accountRef: 'account:1', accountRevision: 4, ownershipRevision: 2,
  membershipRef: 'membership:1', membershipRevision: 3, upstreamUpdatedAt: 10, action: 'member' as const }
const invitationCommand = { accountRef: 'account:1', accountRevision: 4, ownershipRevision: 2,
  invitationId: 'orginv_1', expectedUpdatedAt: 10, action: 'resend' as const }
beforeEach(() => {
  vi.resetAllMocks()
  boundary.auth.mockResolvedValue({ userId: 'user_owner', orgId: 'org_1' })
  boundary.proof.mockResolvedValue({ subject: 'user_owner' })
  boundary.query.mockImplementation(ref => getFunctionName(ref) === 'workspaceTeam:listDirectory' ? directory : { kind: 'available', accountRef: 'account:1', organizationId: 'org_1' })
  boundary.list.mockImplementation(params => params.role ? { totalCount: 2, data: [] } : { totalCount: 1, data: [{ role: 'org:admin', updatedAt: 10, publicUserData: { userId: 'user_member' } }] })
  boundary.getInvitation.mockResolvedValue({ id: 'orginv_1', emailAddress: 'invitee@example.test', role: 'org:member', status: 'pending', updatedAt: 10 })
  boundary.pending.mockResolvedValue({ totalCount: 0, data: [] })
})
it('changes access through Clerk without speculative membership writes', async () => {
  expect(await changeTeamAccessServer({ data: memberCommand })).toEqual({ kind: 'accepted' })
  expect(boundary.update).toHaveBeenCalledWith({ organizationId: 'org_1', userId: 'user_member', role: 'org:member' })
  expect(boundary.remove).not.toHaveBeenCalled()
})
it('requires the recorded owner and active identity organisation', async () => {
  boundary.auth.mockResolvedValue({ userId: 'user_member', orgId: 'org_1' })
  expect(await changeTeamAccessServer({ data: memberCommand })).toEqual({ kind: 'refused', code: 'forbidden' })
  boundary.auth.mockResolvedValue({ userId: 'user_owner', orgId: 'org_other' })
  expect(await changeTeamAccessServer({ data: memberCommand })).toEqual({ kind: 'refused', code: 'forbidden' })
  expect(boundary.update).not.toHaveBeenCalled()
})
it('blocks stale membership, ownership and upstream revisions before writes', async () => {
  for (const data of [{ ...memberCommand, membershipRevision: 2 }, { ...memberCommand, ownershipRevision: 1 }, { ...memberCommand, upstreamUpdatedAt: 9 }]) {
    expect(await changeTeamAccessServer({ data })).toEqual({ kind: 'refused', code: 'stale' })
  }
  expect(boundary.update).not.toHaveBeenCalled()
})
it('never changes the owner via a membership action', async () => {
  expect(await changeTeamAccessServer({ data: { ...memberCommand, membershipRef: 'ownership:1', action: 'remove' } })).toEqual({ kind: 'refused', code: 'stale' })
  expect(boundary.remove).not.toHaveBeenCalled()
})
it('requires current MFA and preserves the final identity admin', async () => {
  boundary.proof.mockResolvedValueOnce(undefined)
  expect(await changeTeamAccessServer({ data: memberCommand })).toEqual({ kind: 'refused', code: 'mfa_reverification_required' })
  boundary.list.mockImplementation(params => params.role ? { totalCount: 1, data: [] } : { totalCount: 1, data: [{ role: 'org:admin', updatedAt: 10 }] })
  expect(await changeTeamAccessServer({ data: { ...memberCommand, action: 'remove' } })).toEqual({ kind: 'refused', code: 'last_admin' })
  expect(boundary.update).not.toHaveBeenCalled(); expect(boundary.remove).not.toHaveBeenCalled()
})
it('removes the exact recorded member through Clerk', async () => {
  expect(await changeTeamAccessServer({ data: { ...memberCommand, action: 'remove' } })).toEqual({ kind: 'accepted' })
  expect(boundary.remove).toHaveBeenCalledWith({ organizationId: 'org_1', userId: 'user_member' })
})
it('replaces a pending invitation only after revoking the original', async () => {
  expect(await manageTeamInvitationServer({ data: invitationCommand })).toEqual({ kind: 'accepted' })
  expect(boundary.revoke).toHaveBeenCalledWith({ organizationId: 'org_1', invitationId: 'orginv_1', requestingUserId: 'user_owner' })
  expect(boundary.invite).toHaveBeenCalledWith({ organizationId: 'org_1', inviterUserId: 'user_owner', emailAddress: 'invitee@example.test', role: 'org:member', redirectUrl: '/owner/settings/team' })
  expect(boundary.revoke.mock.invocationCallOrder[0]).toBeLessThan(boundary.invite.mock.invocationCallOrder[0] ?? Infinity)
})
it('does not resend accepted or stale invitations, or create a second invitation after an uncertain revoke', async () => {
  boundary.getInvitation.mockResolvedValueOnce({ status: 'accepted', updatedAt: 10 })
  expect(await manageTeamInvitationServer({ data: invitationCommand })).toEqual({ kind: 'refused', code: 'stale' })
  boundary.revoke.mockRejectedValueOnce(new Error('unavailable'))
  expect(await manageTeamInvitationServer({ data: invitationCommand })).toEqual({ kind: 'refused', code: 'source_unavailable' })
  expect(boundary.invite).not.toHaveBeenCalled()
})
it('keeps recorded role drift out of actionable membership controls', async () => {
  boundary.list.mockResolvedValue({ totalCount: 1, data: [{ role: 'org:member', updatedAt: 11, publicUserData: { userId: 'user_member' } }] })
  expect((await readTeamAccessServer({ data: {} })).members).toEqual([])
})

it('pages beyond 100 upstream members instead of silently losing later recorded members', async () => {
  const members = Array.from({ length: 101 }, (_, i) => ({ membershipRef: `membership:${i}`, revision: 1, clerkUserId: `user_${i}`, role: 'member', displayName: `Member ${i}` }))
  boundary.query.mockImplementation(ref => getFunctionName(ref) === 'workspaceTeam:listDirectory' ? { ...directory, members } : { kind: 'available', accountRef: 'account:1', organizationId: 'org_1' })
  boundary.list.mockImplementation(({ offset = 0, limit }) => ({ totalCount: 101, data: members.slice(offset, offset + limit).map(member => ({ role: 'org:member', updatedAt: 10, publicUserData: { userId: member.clerkUserId } })) }))
  const first = await readTeamAccessServer({ data: {} })
  expect(first.members).toHaveLength(100)
  expect(first).toMatchObject({ membersComplete: false, nextMemberOffset: 100 })
  const next = await readTeamAccessServer({ data: { memberOffset: 100 } })
  expect(next.members).toEqual([expect.objectContaining({ membershipRef: 'membership:100' })])
  expect(next).toMatchObject({ membersComplete: true, nextMemberOffset: null })
  expect(boundary.list).toHaveBeenLastCalledWith({ organizationId: 'org_1', limit: 100, offset: 100 })
})

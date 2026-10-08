// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { FormEvent } from 'react'
import type { TeamAccessView } from './team-access.contracts'
const boundary = vi.hoisted(() => ({ invite: vi.fn() }))
vi.mock('./team-roles.functions', () => ({ inviteTeamMemberServer: boundary.invite }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
import { useInviteTeamMember } from './useInviteTeamMember'
const event = { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>
const view: TeamAccessView = { accountRef: 'account:original', accountRevision: 4, ownershipRevision: 2, canManageMembers: true, canManageInvitations: true,
  members: [], invitations: [], membersComplete: true, nextMemberOffset: null, invitationsComplete: true, nextInvitationOffset: null }
beforeEach(() => { vi.resetAllMocks(); boundary.invite.mockRejectedValue(new Error('response lost')) })
it('freezes email and role after uncertainty and only observes same-account confirmed pending invitations', async () => {
  const { result } = renderHook(() => useInviteTeamMember(false, view.accountRef))
  act(() => { result.current.setEmail('original@example.test'); result.current.setRole('admin') })
  await act(async () => result.current.submit(event))
  expect(result.current.unconfirmed).toBe(true)
  act(() => { result.current.setEmail('different@example.test'); result.current.setRole('member'); result.current.submit(event) })
  expect(result.current.email).toBe('original@example.test'); expect(result.current.role).toBe('admin')
  expect(boundary.invite).toHaveBeenCalledOnce()
  act(() => result.current.observeInvitations({ ...view, accountRef: 'account:different' }))
  expect(result.current.unconfirmed).toBe(true)
  act(() => result.current.observeInvitations({ ...view, invitationsComplete: false, nextInvitationOffset: 100 }))
  expect(result.current.unconfirmed).toBe(true)
  act(() => result.current.observeInvitations({ ...view, invitations: [{ invitationId: 'invite:original', email: 'original@example.test', role: 'org:admin', updatedAt: 10, expiresAt: 20 }] }))
  expect(result.current.unconfirmed).toBe(false)
  expect(result.current.message).toContain('pending invitation'); expect(result.current.email).toBe('')
  expect(boundary.invite).toHaveBeenCalledOnce()
})
it('does not unlock a wrong-role pending invitation; complete absence is disclosed without claiming original failure', async () => {
  const { result } = renderHook(() => useInviteTeamMember(false, view.accountRef))
  act(() => result.current.setEmail('original@example.test'))
  await act(async () => result.current.submit(event))
  act(() => result.current.observeInvitations({ ...view, invitations: [{ invitationId: 'invite:wrong', email: 'original@example.test', role: 'org:admin', updatedAt: 10, expiresAt: 20 }] }))
  expect(result.current.unconfirmed).toBe(true)
  act(() => result.current.observeInvitations(view))
  expect(result.current.unconfirmed).toBe(false)
  expect(result.current.error).toContain('in case it was accepted')
})

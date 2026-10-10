// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ invite: vi.fn(), read: vi.fn(), recorded: vi.fn() }))
vi.mock('@/components/ae/settings/team-roles/team-roles.functions', () => ({ inviteTeamMemberServer: boundary.invite, readTeamRolesServer: boundary.recorded }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
vi.mock('@/components/ae/settings/team-roles/team-access.functions', () => ({ readTeamAccessServer: boundary.read, changeTeamAccessServer: vi.fn(), manageTeamInvitationServer: vi.fn() }))
vi.mock('@/lib/client/useTypedReverification', () => ({ useTypedReverification: (request: unknown) => request }))
import { TeamRolesPage } from '@/components/ae/settings/team-roles/TeamRolesPage'
import type { TeamMemberView } from '@/components/ae/settings/team-roles/team-roles.contracts'

const members: readonly TeamMemberView[] = [
  { key: 'owner:1', name: 'Jamie Owner', email: 'jamie@example.test', role: 'Owner', joinedAt: 1 },
  { key: 'member:2', name: 'Morgan Analyst', email: null, role: 'Admin', joinedAt: 2 },
  { key: 'member:3', name: 'Sam Builder', email: 'sam@example.test', role: 'Member', joinedAt: 3 },
]
beforeEach(() => {
  boundary.read.mockResolvedValue({ accountRef: 'account:1', accountRevision: 1, ownershipRevision: 1, canManageMembers: false, canManageInvitations: true, members: [], invitations: [], membersComplete: true, nextMemberOffset: null, invitationsComplete: true, nextInvitationOffset: null })
  boundary.recorded.mockResolvedValue({ accountRef: 'account:1', members })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

async function openInvite() {
  fireEvent.click(screen.getByRole('button', { name: 'Invite a member' }))
  return await screen.findByRole('dialog')
}
describe('REUI Team composition', () => {
  it('searches recorded names, emails and roles without creating fictional members', async () => {
    render(<TeamRolesPage accountRef="account:1" members={members} inviteAvailability="available" />)
    const table = screen.getByRole('table', { name: 'Workspace members' })
    expect(within(table).getByText('Jamie Owner')).toBeVisible()
    expect(within(table).getByText('Email not available')).toBeVisible()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a member' }), { target: { value: ' ADMIN ' } })
    expect(within(table).getByText('Morgan Analyst')).toBeVisible()
    expect(within(table).queryByText('Sam Builder')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a member' }), { target: { value: 'nobody' } })
    expect(within(table).getByText('No members match this search.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clear find a member' }))
    expect(within(table).getByText('Sam Builder')).toBeVisible()
    expect(boundary.invite).not.toHaveBeenCalled()
  })

  it.each(['role_restricted', 'organization_unset', 'binding_unavailable'] as const)('retains members while %s prevents invitations', availability => {
    render(<TeamRolesPage members={members} inviteAvailability={availability} />)
    expect(screen.getByRole('table', { name: 'Workspace members' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Invite a member' })).toBeNull()
  })

  it('keeps pending submission and accepted-send evidence without adding a member', async () => {
    let resolve!: () => void
    let finishRead!: (value: unknown) => void
    boundary.read.mockReturnValueOnce(new Promise(done => { finishRead = done }))
    boundary.invite.mockReturnValueOnce(new Promise<void>(done => { resolve = done }))
    render(<TeamRolesPage accountRef="account:1" members={members} inviteAvailability="available" />)
    const dialog = await openInvite()
    fireEvent.change(within(dialog).getByLabelText('Email address'), { target: { value: 'new@example.test' } })
    fireEvent.change(within(dialog).getByLabelText('Workspace role'), { target: { value: 'admin' } })
    const form = within(dialog).getByRole('button', { name: 'Send invitation' }).closest('form')!
    fireEvent.submit(form); fireEvent.submit(form)
    expect(boundary.invite).toHaveBeenCalledExactlyOnceWith({ data: { expectedAccountRef: 'account:1', email: 'new@example.test', role: 'admin' } })
    expect(within(dialog).getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    finishRead({ accountRef: 'account:1', accountRevision: 1, ownershipRevision: 1, canManageMembers: false, canManageInvitations: true, members: [], invitations: [], membersComplete: true, nextMemberOffset: null, invitationsComplete: true, nextInvitationOffset: null })
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Pending invitations', hidden: true })).not.toBeNull())
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sending…' })).toBeDisabled()
    resolve()
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('Invitation sent to new@example.test. The member appears here after accepting.'))
    expect(within(dialog).getByLabelText('Email address')).toHaveValue('')
    expect(document.querySelector('table')?.textContent).not.toContain('new@example.test')
  })

  it('preserves an uncertain invitation and observes it before another send', async () => {
    boundary.invite.mockRejectedValueOnce(new Error('transport unavailable'))
    render(<TeamRolesPage accountRef="account:1" members={members} inviteAvailability="available" />)
    const dialog = await openInvite()
    const email = within(dialog).getByLabelText('Email address')
    const form = within(dialog).getByRole('button', { name: 'Send invitation' }).closest('form')!
    fireEvent.change(email, { target: { value: 'bad-email' } }); fireEvent.submit(form)
    expect(email).toHaveFocus(); expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(boundary.invite).not.toHaveBeenCalled()
    fireEvent.change(email, { target: { value: 'new@example.test' } }); fireEvent.submit(form)
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('could not be confirmed'))
    expect(email).toHaveValue('new@example.test'); expect(email).toBeDisabled()
    boundary.read.mockResolvedValueOnce({ accountRef: 'account:1', accountRevision: 1, ownershipRevision: 1, canManageMembers: false, canManageInvitations: true, members: [], invitations: [{ invitationId: 'invite:1', email: 'new@example.test', role: 'org:member', updatedAt: 1, expiresAt: 2 }], membersComplete: true, nextMemberOffset: null, invitationsComplete: true, nextInvitationOffset: null })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check pending invitations' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const reopened = await openInvite()
    expect(within(reopened).getByRole('status')).toHaveTextContent('A pending invitation to new@example.test is confirmed')
    expect(boundary.invite).toHaveBeenCalledTimes(1)
  })
})

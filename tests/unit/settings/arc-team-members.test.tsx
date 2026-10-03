// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ invite: vi.fn() }))
vi.mock('@/components/ae/settings/team-roles/team-roles.functions', () => ({ inviteTeamMemberServer: boundary.invite }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
import { TeamRolesPage } from '@/components/ae/settings/team-roles/TeamRolesPage'
import type { TeamMemberView } from '@/components/ae/settings/team-roles/team-roles.contracts'

const members: readonly TeamMemberView[] = [
  { key: 'owner:1', name: 'Jamie Owner', email: 'jamie@example.test', role: 'Owner', joinedAt: 1 },
  { key: 'member:2', name: 'Morgan Analyst', email: null, role: 'Admin', joinedAt: 2 },
  { key: 'member:3', name: 'Sam Builder', email: 'sam@example.test', role: 'Member', joinedAt: 3 },
]
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Arc TeamMembers binding', () => {
  it('searches real names, emails and roles without changing the invitation or member order', () => {
    render(<TeamRolesPage members={members} inviteAvailability="available" />)
    const list = screen.getByRole('list', { name: 'Workspace members' })
    expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      'JOJamie Ownerjamie@example.testOwner', 'MAMorgan AnalystEmail not availableAdmin', 'SBSam Buildersam@example.testMember',
    ])
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'invite@example.test' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a member' }), { target: { value: ' ADMIN ' } })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(list).toHaveTextContent('Morgan Analyst')
    expect(screen.getByText('3 members')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue('invite@example.test')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sam@example' } })
    expect(list).toHaveTextContent('Sam Builder')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nobody' } })
    expect(screen.getByText('No members match this search.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear member search' }))
    expect(screen.getByRole('list', { name: 'Workspace members' }).children).toHaveLength(3)
    expect(boundary.invite).not.toHaveBeenCalled()
  })

  it.each(['role_restricted', 'organization_unset', 'binding_unavailable'] as const)('retains read-only members while %s prevents invitations', (availability) => {
    render(<TeamRolesPage members={members} inviteAvailability={availability} />)
    expect(screen.getByText('Invitations unavailable')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Workspace members' }).children).toHaveLength(3)
    expect(screen.queryByLabelText('Email address')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()
  })

  it('shows the real pending and accepted-send result without adding a fictional member', async () => {
    let resolve!: () => void
    boundary.invite.mockReturnValueOnce(new Promise<void>(done => { resolve = done }))
    render(<TeamRolesPage members={members} inviteAvailability="available" />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.test' } })
    fireEvent.change(screen.getByLabelText('Workspace role'), { target: { value: 'admin' } })
    const form = screen.getByRole('button', { name: 'Send invitation' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(boundary.invite).toHaveBeenCalledExactlyOnceWith({ data: { email: 'new@example.test', role: 'admin' } })
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    expect(screen.getByLabelText('Email address')).toBeDisabled()
    resolve()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invitation sent to new@example.test. The member appears here after accepting.'))
    expect(screen.getByRole('list', { name: 'Workspace members' }).children).toHaveLength(3)
    expect(screen.getByLabelText('Email address')).toHaveValue('')
  })

  it('focuses invalid email and preserves the draft when the external invitation fails', async () => {
    boundary.invite.mockRejectedValueOnce(new Error('transport unavailable'))
    render(<TeamRolesPage members={[]} inviteAvailability="available" />)
    const email = screen.getByLabelText('Email address')
    const form = screen.getByRole('button', { name: 'Send invitation' }).closest('form')!
    fireEvent.change(email, { target: { value: 'bad-email' } })
    fireEvent.submit(form)
    expect(email).toHaveFocus()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(boundary.invite).not.toHaveBeenCalled()
    fireEvent.change(email, { target: { value: 'new@example.test' } })
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not send the invitation. Try again.'))
    expect(email).toHaveValue('new@example.test')
    expect(screen.getByText('No members yet')).toBeInTheDocument()
  })
})

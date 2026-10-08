// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TeamAccessView } from './team-access.contracts'
const boundary = vi.hoisted(() => ({ read: vi.fn(), change: vi.fn(), manage: vi.fn() }))
vi.mock('./team-access.functions', () => ({ readTeamAccessServer: boundary.read, changeTeamAccessServer: boundary.change, manageTeamInvitationServer: boundary.manage }))
vi.mock('@/lib/client/useTypedReverification', () => ({ useTypedReverification: (request: unknown) => request }))
vi.mock('@/components/arc/button/button', () => ({ Button: ({ children, ...props }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => <button type="button" {...props}>{children}</button> }))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
import { TeamAccessManagement } from './TeamAccessManagement'
const first: TeamAccessView = { accountRef: 'account:1', accountRevision: 4, ownershipRevision: 2, canManageMembers: true, canManageInvitations: true,
  members: [{ membershipRef: 'membership:1', revision: 1, userId: 'user_one', name: 'First member', role: 'member', upstreamUpdatedAt: 10 }],
  invitations: [], membersComplete: false, nextMemberOffset: 100, invitationsComplete: true, nextInvitationOffset: null }
const next: TeamAccessView = { ...first, membersComplete: true, nextMemberOffset: null,
  members: [{ membershipRef: 'membership:101', revision: 2, userId: 'user_last', name: 'Later member', role: 'admin', upstreamUpdatedAt: 11 }] }
beforeEach(() => { vi.resetAllMocks(); boundary.read.mockResolvedValueOnce(first).mockResolvedValueOnce(next) })
afterEach(cleanup)
it('exposes the partial member page and provides actual later-page controls', async () => {
  render(<TeamAccessManagement />)
  const more = await screen.findByRole('button', { name: 'Load more members' })
  expect(screen.getByText(/Member controls are a partial list/)).toBeTruthy()
  fireEvent.click(more)
  await screen.findByText('Later member')
  expect(screen.getByText('First member')).toBeTruthy()
  expect(boundary.read).toHaveBeenLastCalledWith({ data: { memberOffset: 100 } })
  expect(screen.queryByRole('button', { name: 'Load more members' })).toBeNull()
})
it('rejects a different account revision during pagination and disables all retained controls', async () => {
  boundary.read.mockReset().mockResolvedValueOnce(first).mockResolvedValueOnce({ ...next, accountRevision: 5 })
  render(<TeamAccessManagement />)
  fireEvent.click(await screen.findByRole('button', { name: 'Load more members' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('changed during pagination'))
  expect(screen.queryByText('Later member')).toBeNull()
  expect(screen.getByRole('button', { name: 'Remove member' })).toHaveProperty('disabled', true)
})

it('rejects changed permissions even when account revisions match during pagination', async () => {
  boundary.read.mockReset().mockResolvedValueOnce(first).mockResolvedValueOnce({ ...next, canManageInvitations: false })
  render(<TeamAccessManagement />)
  fireEvent.click(await screen.findByRole('button', { name: 'Load more members' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('changed during pagination'))
  expect(screen.getByRole('button', { name: 'Remove member' })).toHaveProperty('disabled', true)
})

it('retains a newer explicit refresh when the initial read arrives late', async () => {
  let initial!: (value: TeamAccessView) => void
  boundary.read.mockReset().mockReturnValueOnce(new Promise<TeamAccessView>(resolve => { initial = resolve })).mockResolvedValueOnce(next)
  render(<TeamAccessManagement accountRef="account:1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh team access' }))
  await screen.findByText('Later member')
  await act(async () => initial(first))
  expect(screen.queryByText('First member')).toBeNull()
  expect(screen.getByText('Later member')).toBeTruthy()
})

it('hands an unconfirmed access change back to observation without leaving an unusable confirmation', async () => {
  boundary.change.mockRejectedValueOnce(new Error('response lost'))
  render(<TeamAccessManagement accountRef="account:1" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove member' }))
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm change' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.getByRole('alert').textContent).toContain('could not be confirmed')
  expect(screen.getByRole('button', { name: 'Remove member' })).toHaveProperty('disabled', true)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Refresh team access' })))
  expect(boundary.change).toHaveBeenCalledTimes(1)
})

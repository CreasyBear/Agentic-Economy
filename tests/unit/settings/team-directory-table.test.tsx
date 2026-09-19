/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeTeamDirectoryTable,
  TACTILE,
} from '@/components/ae/settings/AeTeamDirectoryTable'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { toast } from '@/lib/ui/toast'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const JOINED_AT = 1_704_067_200_000

const directoryFixture = {
  accountRef: `acc_${'2'.repeat(32)}`,
  owner: {
    kind: 'owner' as const,
    principalRef: `prn_${'1'.repeat(32)}`,
    displayName: 'Joel Chan',
    email: 'joel@example.test',
    ownershipRef: `own_${'3'.repeat(32)}`,
    joinedAt: JOINED_AT,
  },
  members: [
    {
      kind: 'member' as const,
      principalRef: `prn_${'a'.repeat(32)}`,
      displayName: 'Alex Worker',
      email: 'alex@work.dev',
      membershipRef: `mem_${'4'.repeat(32)}`,
      role: 'member' as const,
      lifecycle: 'active' as const,
      joinedAt: JOINED_AT + 86_400_000,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('AeTeamDirectoryTable (W-15)', () => {
  it('T1: renders owner and member rows with name, email, role, status, and joined date', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} />)

    const table = screen.getByRole('table', { name: /team/i })
    expect(within(table).getByText('Joel Chan')).toBeInTheDocument()
    expect(within(table).getByText('Alex Worker')).toBeInTheDocument()
    expect(within(table).getByText('joel@example.test')).toBeInTheDocument()
    expect(within(table).getByText('alex@work.dev')).toBeInTheDocument()
    expect(within(table).getAllByText('Owner')).toHaveLength(1)
    expect(within(table).getAllByText('Member')).toHaveLength(1)
    expect(within(table).getAllByText('Active')).toHaveLength(2)
    expect(within(table).getByText(`${formatUtcTimestamp(JOINED_AT)} UTC`)).toBeInTheDocument()
    expect(within(table).getByText(`${formatUtcTimestamp(JOINED_AT + 86_400_000)} UTC`)).toBeInTheDocument()
  })

  it('T2: filters rows by display name', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} />)

    const filter = screen.getByRole('searchbox')
    fireEvent.change(filter, { target: { value: 'Alex' } })

    expect(screen.getByText('Alex Worker')).toBeInTheDocument()
    expect(screen.queryByText('Joel Chan')).toBeNull()
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument()
  })

  it('T2b: filters rows by email', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'work.dev' } })

    expect(screen.getByText('Alex Worker')).toBeInTheDocument()
    expect(screen.queryByText('Joel Chan')).toBeNull()
  })

  it('T3: empty members still shows owner row and empty-members message', () => {
    render(<AeTeamDirectoryTable directory={{ ...directoryFixture, members: [] }} />)

    expect(screen.getByText('Joel Chan')).toBeInTheDocument()
    expect(screen.getByText(/no other members/i)).toBeInTheDocument()
  })

  it('T5: admin member renders Admin label while owner still renders Owner', () => {
    const [firstMember] = directoryFixture.members
    if (!firstMember) throw new Error('expected fixture member')
    render(<AeTeamDirectoryTable directory={{
      ...directoryFixture,
      members: [{
        ...firstMember,
        displayName: 'Admin Worker',
        role: 'admin',
      }],
    }} />)

    const table = screen.getByRole('table', { name: /team/i })
    expect(within(table).getAllByText('Owner')).toHaveLength(1)
    expect(within(table).getAllByText('Admin')).toHaveLength(1)
    expect(within(table).queryByText('Member')).toBeNull()
  })

  it('T4: null email renders an em dash', () => {
    const [firstMember] = directoryFixture.members
    if (!firstMember) throw new Error('expected fixture member')
    render(<AeTeamDirectoryTable directory={{
      ...directoryFixture,
      owner: { ...directoryFixture.owner, email: null },
      members: [{
        ...firstMember,
        email: null,
      }],
    }} />)

    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /copy email/i })).toBeNull()
  })

  it('T6: displays empty state with invite button when workspace has no other members', () => {
    render(<AeTeamDirectoryTable directory={{
      ...directoryFixture,
      members: [],
    }} />)

    expect(screen.getByText('No other members in this workspace')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+ Invite Member/i })).toBeInTheDocument()
  })

  it('T7: undefined directory renders loading skeleton with accessible status', () => {
    render(<AeTeamDirectoryTable />)

    const status = screen.getByRole('status', { name: /loading team directory/i })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(within(status).getByText('Name')).toBeInTheDocument()
    expect(within(status).getByText('Email')).toBeInTheDocument()
    expect(within(status).getAllByText(/./).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Filter by name or email…')).toBeInTheDocument()
  })

  it('T8: loading prop renders the same skeleton state', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} loading />)

    expect(screen.getByRole('status', { name: /loading team directory/i })).toBeInTheDocument()
  })

  it('T9: role filter chips use aria-pressed and unfiltered counts', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} />)

    const allChip = screen.getByRole('button', { name: 'All (2)' })
    const ownerChip = screen.getByRole('button', { name: 'Owner (1)' })
    const memberChip = screen.getByRole('button', { name: 'Member (1)' })

    expect(allChip).toHaveAttribute('aria-pressed', 'true')
    expect(ownerChip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(ownerChip)
    expect(ownerChip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Joel Chan')).toBeInTheDocument()
    expect(screen.queryByText('Alex Worker')).toBeNull()
    expect(memberChip).toHaveTextContent('Member (1)')
  })

  it('T10: filter-empty state offers reset filters', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} />)

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nobody-here' } })
    expect(screen.getByText('No members match these filters')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByText('Joel Chan')).toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument()
  })

  it('T11: copies email to clipboard with success toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<AeTeamDirectoryTable directory={directoryFixture} />)

    const copyButtons = screen.getAllByRole('button', { name: 'Copy email' })
    const firstCopy = copyButtons[0]
    expect(firstCopy).toBeDefined()
    if (firstCopy) {
      fireEvent.click(firstCopy)
    }
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('joel@example.test')
      expect(toast.success).toHaveBeenCalledWith('Copied email to clipboard')
    })
  })

  it('T12: exports tactile token for shared settings surfaces', () => {
    expect(TACTILE).toContain('enabled:active:scale-[0.98]')
    expect(TACTILE).toContain('motion-reduce:active:scale-100')
  })

  it('T13: reserves diagnostic slot under the table', () => {
    render(<AeTeamDirectoryTable directory={directoryFixture} />)
    expect(document.querySelector('[data-slot="team-directory-diagnostic"]')).toBeTruthy()
  })
})

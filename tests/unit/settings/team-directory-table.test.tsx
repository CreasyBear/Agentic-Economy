/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeTeamDirectoryTable } from '@/components/ae/settings/AeTeamDirectoryTable'
import { formatUtcTimestamp } from '@/lib/ui/format-time'

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
  })

  it('T6: displays empty state with invite button when workspace has no other members', () => {
    render(<AeTeamDirectoryTable directory={{
      ...directoryFixture,
      members: [],
    }} />)

    expect(screen.getByText('No other members in this workspace')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\+ Invite Member/i })).toBeInTheDocument()
  })
})

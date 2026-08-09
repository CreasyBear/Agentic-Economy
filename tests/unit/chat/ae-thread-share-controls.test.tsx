// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const shareMocks = vi.hoisted(() => ({
  copy: vi.fn(),
  revoke: vi.fn(),
  announce: vi.fn(),
}))

vi.mock('@/components/ae/chat/copy-thread-link', () => ({
  copyAnswerThreadShareLink: shareMocks.copy,
  revokeAnswerThreadShare: shareMocks.revoke,
  announceShareFailure: shareMocks.announce,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

import { AeThreadHeader } from '@/components/ae/chat/AeThreadHeader'

describe('owner share controls', () => {
  it('exposes copy and revoke actions instead of a bare thread link', async () => {
    shareMocks.copy.mockResolvedValue({ kind: 'copied', sharePath: '/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    shareMocks.revoke.mockResolvedValue({ kind: 'revoked' })
    render(<AeThreadHeader title="Find a plumber" threadId="thread:1" />)

    const copy = screen.getByRole('button', { name: 'Copy share link' })
    const revoke = screen.getByRole('button', { name: 'Revoke share link' })
    expect(copy).toBeTruthy()
    expect(revoke).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()

    fireEvent.click(copy)
    await waitFor(() => expect(shareMocks.copy).toHaveBeenCalledWith('thread:1'))

    fireEvent.click(revoke)
    await waitFor(() => expect(shareMocks.revoke).toHaveBeenCalledWith('thread:1'))
    expect((screen.getByRole('button', { name: 'Share link revoked' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

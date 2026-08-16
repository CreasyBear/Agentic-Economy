// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('uses chat vocabulary for the mobile and desktop recent-chat controls', () => {
    const openMobile = vi.fn()
    const toggleDesktop = vi.fn()
    const view = render(
      <AeThreadHeader
        title="Find a plumber"
        showSidebarButton
        onOpenMobileSidebar={openMobile}
        onToggleDesktopSidebar={toggleDesktop}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open recent chats' }))
    expect(openMobile).toHaveBeenCalledOnce()

    const show = screen.getByRole('button', { name: 'Show recent chats' })
    expect(show.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(show)
    expect(toggleDesktop).toHaveBeenCalledOnce()

    view.rerender(
      <AeThreadHeader
        title="Find a plumber"
        showSidebarButton
        desktopSidebarExpanded
        onOpenMobileSidebar={openMobile}
        onToggleDesktopSidebar={toggleDesktop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Hide recent chats' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps New chat visible and puts copy/revoke behind one Chat actions menu', async () => {
    const ask = vi.fn()
    shareMocks.copy.mockResolvedValue({ kind: 'copied', sharePath: '/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    shareMocks.revoke.mockResolvedValue({ kind: 'revoked' })
    render(<AeThreadHeader title="Find a plumber" threadId="thread:1" onNewQuestion={ask} />)

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(ask).toHaveBeenCalledOnce()

    const trigger = screen.getByRole('button', { name: 'Chat actions' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Copy share link' })).toBeNull()

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByText(
      'This chat is private unless you share it. Shared links are read-only until you revoke the link or delete the chat.',
    )).toBeTruthy()
    const copy = screen.getByRole('menuitem', { name: 'Copy share link' })
    const revoke = screen.getByRole('menuitem', { name: 'Revoke share link' })
    expect(copy).toBeTruthy()
    expect(revoke).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()

    fireEvent.click(copy)
    await waitFor(() => expect(shareMocks.copy).toHaveBeenCalledWith('thread:1'))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke share link' }))
    await waitFor(() => expect(shareMocks.revoke).toHaveBeenCalledWith('thread:1'))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    const revoked = screen.getByRole('menuitem', { name: 'Share link revoked' })
    expect(revoked.getAttribute('aria-disabled')).toBe('true')
  })

  it('disables both menu actions while a share request is busy', async () => {
    let resolveCopy: (() => void) | undefined
    shareMocks.copy.mockImplementation(
      () => new Promise<{ kind: 'copied'; sharePath: string }>((resolve) => {
        resolveCopy = () => resolve({
          kind: 'copied',
          sharePath: '/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        })
      }),
    )
    render(<AeThreadHeader title="Find a plumber" threadId="thread:1" />)

    const trigger = screen.getByRole('button', { name: 'Chat actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy share link' }))

    await waitFor(() => expect(trigger.getAttribute('aria-busy')).toBe('true'))
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    expect(screen.getByRole('menuitem', { name: 'Preparing share link…' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Revoke share link' }).getAttribute('aria-disabled')).toBe('true')

    resolveCopy?.()
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).not.toBe('true'))
  })
})

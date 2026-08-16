// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    onClick,
    className,
    'aria-current': ariaCurrent,
  }: {
    children: React.ReactNode
    onClick?: () => void
    className?: string
    'aria-current'?: 'page'
  }) => (
    <a href="/t/thread%3A1" onClick={onClick} className={className} aria-current={ariaCurrent}>{children}</a>
  ),
  useRouter: () => ({ navigate: vi.fn() }),
}))
vi.mock('@/components/ae/chat/AeStructuredAnswerChat', () => ({
  isStructuredAnswerModeEnabled: () => false,
}))

import { AeThreadSidebar } from '@/components/ae/chat/AeThreadSidebar'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'

const thread: AnswerThreadRecord = {
  threadId: 'thread:1',
  pseudonymousSessionId: 'session:1',
  title: 'Find a plumber',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

function openActionsMenu() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for Find a plumber' }), {
    button: 0,
    ctrlKey: false,
  })
}

function openDeleteConfirmation() {
  openActionsMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete chat' }))
}

describe('AeThreadSidebar', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses recent-chat vocabulary and keeps New chat as the marked first control', () => {
    render(<AeThreadSidebar threads={[]} visible onNewQuestion={vi.fn()} />)

    const sidebar = screen.getByRole('complementary', { name: 'Recent chats' })
    expect(within(sidebar).getByText('Recent chats')).toBeTruthy()
    expect(within(sidebar).getByText('No chats yet. Start a new chat to see it here.')).toBeTruthy()

    const newChat = within(sidebar).getByRole('button', { name: 'New chat' })
    expect(within(sidebar).getAllByRole('button')[0]).toBe(newChat)
    expect(newChat.hasAttribute('data-ae-sidebar-primary')).toBe(true)
  })

  it('keeps mobile actions visible and gives the selected chat the full brand surface', () => {
    const view = render(
      <AeThreadSidebar
        threads={[thread]}
        activeThreadId={thread.threadId}
        visible
        layout="mobile"
      />,
    )

    expect(screen.getByText('Recent chats').className).toContain('tracking-wider')

    const selectedLink = screen.getByRole('link', { name: /Find a plumber/ })
    const selectedRow = selectedLink.closest('li')
    expect(selectedRow?.className).toContain('border-brand')
    expect(selectedRow?.className).toContain('bg-brand-muted')
    expect(screen.getByText('Find a plumber').className).toContain('text-brand-strong')

    const actionTrigger = screen.getByRole('button', { name: 'Actions for Find a plumber' })
    expect(actionTrigger.className).toContain('min-h-11')
    expect(actionTrigger.className).toContain('min-w-11')
    expect(actionTrigger.className).toContain('opacity-100')
    expect(actionTrigger.className).not.toContain('opacity-0')

    view.rerender(<AeThreadSidebar threads={[thread]} visible layout="desktop" />)

    const desktopTrigger = screen.getByRole('button', { name: 'Actions for Find a plumber' })
    expect(desktopTrigger.className).toContain('opacity-0')
    expect(desktopTrigger.className).toContain('group-hover/row:opacity-100')
    expect(desktopTrigger.className).toContain('group-focus-within/row:opacity-100')
  })

  it('does not delete when confirmation opens or is cancelled', async () => {
    const onDelete = vi.fn()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<AeThreadSidebar threads={[thread]} visible onDelete={onDelete} />)

    openActionsMenu()
    expect(screen.getByRole('menuitem', { name: 'Open chat' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'New chat' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete chat' }))

    const confirmation = screen.getByRole('alertdialog')
    expect(within(confirmation).getByRole('heading', { name: 'Delete this chat?' })).toBeTruthy()
    expect(within(confirmation).getByText('This removes the chat and stops its share links from working.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('link', { name: /Find a plumber/ })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('deletes through the existing endpoint and calls onDelete only after an OK response', async () => {
    const onDelete = vi.fn()
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<AeThreadSidebar threads={[thread]} visible onDelete={onDelete} />)

    openDeleteConfirmation()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete chat' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/answer/threads/thread%3A1', { method: 'DELETE' }))
    expect(onDelete).not.toHaveBeenCalled()

    view.rerender(<AeThreadSidebar threads={[thread]} visible onDelete={onDelete} />)
    openDeleteConfirmation()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete chat' }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('thread:1'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatHeader } from '@/components/ae/chat/chat-session/components/ChatHeader'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import { chatHeaderActionsId, chatHistory } from '@/lib/public/chat-ia'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ChatHeader', () => {
  it('keeps local thread controls without app-level brand or auth chrome', () => {
    render(
      <ChatHeader
        authenticated={false}
        threadId={null}
        threadTitle={null}
        busy={false}
        sharePath={null}
        copied={false}
        mobileHistory={null}
        mobileOpen={false}
        onMobileOpenChange={() => undefined}
        onToggleHistory={() => undefined}
        onNewChat={() => undefined}
        onIssueShare={() => undefined}
        onRevokeShare={() => undefined}
        onCopyShare={() => undefined}
      />,
    )

    expect(screen.queryByRole('link', { name: /home/i })).toBeNull()
    expect(document.querySelector(`img[src="${AECON_MARK_SRC}"]`)).toBeNull()
    expect(screen.getByRole('button', { name: 'Toggle conversation history' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull()
    expect(screen.getByRole('button', { name: chatHistory.newChat })).toBeTruthy()
  })

  it('places thread controls in the app header slot instead of a second bar', () => {
    render(
      <header data-shell="app-header">
        <div id={chatHeaderActionsId} />
        <ChatHeader
          authenticated={false}
          threadId={null}
          threadTitle={null}
          busy={false}
          sharePath={null}
          copied={false}
          mobileHistory={null}
          mobileOpen={false}
          onMobileOpenChange={() => undefined}
          onToggleHistory={() => undefined}
          onNewChat={() => undefined}
          onIssueShare={() => undefined}
          onRevokeShare={() => undefined}
          onCopyShare={() => undefined}
        />
      </header>,
    )

    expect(document.querySelectorAll('header')).toHaveLength(1)
    const slot = document.getElementById(chatHeaderActionsId)
    expect(slot?.querySelector('button[aria-label="New chat"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Ask' }).className).not.toContain('sr-only')
  })

  it('shows the guest sign-in line inside the mobile history sheet', () => {
    vi.stubGlobal('innerWidth', 390)
    const onMobileOpenChange = vi.fn()
    const { rerender } = render(<ChatHeader
      authenticated={false} threadId={null} threadTitle={null} busy={false} sharePath={null} copied={false}
      mobileHistory={null} mobileOpen={false} onMobileOpenChange={onMobileOpenChange}
      onToggleHistory={() => undefined} onNewChat={() => undefined}
      onIssueShare={() => undefined} onRevokeShare={() => undefined} onCopyShare={() => undefined}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Toggle conversation history' }))
    expect(onMobileOpenChange).toHaveBeenCalledWith(true)
    rerender(<ChatHeader
      authenticated={false} threadId={null} threadTitle={null} busy={false} sharePath={null} copied={false}
      mobileHistory={null} mobileOpen onMobileOpenChange={() => undefined}
      onToggleHistory={() => undefined} onNewChat={() => undefined}
      onIssueShare={() => undefined} onRevokeShare={() => undefined} onCopyShare={() => undefined}
    />)
    expect(screen.getByText(/Sign in to keep your chats/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
  })
})

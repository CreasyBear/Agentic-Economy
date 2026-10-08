/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatHeaderSlot, ChatHeaderSlotProvider } from '@/components/ae/layout/app-shell/ChatHeaderSlot'
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
    expect(screen.queryByRole('textbox', { name: chatHistory.shareLabel })).toBeNull()
    expect(screen.queryByRole('button', { name: chatHistory.copy })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('places thread controls in the app header slot instead of a second bar', () => {
    render(
      <ChatHeaderSlotProvider><header data-shell="app-header">
        <ChatHeaderSlot />
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
      </header></ChatHeaderSlotProvider>,
    )

    expect(document.querySelectorAll('header')).toHaveLength(1)
    const slot = document.getElementById(chatHeaderActionsId)
    expect(slot?.querySelector('button[aria-label="New chat"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Ask' }).className).not.toContain('sr-only')
  })

  it('names total available credit and exposes the purchased and promotional breakdown', () => {
    render(<ChatHeader authenticated threadId={null} threadTitle={null} busy={false} sharePath={null} copied={false}
      balanceLabel="A$15.00" balanceDescription="Purchased credit A$5.00. Promotional credit A$10.00. Next expiry tomorrow."
      mobileHistory={null} mobileOpen={false} onMobileOpenChange={() => undefined}
      onToggleHistory={() => undefined} onNewChat={() => undefined} onIssueShare={() => undefined}
      onRevokeShare={() => undefined} onCopyShare={() => undefined} />)
    const balance = screen.getByRole('link', { name: 'Available credit A$15.00' })
    expect(document.getElementById(balance.getAttribute('aria-describedby')!)?.textContent)
      .toBe('Purchased credit A$5.00. Promotional credit A$10.00. Next expiry tomorrow.')
    expect(balance.getAttribute('href')).toBe('/owner/credit')
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
  it('preserves exact credit/share authority and emits commands without submitting a surrounding form', () => {
    const onNewChat = vi.fn(), onIssueShare = vi.fn(), onRevokeShare = vi.fn(), onCopyShare = vi.fn(), onSubmit = vi.fn()
    const sharePath = '/s/exact-share-token'
    const header = (copied: boolean) => (
      <form onSubmit={onSubmit}><ChatHeader authenticated threadId="private-thread" threadTitle="Weather procurement" busy={false}
        shareState="active" sharePath={sharePath} copied={copied} balanceLabel="A$10.01"
        mobileHistory={null} mobileOpen={false} onMobileOpenChange={() => undefined} onToggleHistory={() => undefined}
        onNewChat={onNewChat} onIssueShare={onIssueShare} onRevokeShare={onRevokeShare} onCopyShare={onCopyShare} /></form>
    )
    const { rerender } = render(header(false))
    expect(screen.getByRole('link', { name: 'Available credit A$10.01' }).getAttribute('href')).toBe('/owner/credit')
    const shareInput = screen.getByRole('textbox', { name: chatHistory.shareLabel }) as HTMLInputElement
    expect(shareInput.id).toBe('tool-chat-share-link')
    expect(shareInput.value).toBe(sharePath)
    expect(shareInput.readOnly).toBe(true)
    const shareLabels = screen.getAllByText(chatHistory.shareLabel, { selector: 'label' })
    expect(shareLabels).toHaveLength(1)
    expect(shareLabels[0]?.getAttribute('for')).toBe(shareInput.id)
    expect(shareInput.labels).toHaveLength(1)
    expect(screen.getAllByRole('textbox', { name: chatHistory.shareLabel })).toHaveLength(1)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: chatHistory.newChat }))
    fireEvent.click(screen.getByRole('button', { name: chatHistory.shareGet }))
    fireEvent.click(screen.getByRole('button', { name: chatHistory.shareRevoke }))
    fireEvent.click(screen.getByRole('button', { name: chatHistory.copy }))
    expect(onNewChat).toHaveBeenCalledOnce()
    expect(onIssueShare).toHaveBeenCalledOnce()
    expect(onRevokeShare).toHaveBeenCalledOnce()
    expect(onCopyShare).toHaveBeenCalledOnce()

    rerender(header(true))
    const copiedShareInput = screen.getByRole('textbox', { name: chatHistory.shareLabel }) as HTMLInputElement
    expect(copiedShareInput.id).toBe('tool-chat-share-link')
    expect(copiedShareInput.value).toBe(sharePath)
    expect(copiedShareInput.readOnly).toBe(true)
    expect(screen.getByRole('button', { name: chatHistory.copied })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: chatHistory.copied }))
    expect(onCopyShare).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

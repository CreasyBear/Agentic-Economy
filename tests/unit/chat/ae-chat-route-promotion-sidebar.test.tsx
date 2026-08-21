/**
 * @vitest-environment jsdom
 */
import { buildProjection } from './ae-chat-route-promotion-harness'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion sidebar', () => {
  it('keeps an empty desktop history rail closed until explicitly opened', async () => {
    window.sessionStorage.setItem('ae.recentThreads.v1', '[]')
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    expect(screen.getByTestId('thread-sidebar').getAttribute('data-visible')).toBe('false')
    const toggle = screen.getByRole('button', { name: 'Show recent chats' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)

    const openToggle = screen.getByRole('button', { name: 'Hide recent chats' })
    expect(openToggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('thread-sidebar').getAttribute('data-visible')).toBe('true')
    await waitFor(() => expect(document.activeElement?.textContent).toBe('First recent chat'))

    fireEvent.click(openToggle)
    expect(screen.getByRole('button', { name: 'Show recent chats' }).getAttribute('aria-expanded')).toBe('false')
  })
  it('restores focus to the Recent chats opener after Escape closes the controlled dialog', async () => {
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    const opener = within(screen.getByRole('banner')).getByRole('button', { name: 'Open recent chats' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = await screen.findByRole('dialog', { name: 'Recent chats' })
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Recent chats' })).toBeNull()
      expect(document.activeElement).toBe(opener)
    })
  })
})

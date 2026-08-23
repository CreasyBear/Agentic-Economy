/**
 * @vitest-environment jsdom
 */
import { buildProjection } from './ae-chat-route-promotion-harness'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion header', () => {
  it('resets share controls when navigating to another thread', async () => {
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE'
        ? new Response(JSON.stringify({ revoked: true }))
        : new Response(JSON.stringify({ threads: [] }))
    ))
    const { rerender } = render(
      <AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />,
    )

    const trigger = screen.getByRole('button', { name: 'Search actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke share link' }))
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).not.toBe('true'))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    const revoked = screen.getByRole('menuitem', { name: 'Share link revoked' })
    expect(revoked.getAttribute('aria-disabled')).toBe('true')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    rerender(<AeChat threadId="thread-two" initialProjection={buildProjection('thread-two', 'Second answer')} />)

    const secondTrigger = screen.getByRole('button', { name: 'Search actions' })
    fireEvent.pointerDown(secondTrigger, { button: 0, ctrlKey: false })
    const revokeForSecondThread = screen.getByRole('menuitem', { name: 'Revoke share link' })
    expect(revokeForSecondThread.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('keeps one compact header row with all actions accessible', () => {
    render(
      <AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />,
    )

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('heading', { level: 1, name: 'First answer' })).toBeTruthy()
    expect(within(header).getByRole('button', { name: 'New search' })).toBeTruthy()
    const trigger = within(header).getByRole('button', { name: 'Search actions' })
    expect(screen.queryByRole('menu')).toBeNull()

    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Copy share link' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Revoke share link' })).toBeTruthy()
  })

  it('isolates the visible thread title without bidi formatting controls', () => {
    render(
      <AeChat
        threadId="thread-rtl"
        initialProjection={buildProjection('thread-rtl', 'مرحبا\u202e fake marker')}
      />,
    )

    const title = screen.getByRole('heading', { level: 1, name: 'مرحبا fake marker' })
    expect(title.getAttribute('dir')).toBe('auto')
    expect(title.style.unicodeBidi).toBe('isolate')
  })
})

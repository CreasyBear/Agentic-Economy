/**
 * @vitest-environment jsdom
 */
import {
  buildProjection,
  computeAccessibleDescription,
  submitQuery,
  testState,
} from './ae-chat-route-promotion-harness'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion shell', () => {
  it('gives an initial pending answer one focused heading landmark', () => {
    render(<AeChat initialQuery="duplicate probe" />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Answering your question')
    expect(headings[0]?.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(headings[0])
  })

  it('focuses the main landmark on thread and new-chat route changes even when a control was focused', () => {
    const first = render(<AeChat initialQuery="duplicate probe" />)
    const pendingHeading = screen.getByRole('heading', { level: 1, name: 'Answering your question' })
    pendingHeading.blur()

    first.rerender(
      <AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />,
    )
    const main = screen.getByRole('main')
    expect(document.activeElement).toBe(main)

    const sidebarToggle = screen.getAllByRole('button', { name: 'Open recent chats' })[0] as HTMLButtonElement
    sidebarToggle.focus()
    first.rerender(
      <AeChat threadId="thread-two" initialProjection={buildProjection('thread-two', 'Second answer')} />,
    )
    expect(document.activeElement).toBe(main)

    sidebarToggle.focus()
    first.rerender(<AeChat />)
    expect(document.activeElement).toBe(main)
  })

  it('keeps the active answer shell mounted while promoting a new home turn to its thread route', async () => {
    testState.navigateResult = Promise.withResolvers<void>().promise

    render(<AeChat />)

    expect(screen.queryByRole('searchbox', { name: 'What do you need done?' })).not.toBeNull()
    expect(testState.latestScrollerProps).toMatchObject({
      showJumpButton: true,
      contentClassName: 'justify-center',
    })

    await submitQuery('businesses in Perth')
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    const composer = screen.getByRole('searchbox', { name: 'What do you need done?' })
    expect(computeAccessibleDescription(composer)).toContain('Working on your ask')
    expect(testState.latestScrollerProps?.showJumpButton).toBe(true)
    expect(testState.latestScrollerProps?.contentClassName).toBe('[&>[data-slot=message-scroller-item]:first-of-type]:mt-auto')

    await act(async () => {
      testState.latestTranscriptProps?.onThreadCreated?.('thread-promoted-1')
      await Promise.resolve()
    })

    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-promoted-1')

    await act(async () => {
      testState.latestTranscriptProps?.onStreamEnd?.('complete')
      await Promise.resolve()
    })

    expect(testState.navigateCalls).toEqual([
      {
        to: '/t/$threadId',
        params: { threadId: 'thread-promoted-1' },
        replace: true,
      },
    ])
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    expect(screen.getByRole('searchbox', { name: 'What do you need done?' })).not.toBeNull()
    expect(screen.queryByTestId('live-turn')).not.toBeNull()
  })

  it('does not paint the previous thread projection after the route thread changes', () => {
    const firstProjection = buildProjection('thread-one', 'First answer')
    const { rerender } = render(<AeChat threadId="thread-one" initialProjection={firstProjection} />)

    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-one')
    expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('thread-one')

    rerender(<AeChat threadId="thread-two" />)

    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-two')
    expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('none')
  })
})

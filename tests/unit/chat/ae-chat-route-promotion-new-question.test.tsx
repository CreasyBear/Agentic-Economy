/**
 * @vitest-environment jsdom
 */
import {
  PENDING_DRAFT_STORAGE_KEY,
  buildStatusProjection,
  readStoredDraft,
  submitQuery,
  testState,
} from './ae-chat-route-promotion-harness'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion new question', () => {
  it('clears a saved idle draft and navigates to the canonical new-question route', async () => {
    render(<AeChat />)
    await submitQuery('businesses in Perth')
    expect(readStoredDraft()).toMatchObject({ query: 'businesses in Perth' })

    const discard = testState.newQuestionCallbacks.at(-1)
    expect(discard).toBeDefined()
    await act(async () => {
      await discard?.()
    })

    expect(window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)).toBeNull()
    expect(testState.navigateCalls).toContainEqual({ to: '/t/new' })
  })

  it('waits for durable Stop and refresh before navigating away from an active turn', async () => {
    const stoppedResponse = Promise.withResolvers<Response>()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/answer/turn/stop') {
        calls.push('stop')
        return stoppedResponse.promise
      }
      if (url.endsWith('/api/answer/threads/thread-active')) {
        calls.push('refresh')
        return Response.json(buildStatusProjection('thread-active', 'stopped'))
      }
      return Response.json({ threads: [] })
    })
    render(
      <AeChat
        threadId="thread-active"
        initialProjection={buildStatusProjection('thread-active', 'pending')}
      />,
    )

    const newQuestion = testState.newQuestionCallbacks.at(-1)
    let navigation: void | Promise<void> = undefined
    await act(async () => {
      navigation = newQuestion?.()
      await Promise.resolve()
    })
    expect(calls).toContain('stop')
    expect(testState.navigateCalls).not.toContainEqual({ to: '/t/new' })

    stoppedResponse.resolve(Response.json({
      kind: 'stopped',
      threadId: 'thread-active',
      turnId: 'thread-active-turn-1',
    }))
    await act(async () => {
      await navigation
    })

    expect(calls.indexOf('refresh')).toBeGreaterThan(calls.indexOf('stop'))
    expect(testState.navigateCalls).toContainEqual({ to: '/t/new' })
  })

  it('navigates after Stop reports the active turn already settled', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/answer/turn/stop') {
        return Response.json({
          kind: 'already_settled',
          threadId: 'thread-settled',
          turnId: 'thread-settled-turn-1',
          status: 'error',
        })
      }
      if (url.endsWith('/api/answer/threads/thread-settled')) {
        return Response.json(buildStatusProjection('thread-settled', 'error'))
      }
      return Response.json({ threads: [] })
    })
    render(
      <AeChat
        threadId="thread-settled"
        initialProjection={buildStatusProjection('thread-settled', 'pending')}
      />,
    )

    await act(async () => {
      await testState.newQuestionCallbacks.at(-1)?.()
    })

    expect(testState.navigateCalls).toContainEqual({ to: '/t/new' })
  })

  it('keeps the active thread and recovery identity when Stop fails', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => (
      String(input) === '/api/answer/turn/stop'
        ? Response.json({}, { status: 503 })
        : Response.json({ threads: [] })
    ))
    render(
      <AeChat
        threadId="thread-recoverable"
        initialProjection={buildStatusProjection('thread-recoverable', 'pending')}
      />,
    )

    await act(async () => {
      await testState.newQuestionCallbacks.at(-1)?.()
    })

    expect(testState.navigateCalls).not.toContainEqual({ to: '/t/new' })
    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-recoverable')
    expect(testState.latestTranscriptProps?.projection?.turns.at(-1)).toMatchObject({
      turnId: 'thread-recoverable-turn-1',
      status: 'pending',
    })
  })
})

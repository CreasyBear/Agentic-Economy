/**
 * @vitest-environment jsdom
 */
import {
  PENDING_DRAFT_STORAGE_KEY,
  buildProjection,
  readStoredDraft,
  submitQuery,
  testState,
} from './ae-chat-route-promotion-harness'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeChat } from '@/components/ae/chat/AeChat'
import { buildAnswerTurnProblem } from '@/lib/errors'

describe('AeChat route promotion draft', () => {
  it('keeps one initial turn identity across a route remount', () => {
    const first = render(<AeChat initialQuery="duplicate probe" />)
    const firstKey = testState.observedClientTurnKeys.at(-1)
    first.unmount()
    render(<AeChat initialQuery="duplicate probe" />)

    expect(firstKey).toBeDefined()
    expect(firstKey).toMatch(/^[a-z0-9-]{8,128}$/iu)
    expect(firstKey).not.toContain('duplicate probe')
    expect(testState.observedClientTurnKeys.at(-1)).toBe(firstKey)
  })
  it('restores a bare new-question draft with the same query and turn key after reload', async () => {
    const first = render(<AeChat />)
    await submitQuery('businesses in Perth')

    const firstLiveTurn = testState.latestTranscriptProps?.liveTurn
    const firstKey = firstLiveTurn?.clientTurnKey
    expect(firstKey).toBeDefined()
    await act(async () => {
      testState.latestTranscriptProps?.onThreadCreated?.('thread-draft')
      await Promise.resolve()
    })
    expect(readStoredDraft()).toMatchObject({
      version: 1,
      query: 'businesses in Perth',
      clientTurnKey: firstKey,
      threadId: 'thread-draft',
    })

    first.unmount()
    render(<AeChat />)

    await waitFor(() => {
      expect(testState.latestTranscriptProps?.liveTurn?.query).toBe('businesses in Perth')
    })
    expect(testState.latestTranscriptProps?.liveTurn?.clientTurnKey).toBe(firstKey)
    expect(testState.latestTranscriptProps?.liveTurn?.searchContext).toMatchObject({ timing: 'flexible' })
    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-draft')
  })

  it('restores a draft on its exact thread route with the same turn identity', () => {
    window.sessionStorage.setItem(PENDING_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      query: 'follow up on the Perth businesses',
      clientTurnKey: 'matching-thread-key',
      threadId: 'thread-draft',
      savedAt: Date.now(),
    }))

    render(
      <AeChat
        threadId="thread-draft"
        initialProjection={buildProjection('thread-draft', 'Earlier answer')}
      />,
    )

    expect(testState.latestTranscriptProps?.liveTurn).toMatchObject({
      query: 'follow up on the Perth businesses',
      clientTurnKey: 'matching-thread-key',
    })
    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-draft')
  })

  it('rejects and clears a draft from a different thread route', () => {
    window.sessionStorage.setItem(PENDING_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      query: 'follow up on another thread',
      clientTurnKey: 'mismatched-thread-key',
      threadId: 'thread-other',
      savedAt: Date.now(),
    }))

    render(
      <AeChat
        threadId="thread-current"
        initialProjection={buildProjection('thread-current', 'Current answer')}
      />,
    )

    expect(testState.latestTranscriptProps?.liveTurn ?? null).toBeNull()
    expect(window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('retains the same draft identity after a transport interruption', async () => {
    render(<AeChat />)
    await submitQuery('businesses in Perth')
    const interruptedKey = testState.latestTranscriptProps?.liveTurn?.clientTurnKey

    await act(async () => {
      testState.latestTranscriptProps?.onStreamEnd?.('error')
      testState.latestTranscriptProps?.onRetry?.('businesses in Perth')
      await Promise.resolve()
    })

    expect(readStoredDraft()).toMatchObject({
      query: 'businesses in Perth',
      clientTurnKey: interruptedKey,
    })
    expect(testState.latestTranscriptProps?.liveTurn?.clientTurnKey).toBe(interruptedKey)
  })

  it('clears a durably failed draft so Retry starts a new turn identity', async () => {
    render(<AeChat />)
    await submitQuery('businesses in Perth')
    const failedKey = testState.latestTranscriptProps?.liveTurn?.clientTurnKey
    expect(failedKey).toBeDefined()

    await act(async () => {
      testState.latestTranscriptProps?.onThreadCreated?.('thread-error')
      testState.latestTranscriptProps?.onSettledTurn?.({
        turnId: 'thread-error-turn-1',
        seq: 1,
        query: 'businesses in Perth',
        intent: 'refine_search',
        status: 'error',
        problem: buildAnswerTurnProblem('answer_turn_failed'),
        workLog: [],
        artifacts: [],
        oneLine: 'Failed answer',
      }, 1)
      testState.latestTranscriptProps?.onStreamEnd?.('error')
      await Promise.resolve()
    })

    expect(window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)).toBeNull()

    await act(async () => {
      testState.latestTranscriptProps?.onRetry?.('businesses in Perth')
      await Promise.resolve()
    })

    const retryKey = testState.latestTranscriptProps?.liveTurn?.clientTurnKey
    expect(retryKey).toBeDefined()
    expect(retryKey).not.toBe(failedKey)
    expect(readStoredDraft()).toMatchObject({ clientTurnKey: retryKey })
  })

  it('clears the draft only after terminal readback and route promotion', async () => {
    render(<AeChat />)
    await submitQuery('businesses in Perth')

    await act(async () => {
      testState.latestTranscriptProps?.onThreadCreated?.('thread-promoted-1')
      testState.latestTranscriptProps?.onStreamEnd?.('complete')
      await Promise.resolve()
    })

    await waitFor(() => expect(window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)).toBeNull())
  })

  it('lets the URL query replace a different stored draft', () => {
    window.sessionStorage.setItem(PENDING_DRAFT_STORAGE_KEY, JSON.stringify({
      version: 1,
      query: 'stored query',
      clientTurnKey: 'stored-key-123',
      savedAt: Date.now(),
    }))

    render(<AeChat initialQuery="url query" />)

    expect(testState.latestTranscriptProps?.liveTurn?.query).toBe('url query')
    expect(testState.latestTranscriptProps?.liveTurn?.clientTurnKey).not.toBe('stored-key-123')
    expect(readStoredDraft()).toMatchObject({ query: 'url query' })
  })

  it.each([
    'not-json',
    JSON.stringify({
      version: 1,
      query: 'expired query',
      clientTurnKey: 'expired-key-123',
      savedAt: Date.now() - 2 * 24 * 60 * 60 * 1_000,
    }),
    JSON.stringify({
      version: 1,
      query: 'unknown field query',
      clientTurnKey: 'unknown-field-key',
      savedAt: Date.now(),
      unexpected: true,
    }),
  ])('refuses malformed or expired stored drafts', (raw) => {
    window.sessionStorage.setItem(PENDING_DRAFT_STORAGE_KEY, raw)

    render(<AeChat />)

    expect(testState.latestTranscriptProps?.liveTurn ?? null).toBeNull()
    expect(window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('keeps a storage failure typed and does not start a second turn identity', async () => {
    vi.stubGlobal('sessionStorage', {
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      length: 0,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('storage blocked')
      },
    } satisfies Storage)
    render(<AeChat />)

    const input = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'businesses in Perth' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(testState.latestTranscriptProps?.liveTurn ?? null).toBeNull()
    expect(window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)).toBeNull()
  })
})

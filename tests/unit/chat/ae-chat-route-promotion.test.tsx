/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { buildAnswerTurnProblem } from '@/lib/errors'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Resolved locally rather than via `dom-accessibility-api`, whose types are
// unreachable through its package `exports` map under this repo's resolution.
function computeAccessibleDescription(element: Element): string {
  const ids = element.getAttribute('aria-describedby')?.trim()
  if (ids === undefined || ids.length === 0) {
    return ''
  }
  return ids
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join(' ')
}

const testState = vi.hoisted(() => {
  const state = {
    navigateCalls: [] as unknown[],
    navigateResult: undefined as unknown,
    observedClientTurnKeys: [] as string[],
    newQuestionCallbacks: [] as Array<() => void | Promise<void>>,
    latestTranscriptProps: undefined as
      | {
          threadId?: string | null
          projection?: PublicThreadProjection | null
          liveTurn?: { query: string; generation: number; intent: string; clientTurnKey: string; searchContext?: unknown } | null
          onStreamEnd?: (outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') => void
          onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
          onSettledTurn?: (turn: PublicThreadProjection['turns'][number], generation: number) => void
          onFollowUp?: (query: string) => void
          onRetry?: (query: string) => void
          onChangeCriteria?: () => void
        }
      | undefined,
    latestScrollerProps: undefined as
      | {
          showJumpButton?: boolean
          contentClassName?: string
        }
      | undefined,
    navigate(input: unknown) {
      state.navigateCalls.push(input)
      return state.navigateResult
    },
  }

  return state
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => testState.navigate,
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  defaultHomeSearch: { q: '' },
  AePublicShell: ({ children }: { children: ReactNode }) => <main id="main-content" tabIndex={-1} data-testid="public-shell">{children}</main>,
}))

vi.mock('@/lib/observability/capture-client-events', () => ({
  captureClientProductEventOnClient: () => undefined,
}))

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEvent: async () => undefined,
}))

vi.mock('@/components/ae/chat/AeThreadScroller', () => ({
  AeThreadScroller: ({
    children,
    ...props
  }: {
    children: ReactNode
    showJumpButton?: boolean
    contentClassName?: string
  }) => {
    testState.latestScrollerProps = props
    return <div data-testid="thread-scroller">{children}</div>
  },
}))

vi.mock('@/components/ae/chat/AeThreadSidebar', () => ({
  AeThreadSidebar: ({
    visible,
    layout = 'desktop',
    onNewQuestion,
  }: {
    visible?: boolean
    layout?: 'desktop' | 'mobile'
    onNewQuestion?: () => void
  }) => {
    if (onNewQuestion !== undefined) {
      testState.newQuestionCallbacks.push(onNewQuestion)
    }
    return (
      <aside
        id={layout === 'desktop' ? 'ae-thread-sidebar' : 'ae-thread-mobile-sidebar-content'}
        data-testid="thread-sidebar"
        data-visible={visible === true ? 'true' : 'false'}
      >
        {visible ? <button type="button">First recent chat</button> : null}
      </aside>
    )
  },
}))

vi.mock('@/components/ae/chat/AeThreadTranscript', () => ({
  AeThreadTranscript: (props: typeof testState.latestTranscriptProps) => {
    if (props?.liveTurn?.clientTurnKey !== undefined) {
      testState.observedClientTurnKeys.push(props.liveTurn.clientTurnKey)
    }
    testState.latestTranscriptProps = props
    return (
      <div
        data-testid="thread-transcript"
        data-route-thread-id={props?.threadId ?? 'home'}
        data-projection-thread-id={props?.projection?.threadId ?? 'none'}
        data-turn-count={String(props?.projection?.turns.length ?? 0)}
      >
        {props?.liveTurn === null || props?.liveTurn === undefined ? (
          <div data-testid="no-live-turn" />
        ) : (
          <div data-testid="live-turn">{props.liveTurn.query}</div>
        )}
        {props?.onChangeCriteria === undefined ? null : (
          <button type="button" onClick={props.onChangeCriteria}>Change criteria</button>
        )}
      </div>
    )
  },
}))
vi.mock('@/components/ae/chat/AeStructuredAnswerChat', () => ({
  isStructuredAnswerModeEnabled: () => false,
}))

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
    testState.navigateCalls.length = 0
    testState.navigateResult = undefined
    testState.latestTranscriptProps = undefined
    testState.observedClientTurnKeys.length = 0
    testState.newQuestionCallbacks.length = 0
    testState.latestScrollerProps = undefined
  })

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
    expect(computeAccessibleDescription(composer)).toContain("Checking what's available")
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
  it('resets share controls when navigating to another thread', async () => {
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE'
        ? new Response(JSON.stringify({ revoked: true }))
        : new Response(JSON.stringify({ threads: [] }))
    ))
    const { rerender } = render(
      <AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />,
    )

    const trigger = screen.getByRole('button', { name: 'Chat actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke share link' }))
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).not.toBe('true'))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    const revoked = screen.getByRole('menuitem', { name: 'Share link revoked' })
    expect(revoked.getAttribute('aria-disabled')).toBe('true')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    rerender(<AeChat threadId="thread-two" initialProjection={buildProjection('thread-two', 'Second answer')} />)

    const secondTrigger = screen.getByRole('button', { name: 'Chat actions' })
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
    expect(within(header).getByRole('button', { name: 'New chat' })).toBeTruthy()
    const trigger = within(header).getByRole('button', { name: 'Chat actions' })
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

  it('recovers a null SSR projection with one owner readback', async () => {
    const projection = buildProjection('thread-recovered', 'Recovered answer')
    const detailRequests: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {

      const url = String(input)
      if (url.endsWith('/api/answer/threads/thread-recovered')) {
        detailRequests.push(url)
        return new Response(JSON.stringify(projection))
      }
      return new Response(JSON.stringify({ threads: [] }))
    })

    render(<AeChat threadId="thread-recovered" initialProjection={null} />)
    expect(screen.queryByText('Chat unavailable')).toBeNull()
    await waitFor(() => {
      expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('thread-recovered')
    })
    expect(detailRequests).toHaveLength(1)
  })

  it('keeps a null SSR projection concealed when owner readback returns 404', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => (
      String(input).endsWith('/api/answer/threads/thread-missing')
        ? new Response(null, { status: 404 })
        : new Response(JSON.stringify({ threads: [] }))
    ))

    render(<AeChat threadId="thread-missing" initialProjection={null} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat unavailable' })).toBeTruthy()
    expect(screen.getByText('This chat couldn’t be loaded. Start a new chat to continue.')).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Start a new chat' })).toHaveLength(1)
    expect(testState.latestScrollerProps).toMatchObject({
      showJumpButton: true,
      contentClassName: 'justify-center',
    })
  })

  it('does not read back a matching non-null SSR projection', async () => {
    const detailRequests: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/answer/threads/thread-one')) {
        detailRequests.push(url)
      }
      return new Response(JSON.stringify({ threads: [] }))
    })

    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    await waitFor(() => expect(screen.getByTestId('thread-transcript')).toBeTruthy())
    expect(detailRequests).toHaveLength(0)
  })

  it('does not render retention policy copy in the transcript', () => {
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    expect(screen.queryByRole('note', { name: 'Chat access and retention' })).toBeNull()
    expect(screen.queryByText(/Private to this browser by default/iu)).toBeNull()
  })

  it('keeps the terminal shortlist composer and focuses prior criteria on request', async () => {
    const baseProjection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider({ publishedPhone: '0412 345 678' })] },
    ])
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, timing: 'today' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const transcript = screen.getByTestId('thread-transcript')
    const settledTurnCount = transcript.getAttribute('data-turn-count')
    const existingComposer = screen.getByRole('searchbox') as HTMLTextAreaElement
    expect(existingComposer.value).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Change criteria' }))

    const composer = await screen.findByRole('searchbox') as HTMLTextAreaElement
    expect(composer.value).toBe('emergency plumber in Perth')
    await waitFor(() => expect(document.activeElement).toBe(composer))
    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Today')
    expect(screen.queryByTestId('live-turn')).toBeNull()
    expect(screen.getByTestId('no-live-turn')).toBeTruthy()
    expect(transcript.getAttribute('data-turn-count')).toBe(settledTurnCount)
    expect(testState.latestTranscriptProps?.liveTurn ?? null).toBeNull()
  })

  it('resets refinement prefill on a new chat until that chat requests it', async () => {
    const firstProjection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider({ publishedPhone: '0412 345 678' })] },
    ])
    const secondBaseProjection = buildProjection('thread-two', 'Second answer', [
      { kind: 'provider-cards', providers: [provider({
        slug: 'fremantle-roof-repairs',
        name: 'Fremantle Roof Repairs',
        detailUrl: '/fremantle-roof-repairs',
        inquiryUrl: '/fremantle-roof-repairs/inquiry',
        publishedPhone: '0488 123 456',
      })] },
    ])
    const secondProjection = {
      ...secondBaseProjection,
      turns: secondBaseProjection.turns.map((turn) => ({
        ...turn,
        query: 'urgent roof repairs in Fremantle',
      })),
    } satisfies PublicThreadProjection
    const { rerender } = render(<AeChat threadId="thread-one" initialProjection={firstProjection} />)

    fireEvent.click(screen.getByRole('button', { name: 'Change criteria' }))
    expect((await screen.findByRole('searchbox') as HTMLTextAreaElement).value).toBe(
      'emergency plumber in Perth',
    )

    rerender(<AeChat threadId="thread-two" initialProjection={secondProjection} />)
    await waitFor(() => {
      expect((screen.getByRole('searchbox') as HTMLTextAreaElement).value).toBe('')
    })
    expect(screen.getByTestId('thread-transcript').getAttribute('data-route-thread-id')).toBe('thread-two')
    expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('thread-two')

    fireEvent.click(screen.getByRole('button', { name: 'Change criteria' }))

    expect((await screen.findByRole('searchbox') as HTMLTextAreaElement).value).toBe(
      'urgent roof repairs in Fremantle',
    )
  })

  it('passes the classified follow-up intent to live turns before replay catches up', async () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    await submitQuery('message the first one', 'Refine the request or ask what can happen next')

    expect(testState.latestTranscriptProps?.liveTurn?.intent).toBe('inquiry_handoff')
    expectComposerCopy(
      'Preparing a request to the business',
      'The business still confirms timing, quote, and availability.',
    )
  })

  it('uses the refreshed route projection after a completed follow-up turn', async () => {
    const initialProjection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ])
    const refreshedProjection = {
      ...initialProjection,
      turns: [
        ...initialProjection.turns,
        {
          turnId: 'thread-one-turn-2',
          seq: 2,
          query: 'Message the first listed business',
          intent: 'inquiry_handoff' as const,
          status: 'complete' as const,
          oneLine: 'Ready to ask Demo Plumbing for a response.',
          workLog: [],
          artifacts: [{ kind: 'selected-provider' as const, provider: provider() }],
        },
      ],
    } satisfies PublicThreadProjection
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/answer/threads/thread-one')) {
        return new Response(JSON.stringify(refreshedProjection))
      }
      if (url.includes('/api/answer/threads')) {
        return new Response(JSON.stringify({ threads: [] }))
      }
      return new Response(JSON.stringify({}), { status: 404 })
    })

    render(<AeChat threadId="thread-one" initialProjection={initialProjection} />)

    await act(async () => {
      testState.latestTranscriptProps?.onFollowUp?.('Message the first listed business')
      await Promise.resolve()
    })
    expect(testState.latestTranscriptProps?.liveTurn?.intent).toBe('inquiry_handoff')

    await act(async () => {
      testState.latestTranscriptProps?.onStreamEnd?.('complete')
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('thread-transcript').getAttribute('data-turn-count')).toBe('2')
    })
  })


  it('restores Today as the selected timing for a completed persisted turn', () => {
    const baseProjection = buildProjection('thread-one', 'First answer')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, timing: 'today' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Today')
  })

  it.each([
    ['data_answer', 'Ask a follow-up'],
    ['empty_state', 'Try a different question'],
    ['boundary_explain', 'Ask a different question'],
    ['safety_refusal', 'Ask a different question'],
  ] as const)('removes business composer controls for the %s terminal profile', (layoutProfile, placeholder) => {
    const baseProjection = buildProjection('thread-one', 'Terminal answer')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, layoutProfile })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const composer = screen.getByRole('searchbox', { name: 'What do you need done?' })
    expect(composer.getAttribute('placeholder')).toBe(placeholder)
    expect(screen.queryByRole('combobox', { name: 'When do you need this?' })).toBeNull()
    expect(screen.queryByText('When do you need this?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()
    expect(screen.queryByText(/match is needed|selected business|contacting a business/i)).toBeNull()
  })

  it('retains business composer controls for a clarification profile', () => {
    const baseProjection = buildProjection('thread-one', 'Clarification needed')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, layoutProfile: 'clarification' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Flexible')
    expect(screen.getByRole('button', { name: 'Change criteria' })).toBeTruthy()
  })

  it('guides the composer toward refinement when no listed business is available', () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Try a different question')
  })

  it('guides the composer toward inquiry once a listed business publishes that path', () => {
    const projection = withProviderlessFollowUp(buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ]))
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Ask a follow-up')
  })

  it('guides the composer toward contact limits when listings lack inquiry paths', () => {
    const projection = withProviderlessFollowUp(buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [providerWithoutInquiry()] },
    ]))
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Ask a follow-up',
      'These options do not have a request form yet.',
    )
  })

  it('guides the composer around the selected inquiry business after handoff', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'selected-provider', provider: provider() },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy('Ask a follow-up')
  })
})

const PENDING_DRAFT_STORAGE_KEY = 'ae.answer.initial-turn-key.v1'

function readStoredDraft(): Record<string, unknown> | null {
  const raw = window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw) as Record<string, unknown>
}

async function submitQuery(query: string, placeholder = 'What do you need done?') {
  const input = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLTextAreaElement
  await waitFor(() => {
    expect(input.disabled).toBe(false)
  })
  fireEvent.change(input, { target: { value: query } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
  await waitFor(() => {
    expect(testState.latestTranscriptProps?.liveTurn).not.toBeNull()
  })
}

function expectComposerCopy(placeholder: string, loopHint?: string) {
  const input = screen.getByRole('searchbox', { name: 'What do you need done?' })
  expect(input.getAttribute('placeholder')).toBe(placeholder)
  if (loopHint !== undefined) {
    expect(screen.getByText(loopHint)).toBeTruthy()
  }
}

type TestArtifact = PublicThreadProjection['turns'][number]['artifacts'][number]

function buildProjection(
  threadId: string,
  title: string,
  artifacts: readonly TestArtifact[] = [],
): PublicThreadProjection {
  return {
    threadId,
    title,
    turns: [
      {
        turnId: `${threadId}-turn-1`,
        seq: 1,
        query: 'emergency plumber in Perth',
        intent: 'refine_search',
        status: 'complete',
        workLog: [],
        artifacts,
        oneLine: title,
      },
    ],
  }
}

function buildStatusProjection(
  threadId: string,
  status: 'pending' | 'stopped' | 'error',
): PublicThreadProjection {
  return {
    threadId,
    title: 'Active answer',
    turns: [{
      turnId: `${threadId}-turn-1`,
      seq: 1,
      query: 'businesses in Perth',
      intent: 'refine_search',
      status,
      ...(status === 'error'
        ? { problem: buildAnswerTurnProblem('answer_turn_failed') }
        : {}),
      workLog: [],
      artifacts: [],
      oneLine: '',
      createdAt: 1,
    }],
  }
}

function withProviderlessFollowUp(projection: PublicThreadProjection): PublicThreadProjection {
  return {
    ...projection,
    turns: [
      ...projection.turns,
      {
        turnId: `${projection.threadId}-turn-2`,
        seq: 2,
        query: 'What should I do next?',
        intent: 'explain_boundary',
        status: 'complete',
        workLog: [],
        artifacts: [],
        oneLine: 'Continue from the listed businesses already found.',
      },
    ],
  }
}

function provider(
  overrides: Partial<Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number]> = {},
): Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number] {
  return {
    citationIndex: 1,
    slug: 'parramatta-emergency-plumbing',
    name: 'Parramatta Emergency Plumbing',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'Responds ~22m',
    trustCue: 'Responds ~22m - Checked',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/parramatta-emergency-plumbing',
    services: [],
    inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
    ...overrides,
  }
}

function providerWithoutInquiry(
  overrides: Partial<Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number]> = {},
): Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number] {
  const { inquiryUrl: _inquiryUrl, ...source } = provider(overrides)
  return source
}


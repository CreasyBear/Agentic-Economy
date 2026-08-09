/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
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
    latestTranscriptProps: undefined as
      | {
          threadId?: string | null
          projection?: PublicThreadProjection | null
          liveTurn?: { query: string; generation: number; intent: string; clientTurnKey: string } | null
          onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
          onStreamEnd?: (outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') => void
          onSettledTurn?: (turn: PublicThreadProjection['turns'][number], generation: number) => void
          onFollowUp?: (query: string) => void
          onChangeCriteria?: () => void
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
  AeThreadScroller: ({ children }: { children: ReactNode }) => <div data-testid="thread-scroller">{children}</div>,
}))

vi.mock('@/components/ae/chat/AeThreadSidebar', () => ({
  AeThreadSidebar: ({ visible }: { visible?: boolean }) => <aside data-testid="thread-sidebar" data-visible={visible === true ? 'true' : 'false'} />,
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
    testState.navigateCalls.length = 0
    testState.navigateResult = undefined
    testState.latestTranscriptProps = undefined
    testState.observedClientTurnKeys.length = 0
  })

  it('keeps one initial turn identity across a route remount', () => {
    const first = render(<AeChat initialQuery="duplicate probe" />)
    const firstKey = testState.observedClientTurnKeys.at(-1)
    first.unmount()
    render(<AeChat initialQuery="duplicate probe" />)

    expect(firstKey).toBeDefined()
    expect(testState.observedClientTurnKeys.at(-1)).toBe(firstKey)
  })

  it('gives an initial pending answer one focused heading landmark', () => {
    render(<AeChat initialQuery="duplicate probe" />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent).toBe('Answering your question')
    expect(headings[0]?.getAttribute('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(headings[0])
  })

  it('focuses the main landmark on thread handoff without stealing focus from a control', () => {
    const first = render(<AeChat initialQuery="duplicate probe" />)
    const pendingHeading = screen.getByRole('heading', { level: 1, name: 'Answering your question' })
    pendingHeading.blur()

    first.rerender(
      <AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />,
    )
    expect(document.activeElement).toBe(screen.getByRole('main'))

    const sidebarToggle = screen.getAllByRole('button', { name: 'Open recent questions' })[0] as HTMLButtonElement
    sidebarToggle.focus()
    first.rerender(
      <AeChat threadId="thread-two" initialProjection={buildProjection('thread-two', 'Second answer')} />,
    )
    expect(document.activeElement).toBe(sidebarToggle)
  })

  it('keeps the active answer shell mounted while promoting a new home turn to its thread route', async () => {
    testState.navigateResult = Promise.withResolvers<void>().promise

    render(<AeChat />)

    expect(screen.queryByRole('searchbox', { name: 'What do you need done?' })).not.toBeNull()

    await submitQuery('businesses in Perth')
    // The welcome composer is now unexposed after promotion; this previously passed only because its accessible name varied.
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
    const refinementComposer = screen.getByRole('searchbox', { name: 'What do you need done?' })
    expect(computeAccessibleDescription(refinementComposer)).toContain("Checking what's available")
    expect(screen.queryByTestId('live-turn')).not.toBeNull()

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

  it('honors an explicit desktop sidebar toggle after its active-thread default', () => {
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    expect(screen.getByTestId('thread-sidebar').getAttribute('data-visible')).toBe('true')
    const toggle = screen.getByRole('button', { name: 'Hide recent questions' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(toggle)

    const closedToggle = screen.getByRole('button', { name: 'Show recent questions' })
    expect(closedToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByTestId('thread-sidebar').getAttribute('data-visible')).toBe('false')

    fireEvent.click(closedToggle)
    expect(screen.getByRole('button', { name: 'Hide recent questions' }).getAttribute('aria-expanded')).toBe('true')
  })
  it('restores focus to the Recent Questions opener after Escape closes the controlled dialog', async () => {
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    const opener = within(screen.getByRole('banner')).getByRole('button', { name: 'Open recent questions' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = await screen.findByRole('dialog', { name: 'Recent questions' })
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Recent questions' })).toBeNull()
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

    fireEvent.click(screen.getByRole('button', { name: 'Revoke share link' }))
    await screen.findByRole('button', { name: 'Share link revoked' })

    rerender(<AeChat threadId="thread-two" initialProjection={buildProjection('thread-two', 'Second answer')} />)

    const revokeForSecondThread = screen.getByRole('button', { name: 'Revoke share link' })
    expect((revokeForSecondThread as HTMLButtonElement).disabled).toBe(false)
  })

  it('wraps all thread header actions at the narrow viewport without removing them from the tab order', () => {
    const { container } = render(
      <AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />,
    )
    const header = container.querySelector('header')
    const actions = header?.children.item(2)

    expect(header?.className).toContain('grid-cols-1')
    expect(actions?.className).toContain('flex-wrap')
    for (const name of ['Ask another', 'Copy share link', 'Revoke share link']) {
      const control = screen.getByRole('button', { name })
      control.focus()
      expect(document.activeElement).toBe(control)
    }
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

    expect(screen.queryByText('Thread unavailable')).toBeNull()
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

    expect(await screen.findByText('Thread unavailable')).toBeTruthy()
    expect(screen.getByTestId('thread-transcript').getAttribute('data-projection-thread-id')).toBe('none')
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

  it('places the retention disclosure after the rendered transcript results', () => {
    render(<AeChat threadId="thread-one" initialProjection={buildProjection('thread-one', 'First answer')} />)

    const transcript = screen.getByTestId('thread-transcript')
    const retention = screen.getByRole('note', { name: 'Thread access and retention' })

    expect(transcript.compareDocumentPosition(retention) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  it('opens focused prior criteria without creating a live or answer turn', async () => {
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
    expect(screen.queryByRole('searchbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Change criteria' }))

    const composer = await screen.findByRole('searchbox') as HTMLTextAreaElement
    expect(composer.value).toBe('emergency plumber in Perth')
    await waitFor(() => expect(document.activeElement).toBe(composer))
    expect(screen.getByRole('radio', { name: 'Today' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByTestId('live-turn')).toBeNull()
    expect(screen.getByTestId('no-live-turn')).toBeTruthy()
    expect(transcript.getAttribute('data-turn-count')).toBe(settledTurnCount)
    expect(testState.latestTranscriptProps?.liveTurn ?? null).toBeNull()
  })

  it('closes an open refinement composer on a new thread until that thread requests it', async () => {
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

    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull())
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
      'Carrying the selected business into a request. It still confirms timing, quote, and availability.',
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

  it('updates session chrome from a settled optimistic turn while the live stream is still mounted', async () => {
    const initialProjection = buildProjection('thread-one', 'Selected provider', [
      { kind: 'selected-provider', provider: provider({ name: 'Demo Plumbing', slug: 'demo-plumbing' }) },
    ])
    render(<AeChat threadId="thread-one" initialProjection={initialProjection} />)

    expect(screen.getByRole('region', { name: /next steps/i }).textContent).toContain(
      'Demo Plumbing selected for contact',
    )

    await submitQuery('Compare plumbers in Parramatta', 'Ask limits, refine, or continue with the selected business')
    await act(async () => {
      testState.latestTranscriptProps?.onThreadCreated?.('thread-one', { turnId: 'thread-one-turn-2', turnSeq: 2 })
      await Promise.resolve()
    })

    const replacementTurn = {
      turnId: 'thread-one-turn-2',
      seq: 2,
      query: 'Compare plumbers in Parramatta',
      intent: 'refine_search' as const,
      status: 'complete' as const,
      oneLine: 'Two listed businesses match.',
      workLog: [],
      artifacts: [
        {
          kind: 'provider-cards' as const,
          providers: [
            provider({ name: 'Demo Plumbing', slug: 'demo-plumbing' }),
            provider({ citationIndex: 2, name: 'Parramatta Emergency Plumbing', slug: 'parramatta-emergency-plumbing' }),
          ],
        },
      ],
    } satisfies PublicThreadProjection['turns'][number]

    await act(async () => {
      testState.latestTranscriptProps?.onSettledTurn?.(replacementTurn, 1)
      await Promise.resolve()
    })

    const inquiryPath = screen.getByRole('region', { name: /next steps/i })
    expect(inquiryPath.textContent).toContain('2 matches ready to compare')
    expect(inquiryPath.textContent).not.toContain('Demo Plumbing selected for contact')
    expect(screen.getByRole('region', { name: /session context/i }).textContent).not.toContain('Selected business')
  })

  it('restores Today as the selected timing for a completed persisted turn', () => {
    const baseProjection = buildProjection('thread-one', 'First answer')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, timing: 'today' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expect(screen.getByRole('radio', { name: 'Today' }).getAttribute('aria-checked')).toBe('true')
  })

  it.each([
    ['data_answer', 'Ask a follow-up or try another live data lookup'],
    ['empty_state', 'Refine your request or ask a different question'],
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
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText('When do you need this?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change criteria' })).toBeNull()
    expect(screen.queryByText(/match is needed|selected business|contacting a business/i)).toBeNull()
    expect(screen.queryByRole('region', { name: /next steps|session context/i })).toBeNull()
  })

  it('retains business composer controls for a clarification profile', () => {
    const baseProjection = buildProjection('thread-one', 'Clarification needed')
    const projection: PublicThreadProjection = {
      ...baseProjection,
      turns: baseProjection.turns.map((turn) => ({ ...turn, layoutProfile: 'clarification' })),
    }

    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expect(screen.getByRole('radio', { name: 'Flexible' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change criteria' })).toBeTruthy()
  })

  it('guides the composer toward refinement when no listed business is available', () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Refine the request or ask what can happen next',
      'A match is needed before comparing options or contacting a business.',
    )
  })

  it('guides the composer toward inquiry once a listed business publishes that path', () => {
    const projection = withProviderlessFollowUp(buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ]))
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Narrow, compare, or ask the business',
      'Narrow or compare the matches, then ask the business when one fits.',
    )
  })

  it('guides the composer toward contact limits when listings lack inquiry paths', () => {
    const projection = withProviderlessFollowUp(buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [providerWithoutInquiry()] },
    ]))
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Narrow, compare, or ask for the contact step',
      'These options do not have a request form yet.',
    )
  })

  it('guides the composer around the selected inquiry business after handoff', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'selected-provider', provider: provider() },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Ask limits, refine, or continue with the selected business',
      'That business stays in context. It confirms timing, quote, and availability.',
    )
  })
})

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

function expectComposerCopy(placeholder: string, loopHint: string) {
  const input = screen.getByRole('searchbox', { name: 'What do you need done?' })
  expect(input.getAttribute('placeholder')).toBe(placeholder)
  expect(screen.getByText(loopHint)).toBeTruthy()
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


/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { afterEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  nextQuery: 'businesses in Perth',
  latestTranscriptProps: undefined as
    | {
        threadId?: string | null
        projection?: PublicThreadProjection | null
        liveTurn?: { query: string; generation: number; intent: string } | null
        onThreadCreated?: (threadId: string) => void
        onStreamEnd?: (outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') => void
        onFollowUp?: (query: string) => void
      }
    | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => testState.navigate,
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  defaultHomeSearch: { q: '' },
  AePublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
}))

vi.mock('@/components/ae/feedback/AeEmptyState', () => ({
  AeEmptyState: () => <div data-testid="empty-state" />,
}))


vi.mock('@/lib/observability/capture-client-events', () => ({
  captureClientProductEventOnClient: vi.fn(),
}))

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEvent: vi.fn(),
}))

vi.mock('@/components/ae/chat/AeAnswerModelContext', () => ({
  AeAnswerModelProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ae/chat/AeChatWelcome', () => ({
  AeChatWelcome: () => <div data-testid="welcome-copy">Welcome</div>,
}))

vi.mock('@/components/ae/chat/AeQueryPanel', () => ({
  AeQueryPanel: ({
    onSubmit,
    showExamples,
    busy,
    placeholder,
    loopHint,
  }: {
    onSubmit: (query: string) => void
    showExamples?: boolean
    busy?: boolean
    placeholder?: string
    loopHint?: string
  }) => (
    <button
      type="button"
      data-testid={showExamples === true ? 'welcome-query-panel' : 'active-query-panel'}
      data-busy={String(busy === true)}
      data-placeholder={placeholder ?? ''}
      data-loop-hint={loopHint ?? ''}
      onClick={() => onSubmit(testState.nextQuery)}
    >
      Ask
    </button>
  ),
}))

vi.mock('@/components/ae/chat/AeThreadHeader', () => ({
  AeThreadHeader: () => <div data-testid="thread-header" />,
}))

vi.mock('@/components/ae/chat/AeThreadScroller', () => ({
  AeThreadScroller: ({ children }: { children: ReactNode }) => <div data-testid="thread-scroller">{children}</div>,
}))

vi.mock('@/components/ae/chat/AeThreadSidebar', () => ({
  AeThreadSidebar: () => <aside data-testid="thread-sidebar" />,
}))

vi.mock('@/components/ae/chat/AeSessionJourney', () => ({
  AeSessionJourney: () => <div data-testid="session-journey" />,
}))

vi.mock('@/components/ae/chat/AeThreadTranscript', () => ({
  AeThreadTranscript: (props: typeof testState.latestTranscriptProps) => {
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
      </div>
    )
  },
}))

vi.mock('@/components/ae/chat/AeStreamingLabel', () => ({
  AeThreadStreamingIndicator: ({ streaming }: { streaming: boolean }) => (
    <div data-testid="streaming-indicator" data-streaming={String(streaming)} />
  ),
}))

vi.mock('@/components/ae/chat/AeStructuredAnswerChat', () => ({
  isStructuredAnswerModeEnabled: () => false,
}))

import { AeChat } from '@/components/ae/chat/AeChat'

describe('AeChat route promotion', () => {
  afterEach(() => {
    cleanup()
    testState.navigate.mockReset()
    testState.latestTranscriptProps = undefined
    testState.nextQuery = 'businesses in Perth'
  })

  it('keeps the active answer shell mounted while promoting a new home turn to its thread route', async () => {
    testState.navigate.mockReturnValue(new Promise(() => {}))

    render(<AeChat />)

    expect(screen.queryByTestId('welcome-query-panel')).not.toBeNull()

    fireEvent.click(screen.getByTestId('welcome-query-panel'))

    expect(screen.queryByTestId('welcome-query-panel')).toBeNull()
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

    expect(testState.navigate).toHaveBeenCalledWith({
      to: '/t/$threadId',
      params: { threadId: 'thread-promoted-1' },
      replace: true,
    })
    expect(screen.queryByTestId('welcome-query-panel')).toBeNull()
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

  it('passes the classified follow-up intent to live turns before replay catches up', () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    testState.nextQuery = 'message the first one'
    fireEvent.click(screen.getByTestId('active-query-panel'))

    expect(testState.latestTranscriptProps?.liveTurn?.intent).toBe('inquiry_handoff')
    const panel = screen.getByTestId('active-query-panel')
    expect(panel.getAttribute('data-placeholder')).toBe('Preparing the qualified inquiry next step')
    expect(panel.getAttribute('data-loop-hint')).toBe(
      'AE is carrying the selected business into inquiry review. The business still confirms timing, quote, and availability.',
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
          query: 'Send a qualified inquiry to the first listed business',
          intent: 'inquiry_handoff' as const,
          status: 'complete' as const,
          oneLine: 'Ready to send a qualified inquiry.',
          workLog: [],
          artifacts: [{ kind: 'selected-provider' as const, provider: provider() }],
        },
      ],
    } satisfies PublicThreadProjection
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/answer/threads/thread-one')) {
        return new Response(JSON.stringify(refreshedProjection))
      }
      if (url.includes('/api/answer/threads')) {
        return new Response(JSON.stringify({ threads: [] }))
      }
      return new Response(JSON.stringify({}), { status: 404 })
    }))

    render(<AeChat threadId="thread-one" initialProjection={initialProjection} />)

    await act(async () => {
      testState.latestTranscriptProps?.onFollowUp?.('Send a qualified inquiry to the first listed business')
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

  it('guides the composer toward refinement when no listed business is available', () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const panel = screen.getByTestId('active-query-panel')
    expect(panel.getAttribute('data-placeholder')).toBe('Refine the search or ask what AE can safely do')
    expect(panel.getAttribute('data-loop-hint')).toBe(
      'AE needs a listed business before it can compare options or route a qualified inquiry.',
    )
  })

  it('guides the composer toward inquiry once a listed business publishes that path', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const panel = screen.getByTestId('active-query-panel')
    expect(panel.getAttribute('data-placeholder')).toBe('Narrow, compare, or start a qualified inquiry')
    expect(panel.getAttribute('data-loop-hint')).toBe(
      'Continue by narrowing or comparing the listed businesses, then use qualified inquiry when one fits.',
    )
  })

  it('guides the composer toward contact limits when listings lack inquiry paths', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [providerWithoutInquiry()] },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const panel = screen.getByTestId('active-query-panel')
    expect(panel.getAttribute('data-placeholder')).toBe('Narrow, compare, or ask for the contact step')
    expect(panel.getAttribute('data-loop-hint')).toBe(
      'These listings need a published inquiry path before AE can route contact.',
    )
  })

  it('guides the composer around the selected inquiry business after handoff', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'selected-provider', provider: provider() },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    const panel = screen.getByTestId('active-query-panel')
    expect(panel.getAttribute('data-placeholder')).toBe('Ask limits, refine, or continue with the selected business')
    expect(panel.getAttribute('data-loop-hint')).toBe(
      'AE keeps that business in context for qualified inquiry review. The business still confirms timing, quote, and availability.',
    )
  })
})

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

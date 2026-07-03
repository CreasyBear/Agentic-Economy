/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { afterEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  latestTranscriptProps: undefined as
    | {
        threadId?: string | null
        projection?: { threadId: string } | null
        liveTurn?: { query: string; generation: number } | null
        onThreadCreated?: (threadId: string) => void
        onStreamEnd?: (outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') => void
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
  }: {
    onSubmit: (query: string) => void
    showExamples?: boolean
    busy?: boolean
  }) => (
    <button
      type="button"
      data-testid={showExamples === true ? 'welcome-query-panel' : 'active-query-panel'}
      data-busy={String(busy === true)}
      onClick={() => onSubmit('businesses in Perth')}
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

vi.mock('@/components/ae/chat/AeThreadTranscript', () => ({
  AeThreadTranscript: (props: typeof testState.latestTranscriptProps) => {
    testState.latestTranscriptProps = props
    return (
      <div
        data-testid="thread-transcript"
        data-route-thread-id={props?.threadId ?? 'home'}
        data-projection-thread-id={props?.projection?.threadId ?? 'none'}
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
})

function buildProjection(threadId: string, title: string): PublicThreadProjection {
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
        artifacts: [],
        oneLine: title,
      },
    ],
  }
}

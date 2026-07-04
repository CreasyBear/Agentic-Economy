/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { afterEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => {
  const state = {
    navigateCalls: [] as unknown[],
    navigateResult: undefined as unknown,
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
    navigate(input: unknown) {
      state.navigateCalls.push(input)
      return state.navigateResult
    },
  }

  return state
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => testState.navigate,
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  defaultHomeSearch: { q: '' },
  AePublicShell: ({ children }: { children: ReactNode }) => <div data-testid="public-shell">{children}</div>,
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
  })

  it('keeps the active answer shell mounted while promoting a new home turn to its thread route', async () => {
    testState.navigateResult = Promise.withResolvers<void>().promise

    render(<AeChat />)

    expect(screen.queryByRole('searchbox', { name: 'What do you need done?' })).not.toBeNull()

    await submitQuery('businesses in Perth')
    expect(screen.queryByRole('searchbox', { name: 'What do you need done?' })).toBeNull()
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
    expect(screen.queryByRole('searchbox', { name: 'What do you need done?' })).toBeNull()
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

  it('passes the classified follow-up intent to live turns before replay catches up', async () => {
    const projection = buildProjection('thread-one', 'First answer')
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    await submitQuery('message the first one', 'Refine the search or ask what AE can safely do')

    expect(testState.latestTranscriptProps?.liveTurn?.intent).toBe('inquiry_handoff')
    expectComposerCopy(
      'Preparing the qualified inquiry next step',
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
          query: 'Prepare a qualified inquiry for the first listed business',
          intent: 'inquiry_handoff' as const,
          status: 'complete' as const,
          oneLine: "Ready to open Demo Plumbing's qualified inquiry form.",
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
      testState.latestTranscriptProps?.onFollowUp?.('Prepare a qualified inquiry for the first listed business')
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

    expectComposerCopy(
      'Refine the search or ask what AE can safely do',
      'AE needs a listed business before it can compare options or route a qualified inquiry.',
    )
  })

  it('guides the composer toward inquiry once a listed business publishes that path', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [provider()] },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Narrow, compare, or prepare a qualified inquiry',
      'Continue by narrowing or comparing the listed businesses, then prepare a qualified inquiry when one fits.',
    )
  })

  it('guides the composer toward contact limits when listings lack inquiry paths', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'provider-cards', providers: [providerWithoutInquiry()] },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Narrow, compare, or ask for the contact step',
      'These listings need a published inquiry path before AE can route contact.',
    )
  })

  it('guides the composer around the selected inquiry business after handoff', () => {
    const projection = buildProjection('thread-one', 'First answer', [
      { kind: 'selected-provider', provider: provider() },
    ])
    render(<AeChat threadId="thread-one" initialProjection={projection} />)

    expectComposerCopy(
      'Ask limits, refine, or continue with the selected business',
      'AE keeps that business in context for qualified inquiry review. The business still confirms timing, quote, and availability.',
    )
  })
})

async function submitQuery(query: string, placeholder = 'What do you need done?') {
  const input = screen.getByRole('searchbox', { name: placeholder }) as HTMLTextAreaElement
  await waitFor(() => {
    expect(input.disabled).toBe(false)
  })
  fireEvent.change(input, { target: { value: query } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
}

function expectComposerCopy(placeholder: string, loopHint: string) {
  expect(screen.getByRole('searchbox', { name: placeholder })).toBeTruthy()
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

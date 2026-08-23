import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { PublicThreadProjection } from '@/modules/answer-thread/public'
import { buildAnswerTurnProblem } from '@/lib/errors'
import { afterEach, expect, vi } from 'vitest'

// Resolved locally rather than via `dom-accessibility-api`, whose types are
// unreachable through its package `exports` map under this repo's resolution.
export function computeAccessibleDescription(element: Element): string {
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

const hoistedTestState = vi.hoisted(() => {
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

export const testState = {
  navigateCalls: hoistedTestState.navigateCalls,
  observedClientTurnKeys: hoistedTestState.observedClientTurnKeys,
  newQuestionCallbacks: hoistedTestState.newQuestionCallbacks,
  get navigateResult() {
    return hoistedTestState.navigateResult
  },
  set navigateResult(value: unknown) {
    hoistedTestState.navigateResult = value
  },
  get latestTranscriptProps() {
    return hoistedTestState.latestTranscriptProps
  },
  set latestTranscriptProps(value: typeof hoistedTestState.latestTranscriptProps) {
    hoistedTestState.latestTranscriptProps = value
  },
  get latestScrollerProps() {
    return hoistedTestState.latestScrollerProps
  },
  set latestScrollerProps(value: typeof hoistedTestState.latestScrollerProps) {
    hoistedTestState.latestScrollerProps = value
  },
  navigate(input: unknown) {
    return hoistedTestState.navigate(input)
  },
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => hoistedTestState.navigate,
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
    hoistedTestState.latestScrollerProps = props
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
      hoistedTestState.newQuestionCallbacks.push(onNewQuestion)
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
  AeThreadTranscript: (props: typeof hoistedTestState.latestTranscriptProps) => {
    if (props?.liveTurn?.clientTurnKey !== undefined) {
      hoistedTestState.observedClientTurnKeys.push(props.liveTurn.clientTurnKey)
    }
    hoistedTestState.latestTranscriptProps = props
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
  hoistedTestState.navigateCalls.length = 0
  hoistedTestState.navigateResult = undefined
  hoistedTestState.latestTranscriptProps = undefined
  hoistedTestState.observedClientTurnKeys.length = 0
  hoistedTestState.newQuestionCallbacks.length = 0
  hoistedTestState.latestScrollerProps = undefined
})

export const PENDING_DRAFT_STORAGE_KEY = 'ae.answer.initial-turn-key.v1'

export function readStoredDraft(): Record<string, unknown> | null {
  const raw = window.sessionStorage.getItem(PENDING_DRAFT_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw) as Record<string, unknown>
}

export async function submitQuery(query: string, placeholder = 'Search the operation market') {
  const input = screen.getByRole('searchbox', { name: 'Search the operation market' }) as HTMLTextAreaElement
  await waitFor(() => {
    expect(input.disabled).toBe(false)
  })
  fireEvent.change(input, { target: { value: query } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
  await waitFor(() => {
    expect(hoistedTestState.latestTranscriptProps?.liveTurn).not.toBeNull()
  })
}

export function expectComposerCopy(placeholder: string, loopHint?: string) {
  const input = screen.getByRole('searchbox', { name: 'Search the operation market' })
  expect(input.getAttribute('placeholder')).toBe(placeholder)
  if (loopHint !== undefined) {
    expect(screen.getByText(loopHint)).toBeTruthy()
  }
}

type TestArtifact = PublicThreadProjection['turns'][number]['artifacts'][number]

export function buildProjection(
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

export function buildStatusProjection(
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

export function withProviderlessFollowUp(projection: PublicThreadProjection): PublicThreadProjection {
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

export function provider(
  overrides: Partial<Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number]> = {},
): Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number] {
  return {
    citationIndex: 1,
    slug: 'demo-listed-provider',
    name: 'Demo listed provider',
    category: 'Plumber',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceArea: 'Parramatta',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: 'Responds ~22m',
    trustCue: 'Responds ~22m - Checked',
    nextStepLabel: 'Review details',
    detailUrl: '/demo-listed-provider',
    services: [],
    ...overrides,
  }
}

export function providerWithoutContact(
  overrides: Partial<Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number]> = {},
): Extract<TestArtifact, { kind: 'provider-cards' }>['providers'][number] {
  return provider(overrides)
}

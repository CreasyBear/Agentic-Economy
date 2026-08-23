// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/ae/artifacts/AeGenerativeAnswer', () => ({
  AeGenerativeAnswer: ({
    busy,
    errorMessage,
    onStop,
    phase,
  }: {
    busy?: boolean
    errorMessage?: React.ReactNode | null
    onStop?: () => void
    phase?: string
  }) => (
    <div data-testid="generic-answer" data-busy={busy === true ? 'true' : 'false'} data-phase={phase}>
      {phase === 'error' ? (
        <div role="alert">
          <div>Unable to finish this response.</div>
          {errorMessage}
        </div>
      ) : errorMessage}
      {onStop === undefined ? null : <button type="button" onClick={onStop}>Stop</button>}
    </div>
  ),
}))
vi.mock('@/components/ui/message', () => ({
  Message: ({ children, align, ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) => (
    <div data-align={align} {...props}>{children}</div>
  ),
  MessageContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))
vi.mock('@/components/ae/chat/AeThreadTurnQueryHeader', () => ({ AeThreadTurnQueryHeader: () => null }))
vi.mock('@/components/ae/chat/AeTurnContextLine', () => ({ AeTurnContextLine: () => null }))

import { AeThreadTurnReplaySection } from '@/components/ae/chat/AeThreadTurnReplaySection'
import { AeThreadTurnCollapsed } from '@/components/ae/chat/AeThreadTurnCollapsed'
import type { StopAnswerTurnResult } from '@/components/ae/chat/turn-stop'

const turn = {
  query: 'Plan our wedding',
  intent: 'refine_search' as const,
  seq: 1,
  status: 'complete' as const,
  oneLine: 'Here is the answer.',
  artifacts: [],
  workLog: [],
}

afterEach(cleanup)

describe('thread turn replay', () => {
  it.each([
    ['pending', 'streaming', true, 'This response is taking longer than expected.'],
    ['stopped', 'stopped', false, 'Answer stopped.'],
    ['error', 'error', false, 'Unable to finish this response.'],
    ['complete', 'complete', false, null],
  ] as const)('preserves %s as its durable phase and copy', (status, phase, busy, copy) => {
    render(
      <AeThreadTurnReplaySection
        {...turn}
        status={status}
        {...(status === 'error' ? { problem: { type: 'about:blank', title: 'Failed', status: 500, kind: 'INTERNAL', code: 'answer_turn_failed' } } : {})}
      />,
    )

    expect(screen.getByTestId('generic-answer').getAttribute('data-phase')).toBe(phase)
    expect(screen.getByTestId('generic-answer').getAttribute('data-busy')).toBe(busy ? 'true' : 'false')
    if (copy === null) {
      expect(screen.queryByRole('status')).toBeNull()
      return
    }
    expect(screen.getByText(copy)).toBeTruthy()
  })

  it('preserves a specific problem detail in one actionable recovery block', () => {
    const onRetry = vi.fn()
    render(
      <AeThreadTurnReplaySection
        {...turn}
        status="error"
        problem={{
          type: 'about:blank',
          title: 'Failed',
          status: 503,
          kind: 'UNAVAILABLE',
          code: 'unavailable',
          detail: 'The provider timed out.',
        }}
        onRetry={onRetry}
      />,
    )

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('The provider timed out.')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.getAttribute('data-variant')).toBe('default')
    expect(retry.getAttribute('data-size')).toBe('sm')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledOnce()
    const newChat = screen.getByRole('link', { name: 'New search' })
    expect(newChat.getAttribute('href')).toBe('/')
    expect(newChat.getAttribute('data-variant')).toBe('ghost')
    expect(newChat.getAttribute('data-size')).toBe('sm')
  })

  it('uses direct not-found copy without duplicating the new-chat action', () => {
    render(
      <AeThreadTurnReplaySection
        {...turn}
        status="error"
        problem={{
          type: 'about:blank',
          title: 'Not found',
          status: 404,
          kind: 'NOT_FOUND',
          code: 'thread_not_found',
          detail: 'Stale internal detail.',
        }}
      />,
    )

    expect(screen.getByText('This response is no longer available.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'New search' })).toHaveLength(1)
  })

  it('uses the fallback recovery in an expanded collapsed error turn', () => {
    render(
      <AeThreadTurnCollapsed
        {...turn}
        status="error"
        problem={{
          type: 'about:blank',
          title: 'Failed',
          status: 500,
          kind: 'INTERNAL',
          code: 'answer_turn_failed',
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand/ }))
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Unable to finish this response.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'New search' }).getAttribute('href')).toBe('/')
  })

  it.each(['stopped', 'already_settled'] as const)('clears Stopping after the durable %s result', async (kind) => {
    const onStopPending = vi.fn().mockResolvedValue(
      kind === 'stopped'
        ? { kind, threadId: 'thread-1', turnId: 'turn-1' }
        : { kind, threadId: 'thread-1', turnId: 'turn-1', status: 'complete' },
    )
    render(
      <AeThreadTurnReplaySection
        {...turn}
        status="pending"
        threadId="thread-1"
        onStopPending={onStopPending}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByText('Stopping…')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Stopping…')).toBeNull())
    expect(onStopPending).toHaveBeenCalledOnce()
  })

  it('stops rendering Stopping as soon as the durable turn is no longer pending', () => {
    const pendingStop = Promise.withResolvers<StopAnswerTurnResult>()
    const onStopPending = vi.fn(() => pendingStop.promise)
    const { rerender } = render(
      <AeThreadTurnReplaySection {...turn} status="pending" threadId="thread-1" onStopPending={onStopPending} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByText('Stopping…')).toBeTruthy()

    rerender(<AeThreadTurnReplaySection {...turn} status="stopped" threadId="thread-1" onStopPending={onStopPending} />)
    expect(screen.queryByText('Stopping…')).toBeNull()
    expect(screen.getByText('Answer stopped.')).toBeTruthy()
  })

  it('preserves retry guidance when durable Stop is not confirmed', async () => {
    const onStopPending = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const { rerender } = render(<AeThreadTurnReplaySection {...turn} status="pending" threadId="thread-1" onStopPending={onStopPending} />)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Stop was not confirmed. The response is still pending; try Stop again.')
    expect(alert.classList.contains('text-destructive')).toBe(true)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()

    rerender(<AeThreadTurnReplaySection {...turn} status="complete" threadId="thread-1" onStopPending={onStopPending} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears Stopping in an expanded collapsed turn after durable settlement', async () => {
    const onStopPending = vi.fn().mockResolvedValue({ kind: 'already_settled', threadId: 'thread-1', turnId: 'turn-1', status: 'complete' })
    render(<AeThreadTurnCollapsed {...turn} status="pending" threadId="thread-1" onStopPending={onStopPending} />)

    fireEvent.click(screen.getByRole('button', { name: /Expand/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(screen.getByText('Stopping…')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Stopping…')).toBeNull())
  })

  it('does not expose Stop when no owner callback is provided', () => {
    render(<AeThreadTurnReplaySection {...turn} status="pending" threadId="thread-1" />)
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
  })
  it('keeps the saved state and scroll target on the assistant message', () => {
    const { container } = render(
      <AeThreadTurnReplaySection {...turn} status="complete" scrollTargetId="turn:1" />,
    )

    expect(container.querySelector('[data-turn-status="complete"]')).toBeTruthy()
    expect(container.querySelector('[data-ae-scroll-target="turn:1"]')).toBeTruthy()
  })
  it('isolates collapsed user-authored labels and summaries without bidi controls', () => {
    render(
      <AeThreadTurnCollapsed
        {...turn}
        query={'مرحبا\u202e fake marker'}
        oneLine={'نتيجة\u202d safe'}
      />,
    )

    const label = screen.getByText('مرحبا fake marker')
    const summary = screen.getByText('نتيجة safe')
    for (const text of [label, summary]) {
      expect(text.getAttribute('dir')).toBe('auto')
      expect(text.style.unicodeBidi).toBe('isolate')
    }
  })
  it('keeps a collapsed stopped row muted until expanded, then shows the ghost answer', () => {
    const { container } = render(<AeThreadTurnCollapsed {...turn} status="stopped" />)
    expect(container.querySelector('[data-align="end"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="bubble"][data-align="end"][data-variant="muted"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Expand/ }))
    expect(container.querySelector('[data-slot="bubble"][data-align="start"][data-variant="ghost"]')).not.toBeNull()
    expect(screen.getByTestId('generic-answer').getAttribute('data-phase')).toBe('stopped')
    expect(screen.getByTestId('generic-answer').textContent).toBe('Answer stopped.')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
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
      {errorMessage}
      {onStop === undefined ? null : <button type="button" onClick={onStop}>Stop</button>}
    </div>
  ),
}))
vi.mock('@/components/ai-elements/message', () => ({
  Message: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
    ['pending', 'streaming', true, 'This answer is still pending. Reload to check its durable status.'],
    ['stopped', 'stopped', false, 'Answer stopped.'],
    ['error', 'error', false, 'This answer could not be completed.'],
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

    expect((await screen.findByRole('alert')).textContent).toBe('Stop was not confirmed. The answer is still pending; try Stop again.')
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
  it('keeps a collapsed stopped row stopped when expanded', () => {
    render(<AeThreadTurnCollapsed {...turn} status="stopped" />)
    fireEvent.click(screen.getByRole('button', { name: /Expand/ }))
    expect(screen.getByTestId('generic-answer').getAttribute('data-phase')).toBe('stopped')
    expect(screen.getByTestId('generic-answer').textContent).toBe('Answer stopped.')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

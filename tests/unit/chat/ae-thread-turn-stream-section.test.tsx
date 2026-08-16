// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { attachAnswerTurnStream } from '@/components/ae/chat/turn-stream-session'

type AttachStreamInput = Parameters<typeof attachAnswerTurnStream>[0]

const streamSession = vi.hoisted(() => ({
  abort: vi.fn(),
  attach: vi.fn<(input: AttachStreamInput) => () => void>(() => vi.fn()),
}))
const stopState = vi.hoisted(() => ({
  request: vi.fn(),
}))
const readbackState = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('@/components/ae/chat/turn-stop', () => ({
  stopAnswerTurnRequest: stopState.request,
}))
vi.mock('@/components/ae/chat/thread-readback', () => ({
  readAnswerThreadProjection: readbackState.request,
}))
vi.mock('@/components/ae/chat/turn-stream-session', () => ({
  abortAnswerTurnStream: streamSession.abort,
  attachAnswerTurnStream: streamSession.attach,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/ae/artifacts/AeGenerativeAnswer', () => ({
  AeGenerativeAnswer: ({
    busy,
    errorMessage,
    onOperationSelect,
    onStop,
  }: {
    busy?: boolean
    errorMessage?: React.ReactNode
    onOperationSelect?: (...args: never[]) => void
    onStop?: () => void
  }) => (
    <div data-testid="generic-answer" data-selection-enabled={onOperationSelect === undefined ? 'false' : 'true'}>
      {errorMessage}
      {onStop !== undefined ? (
        <button type="button" onClick={onStop} disabled={busy !== true}>Stop</button>
      ) : null}
    </div>
  ),
}))
vi.mock('@/components/ui/message', () => ({
  Message: ({ children, align, ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) => (
    <div data-align={align} {...props}>{children}</div>
  ),
  MessageContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}))
vi.mock('@/components/ae/chat/AeThreadTurnQueryHeader', () => ({ AeThreadTurnQueryHeader: () => <div /> }))
vi.mock('@/components/ae/chat/AeTurnContextLine', () => ({ AeTurnContextLine: () => <div /> }))

import type { AnswerEvent } from '@/modules/answer/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'
import type { ThreadReadbackResult } from '@/components/ae/chat/thread-readback'

import { AeThreadTurnStreamSection } from '@/components/ae/chat/AeThreadTurnStreamSection'
afterEach(cleanup)

beforeEach(() => {
  streamSession.attach.mockClear()
  streamSession.abort.mockClear()
  stopState.request.mockReset()
  readbackState.request.mockReset()
  stopState.request.mockResolvedValue({ kind: 'not_found' })
  readbackState.request.mockResolvedValue({ kind: 'not_found' })
})

describe('thread turn stream lifecycle', () => {
  it('keeps one attachment per generation while callbacks stay fresh', () => {
    const firstThreadCreated = vi.fn()
    const freshThreadCreated = vi.fn()
    const freshStreamEnd = vi.fn()
    const view = render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-1"
        generation={1}
        intent="refine_search"
        onThreadCreated={firstThreadCreated}
      />
    )
    expect(streamSession.attach).toHaveBeenCalledTimes(1)
    const firstAttachment = streamSession.attach.mock.calls[0]?.[0]
    if (firstAttachment === undefined) throw new Error('missing first stream attachment')

    view.rerender(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-1"
        generation={1}
        intent="compare_known"
        threadId="thread:promoted"
        onThreadCreated={freshThreadCreated}
        onStreamEnd={freshStreamEnd}
      />,
    )
    expect(streamSession.attach).toHaveBeenCalledTimes(1)
    firstAttachment.subscriber.onThread?.({ threadId: 'thread:created', turnId: 'turn:1', turnSeq: 1 })
    firstAttachment.subscriber.onResult({ kind: 'aborted' })
    expect(firstThreadCreated).not.toHaveBeenCalled()
    expect(freshThreadCreated).toHaveBeenCalledWith('thread:created', { turnId: 'turn:1', turnSeq: 1 })
    expect(freshStreamEnd).not.toHaveBeenCalled()

    view.rerender(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-2"
        generation={2}
        intent="compare_known"
        threadId="thread:promoted"
        onThreadCreated={freshThreadCreated}
      />,
    )
    expect(streamSession.attach).toHaveBeenCalledTimes(2)
    expect(streamSession.attach.mock.calls[1]?.[0]).toMatchObject({
      key: 'turn-key-2',
      threadId: 'thread:promoted',
    })
    expect(streamSession.abort).not.toHaveBeenCalled()

    firstAttachment.subscriber.onThread?.({ threadId: 'thread:late', turnId: 'turn:late', turnSeq: 2 })
    expect(freshThreadCreated).toHaveBeenCalledTimes(1)
  })

  it('exposes the same active stop authority to the shell composer', async () => {
    const onStopChange = vi.fn<(stop: (() => Promise<void>) | null) => void>()
    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-composer-stop"
        generation={1}
        onStopChange={onStopChange}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')
    act(() => {
      attachment.subscriber.onFrame?.({
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:composer-stop',
          turnId: 'turn:composer-stop',
          turnSeq: 1,
        },
      })
    })
    await waitFor(() => {
      expect(onStopChange.mock.calls.some(([stop]) => stop !== null)).toBe(true)
    })
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()

    const exposedStop = onStopChange.mock.calls.findLast(([stop]) => stop !== null)?.[0]
    if (exposedStop === null || exposedStop === undefined) throw new Error('missing exposed stop')
    await act(async () => {
      await exposedStop()
    })
    expect(stopState.request).toHaveBeenCalledWith({
      threadId: 'thread:composer-stop',
      turnId: 'turn:composer-stop',
    })
  })
  it('withholds operation selection until the current turn has durable completion', async () => {
    const completeTurn = {
      turnId: 'turn:selection',
      seq: 1,
      query: 'Find a plumber',
      intent: 'refine_search',
      status: 'complete',
      workLog: [],
      artifacts: [],
      oneLine: 'A durable answer.',
    } satisfies PublicThreadTurn
    readbackState.request.mockResolvedValue({
      kind: 'ok',
      projection: { threadId: 'thread:selection', title: 'Find a plumber', turns: [completeTurn] },
    })
    const onOperationSelect = vi.fn()
    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-selection"
        generation={1}
        onOperationSelect={onOperationSelect}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')
    expect(screen.getByTestId('generic-answer').getAttribute('data-selection-enabled')).toBe('false')

    await act(async () => {
      attachment.subscriber.onFrame?.({
        seq: 0,
        event: { type: 'thread', threadId: 'thread:selection', turnId: 'turn:selection', turnSeq: 1 },
      })
      attachment.subscriber.onResult({ kind: 'complete' })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('generic-answer').getAttribute('data-selection-enabled')).toBe('true')
  })

  it('keeps the generic answer presenter for streamed answer events', () => {
    const view = render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-3"
        generation={1}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    act(() => {
      const event: AnswerEvent = { type: 'one-line', oneLine: 'Here are the listed options.' }
      attachment.subscriber.onFrame?.({ seq: 1, event })
    })

    expect(view.container.querySelector('[data-testid="generic-answer"]')).not.toBeNull()
    expect(view.container.querySelector('[data-align="start"]')).not.toBeNull()
    expect(view.container.querySelector('[data-slot="bubble"][data-align="start"][data-variant="ghost"]')).not.toBeNull()
  })

  it('keeps Stop actionable through pending settlement and aborts only after stop acknowledgement', async () => {
    const stopDeferred = Promise.withResolvers<{
      kind: 'stopped'
      threadId: string
      turnId: string
    }>()
    const pendingReadback = Promise.withResolvers<ThreadReadbackResult>()
    const stoppedReadback = Promise.withResolvers<ThreadReadbackResult>()
    stopState.request.mockReturnValue(stopDeferred.promise)
    readbackState.request
      .mockImplementationOnce(() => pendingReadback.promise)
      .mockImplementationOnce(() => stoppedReadback.promise)

    const pendingTurn = {
      turnId: 'turn:stop',
      seq: 1,
      query: 'Find a plumber',
      intent: 'refine_search',
      status: 'pending',
      workLog: [],
      artifacts: [],
      oneLine: '',
    } satisfies PublicThreadTurn
    const stoppedTurn = { ...pendingTurn, status: 'stopped' } satisfies PublicThreadTurn
    const onSettledTurn = vi.fn()
    const onStopChange = vi.fn<(stop: (() => Promise<void>) | null) => void>()
    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-stop"
        generation={1}
        onSettledTurn={onSettledTurn}
        onStopChange={onStopChange}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    act(() => {
      attachment.subscriber.onThread?.({ threadId: 'thread:stop', turnId: 'turn:stop', turnSeq: 1 })
      attachment.subscriber.onFrame?.({
        seq: 0,
        event: { type: 'thread', threadId: 'thread:stop', turnId: 'turn:stop', turnSeq: 1 },
      })
      attachment.subscriber.onResult?.({ kind: 'complete' })
    })

    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    pendingReadback.resolve({
      kind: 'ok',
      projection: { threadId: 'thread:stop', title: 'Find a plumber', turns: [pendingTurn] },
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('This response is taking longer than expected.')).toBeTruthy()
    await waitFor(() => {
      expect(onStopChange.mock.calls.some(([stop]) => stop !== null)).toBe(true)
    })
    const exposedStop = onStopChange.mock.calls.findLast(([stop]) => stop !== null)?.[0]
    if (exposedStop === null || exposedStop === undefined) throw new Error('missing exposed stop')

    await act(async () => {
      void exposedStop()
      await Promise.resolve()
    })
    expect(stopState.request).toHaveBeenCalledWith({ threadId: 'thread:stop', turnId: 'turn:stop' })
    expect(streamSession.abort).not.toHaveBeenCalled()

    await act(async () => {
      stopDeferred.resolve({ kind: 'stopped', threadId: 'thread:stop', turnId: 'turn:stop' })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(streamSession.abort).toHaveBeenCalledTimes(1)
    expect(readbackState.request).toHaveBeenCalledTimes(2)

    stoppedReadback.resolve({
      kind: 'ok',
      projection: { threadId: 'thread:stop', title: 'Find a plumber', turns: [stoppedTurn] },
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onSettledTurn).toHaveBeenCalledWith(stoppedTurn, 1)
    expect(screen.getByText('Answer stopped.')).toBeTruthy()
  })
  it('keeps the stream running when Stop fails over the network', async () => {
    const pendingTurn = {
      turnId: 'turn:stop-network',
      seq: 1,
      query: 'Find a plumber',
      intent: 'refine_search',
      status: 'pending',
      workLog: [],
      artifacts: [],
      oneLine: '',
    } satisfies PublicThreadTurn
    readbackState.request.mockResolvedValue({
      kind: 'ok',
      projection: { threadId: 'thread:stop-network', title: 'Find a plumber', turns: [pendingTurn] },
    })
    stopState.request.mockResolvedValue({
      kind: 'transport_error',
      error: {
        kind: 'network',
        code: 'network_error',
        detail: 'The stop request could not be reached.',
      },
    })
    const onStopChange = vi.fn<(stop: (() => Promise<void>) | null) => void>()

    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-stop-network"
        generation={1}
        onStopChange={onStopChange}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    act(() => {
      attachment.subscriber.onThread?.({ threadId: 'thread:stop-network', turnId: 'turn:stop-network', turnSeq: 1 })
      attachment.subscriber.onFrame?.({
        seq: 0,
        event: { type: 'thread', threadId: 'thread:stop-network', turnId: 'turn:stop-network', turnSeq: 1 },
      })
      attachment.subscriber.onResult?.({ kind: 'complete' })
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(onStopChange.mock.calls.some(([stop]) => stop !== null)).toBe(true)
    })
    const exposedStop = onStopChange.mock.calls.findLast(([stop]) => stop !== null)?.[0]
    if (exposedStop === null || exposedStop === undefined) throw new Error('missing exposed stop')
    await act(async () => {
      void exposedStop()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(stopState.request).toHaveBeenCalledWith({
      threadId: 'thread:stop-network',
      turnId: 'turn:stop-network',
    })
    expect(streamSession.abort).not.toHaveBeenCalled()
    const stopFailure = screen.getByText('Stop was not confirmed. The response is still running; try Stop again.')
    expect(stopFailure.classList.contains('text-destructive')).toBe(true)
    expect(document.querySelector('[data-lifecycle="pending"]')).not.toBeNull()
  })

  it('detaches on unmount without issuing Stop or aborting the stream', () => {
    const detach = vi.fn()
    streamSession.attach.mockReturnValueOnce(detach)

    const view = render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-unmount"
        generation={1}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')
    act(() => {
      attachment.subscriber.onThread?.({ threadId: 'thread:unmount', turnId: 'turn:unmount', turnSeq: 1 })
    })

    view.unmount()

    expect(detach).toHaveBeenCalledTimes(1)
    expect(stopState.request).not.toHaveBeenCalled()
    expect(streamSession.abort).not.toHaveBeenCalled()
  })

  it('does not render durable stopped after a local abort without Stop acknowledgement', async () => {
    const onStreamEnd = vi.fn()
    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-local-abort"
        generation={1}
        onStreamEnd={onStreamEnd}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    act(() => {
      attachment.subscriber.onThread?.({ threadId: 'thread:local-abort', turnId: 'turn:local-abort', turnSeq: 1 })
      attachment.subscriber.onResult?.({ kind: 'aborted' })
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(document.querySelector('[data-lifecycle="streaming"]')).not.toBeNull()
    expect(screen.queryByText('Answer stopped.')).toBeNull()
    expect(readbackState.request).not.toHaveBeenCalled()
    expect(stopState.request).not.toHaveBeenCalled()
    expect(onStreamEnd).not.toHaveBeenCalled()
  })

  it('retries one transient readback without reattaching the stream', async () => {
    vi.useFakeTimers()
    try {
      const completeTurn = {
        turnId: 'turn:retry',
        seq: 1,
        query: 'Find a plumber',
        intent: 'refine_search',
        status: 'complete',
        workLog: [],
        artifacts: [],
        oneLine: 'A durable answer.',
      } satisfies PublicThreadTurn
      readbackState.request
        .mockResolvedValueOnce({
          kind: 'transport_error',
          error: {
            kind: 'network',
            code: 'network_error',
            detail: 'The thread could not be reached.',
          },
        })
        .mockResolvedValueOnce({
          kind: 'ok',
          projection: { threadId: 'thread:retry', title: 'Find a plumber', turns: [completeTurn] },
        })
      const onSettledTurn = vi.fn()
      const onStreamEnd = vi.fn()
      const view = render(
        <AeThreadTurnStreamSection
          query="Find a plumber"
          clientTurnKey="turn-key-retry"
          generation={1}
          onSettledTurn={onSettledTurn}
          onStreamEnd={onStreamEnd}
        />,
      )
      const attachment = streamSession.attach.mock.calls[0]?.[0]
      if (attachment === undefined) throw new Error('missing stream attachment')

      act(() => {
        attachment.subscriber.onFrame?.({
          seq: 0,
          event: { type: 'thread', threadId: 'thread:retry', turnId: 'turn:retry', turnSeq: 1 },
        })
        attachment.subscriber.onResult?.({ kind: 'complete' })
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(readbackState.request).toHaveBeenCalledTimes(1)
      expect(streamSession.attach).toHaveBeenCalledTimes(1)

      await act(async () => {
        vi.runOnlyPendingTimers()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(readbackState.request).toHaveBeenCalledTimes(2)
      expect(streamSession.attach).toHaveBeenCalledTimes(1)
      expect(onSettledTurn).toHaveBeenCalledWith(completeTurn, 1)
      expect(onStreamEnd).toHaveBeenCalledWith('complete')
      expect(view.container.querySelector('[data-lifecycle="complete"]')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
  it('keeps a pre-reservation HTTP problem instead of replacing it with missing-stream copy', async () => {
    const onStreamEnd = vi.fn()
    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-unavailable"
        generation={1}
        onStreamEnd={onStreamEnd}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    await act(async () => {
      attachment.subscriber.onResult?.({
        kind: 'problem',
        problem: {
          type: 'about:blank',
          title: 'Unavailable',
          status: 503,
          detail: 'The answer service is temporarily unavailable.',
          kind: 'UNAVAILABLE',
          code: 'unavailable',
          retryable: true,
        },
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(readbackState.request).not.toHaveBeenCalled()
    expect(onStreamEnd).toHaveBeenCalledWith('error')
    await waitFor(() => expect(screen.getByText('The answer service is temporarily unavailable.')).toBeTruthy())
    expect(screen.queryByText(/durable turn identity/i)).toBeNull()
  })

  it('uses direct not-found recovery copy with actionable retry and new-chat links', async () => {
    const onRetry = vi.fn()
    render(
      <AeThreadTurnStreamSection
        query="Find a plumber"
        clientTurnKey="turn-key-not-found"
        generation={1}
        onRetry={onRetry}
      />,
    )
    const attachment = streamSession.attach.mock.calls[0]?.[0]
    if (attachment === undefined) throw new Error('missing stream attachment')

    await act(async () => {
      attachment.subscriber.onFrame?.({
        seq: 0,
        event: {
          type: 'thread',
          threadId: 'thread:not-found',
          turnId: 'turn:not-found',
          turnSeq: 1,
        },
      })
      attachment.subscriber.onResult({ kind: 'complete' })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('This response is no longer available.')).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.getAttribute('data-variant')).toBe('default')
    expect(retry.getAttribute('data-size')).toBe('sm')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledOnce()
    const newChat = screen.getByRole('link', { name: 'New chat' })
    expect(newChat.getAttribute('href')).toBe('/')
    expect(newChat.getAttribute('data-variant')).toBe('ghost')
    expect(newChat.getAttribute('data-size')).toBe('sm')
  })
})

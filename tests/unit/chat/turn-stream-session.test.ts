import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AnswerStreamFrame,
  StreamAnswerResult,
  streamAnswerTurnRequest,
} from '@/components/ae/chat/answer-stream'

type StreamRequestInput = Parameters<typeof streamAnswerTurnRequest>[0]

type StreamRequest = {
  input: StreamRequestInput
  resolve: (result: StreamAnswerResult) => void
}

const streamState = vi.hoisted(() => ({
  requests: [] as StreamRequest[],
}))

vi.mock('@/components/ae/chat/answer-stream', () => ({
  streamAnswerTurnRequest: (input: StreamRequestInput) => {
    const deferred = Promise.withResolvers<StreamAnswerResult>()
    streamState.requests.push({ input, resolve: deferred.resolve })
    return deferred.promise
  },
}))

import {
  abortAnswerTurnStream,
  attachAnswerTurnStream,
} from '@/components/ae/chat/turn-stream-session'

afterEach(() => {
  for (const request of streamState.requests) {
    if (request.input.signal?.aborted !== true) {
      abortAnswerTurnStream(request.input.clientTurnKey)
    }
  }
  streamState.requests.length = 0
})

function threadFrame(seq: number, turnId = 'turn:1'): AnswerStreamFrame {
  return {
    seq,
    event: {
      type: 'thread',
      threadId: 'thread:1',
      turnId,
      turnSeq: 1,
    },
  }
}

function requestAt(index: number): StreamRequest {
  const request = streamState.requests[index]
  if (request === undefined) {
    throw new Error(`Missing stream request at index ${index}.`)
  }
  return request
}

describe('attachAnswerTurnStream', () => {
  it('accepts server sequence zero once and suppresses a duplicate sequence', () => {
    const subscriber = {
      onFrame: vi.fn<(frame: AnswerStreamFrame) => void>(),
      onResult: vi.fn<(result: StreamAnswerResult) => void>(),
    }
    const detach = attachAnswerTurnStream({
      key: 'seq-zero-key',
      query: 'Find a plumber',
      subscriber,
    })
    const request = requestAt(0)
    const first = threadFrame(0)

    request.input.onFrame(first)
    request.input.onFrame({ seq: 0, event: { type: 'one-line', oneLine: 'duplicate' } })

    expect(subscriber.onFrame).toHaveBeenCalledTimes(1)
    expect(subscriber.onFrame).toHaveBeenCalledWith(first)
    detach()
  })

  it('ignores stale settlement after an aborted session is replaced under the same key', async () => {
    const key = 'replacement-race-key'
    const oldSubscriber = {
      onFrame: vi.fn<(frame: AnswerStreamFrame) => void>(),
      onResult: vi.fn<(result: StreamAnswerResult) => void>(),
    }
    const detachOld = attachAnswerTurnStream({ key, query: 'Old query', subscriber: oldSubscriber })
    const oldRequest = requestAt(0)

    abortAnswerTurnStream(key)

    const replacementSubscriber = {
      onFrame: vi.fn<(frame: AnswerStreamFrame) => void>(),
      onResult: vi.fn<(result: StreamAnswerResult) => void>(),
    }
    const detachReplacement = attachAnswerTurnStream({ key, query: 'Replacement query', subscriber: replacementSubscriber })
    const replacementRequest = requestAt(1)

    oldRequest.resolve({ kind: 'complete' })
    await Promise.resolve()
    await Promise.resolve()

    expect(oldSubscriber.onResult).not.toHaveBeenCalled()

    replacementRequest.input.onFrame(threadFrame(0, 'turn:replacement'))
    expect(replacementSubscriber.onFrame).toHaveBeenCalledTimes(1)

    replacementRequest.resolve({ kind: 'complete' })
    await Promise.resolve()
    await Promise.resolve()
    expect(replacementSubscriber.onResult).toHaveBeenCalledWith({ kind: 'complete' })

    detachOld()
    detachReplacement()
  })
})


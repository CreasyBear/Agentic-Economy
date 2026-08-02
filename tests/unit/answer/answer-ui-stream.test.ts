import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { describe, expect, it } from 'vitest'

import {
  ANSWER_TURN_DATA_PART,
  readAnswerTurnFrames,
  type AnswerTurnFrame,
  type AnswerTurnUIMessage,
} from '@/modules/answer/public'

function answerTurnResponse(frames: readonly AnswerTurnFrame[]): Response {
  const stream = createUIMessageStream<AnswerTurnUIMessage>({
    execute: ({ writer }) => {
      for (const frame of frames) {
        writer.write({ type: ANSWER_TURN_DATA_PART, data: frame, transient: true })
      }
    },
    onError: () => 'answer_turn_failed',
  })
  return createUIMessageStreamResponse({ stream })
}

async function drain(response: Response): Promise<AnswerTurnFrame[]> {
  if (response.body === null) throw new Error('answer turn response had no body')
  const received: AnswerTurnFrame[] = []
  for await (const frame of readAnswerTurnFrames(response.body)) {
    received.push(frame)
  }
  return received
}

describe('answer turn UI message stream', () => {
  it('round-trips every turn frame in order through the SDK wire format', async () => {
    const sent: AnswerTurnFrame[] = [
      { seq: 0, event: { type: 'thread', threadId: 'thread:1', turnId: 'turn:1', turnSeq: 1 } },
      { seq: 1, event: { type: 'one-line', oneLine: 'Three photographers are open.' } },
      { seq: 2, event: { type: 'summary-delta', delta: 'They all quote same-week.' } },
      { seq: 3, event: { type: 'error', code: 'answer_turn_failed', copyId: 'turn-abc' } },
    ]

    const received = await drain(answerTurnResponse(sent))

    expect(received).toEqual(sent)
  })

  it('serves the SSE media type so agent clients keep their documented contract', () => {
    const response = answerTurnResponse([])
    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })

  it('ignores lifecycle chunks that are not AE turn frames', async () => {
    const stream = createUIMessageStream<AnswerTurnUIMessage>({
      execute: ({ writer }) => {
        writer.write({ type: 'start' })
        writer.write({
          type: ANSWER_TURN_DATA_PART,
          data: { seq: 0, event: { type: 'one-line', oneLine: 'Only this survives.' } },
          transient: true,
        })
        writer.write({ type: 'finish' })
      },
      onError: () => 'answer_turn_failed',
    })

    const received = await drain(createUIMessageStreamResponse({ stream }))

    expect(received).toEqual([
      { seq: 0, event: { type: 'one-line', oneLine: 'Only this survives.' } },
    ])
  })

  it('drops a malformed frame instead of failing the whole turn', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: ANSWER_TURN_DATA_PART, data: { seq: 'nope' } })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: ANSWER_TURN_DATA_PART,
          data: { seq: 1, event: { type: 'one-line', oneLine: 'Recovered.' } },
        })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const received: AnswerTurnFrame[] = []
    for await (const frame of readAnswerTurnFrames(body)) {
      received.push(frame)
    }

    expect(received).toEqual([{ seq: 1, event: { type: 'one-line', oneLine: 'Recovered.' } }])
  })
})

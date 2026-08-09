import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { describe, expect, it } from 'vitest'

import {
  ANSWER_TURN_DATA_PART,
  buildAnswerTurnProblem,
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
function rawAnswerTurnResponse(event: unknown): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: ANSWER_TURN_DATA_PART,
      data: { seq: 0, event },
    })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('answer turn UI message stream', () => {
  it('round-trips every turn frame in order through the SDK wire format', async () => {
    const sent: AnswerTurnFrame[] = [
      { seq: 0, event: { type: 'thread', threadId: 'thread:1', turnId: 'turn:1', turnSeq: 1 } },
      { seq: 1, event: { type: 'one-line', oneLine: 'Three photographers are open.' } },
      { seq: 2, event: { type: 'summary-delta', delta: 'They all quote same-week.' } },
      { seq: 3, event: { type: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') } },
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
        writer.write({
          type: ANSWER_TURN_DATA_PART,
          data: { seq: 1, event: { type: 'pending' } },
          transient: true,
        })
        writer.write({ type: 'finish' })
      },
      onError: () => 'answer_turn_failed',
    })

    const received = await drain(createUIMessageStreamResponse({ stream }))

    expect(received).toEqual([
      { seq: 0, event: { type: 'one-line', oneLine: 'Only this survives.' } },
      { seq: 1, event: { type: 'pending' } },
    ])
  })
  it('preserves explicit pending and stopped replay terminals', async () => {
    for (const terminal of [{ type: 'pending' }, { type: 'stopped' }] as const) {
      const received = await drain(answerTurnResponse([
        { seq: 0, event: { type: 'thread', threadId: 'thread:replay', turnId: 'turn:replay', turnSeq: 1 } },
        { seq: 1, event: terminal },
      ]))
      expect(received.at(-1)?.event).toEqual(terminal)
    }
  })

  it('rejects a stream that ends without a terminal lifecycle event', async () => {
    await expect(drain(answerTurnResponse([
      { seq: 0, event: { type: 'one-line', oneLine: 'Truncated.' } },
    ]))).rejects.toMatchObject({
      name: 'AnswerTurnProtocolError',
      code: 'malformed_sse',
    })
  })

  it('rejects data emitted after a terminal lifecycle event', async () => {
    await expect(drain(answerTurnResponse([
      {
        seq: 0,
        event: {
          type: 'complete',
          answer: {
            query: 'done',
            oneLine: 'Done.',
            providers: [],
            summary: 'Done.',
            nextStep: 'Stop.',
            agentJsonUrl: '/api/agent?q=done',
          },
        },
      },
      { seq: 1, event: { type: 'one-line', oneLine: 'Late data.' } },
    ]))).rejects.toMatchObject({
      name: 'AnswerTurnProtocolError',
      code: 'malformed_sse',
    })
  })

  it('parses every current AnswerEvent variant with its required payloads', async () => {
    const provider = {
      citationIndex: 1,
      slug: 'photographer-one',
      name: 'Photographer One',
      category: 'Photography',
      suburb: 'Perth',
      stateTerritory: 'WA',
      serviceArea: 'Perth',
      hoursLabel: 'Open today',
      availabilityLabel: 'Available',
      trustLabel: 'Listed',
      responseTimeLabel: 'Replies today',
      trustCue: 'Published profile',
      nextStepLabel: 'Request a quote',
      detailUrl: '/business/photographer-one',
      services: [{ name: 'Wedding photography', category: 'Photography', summary: 'Full-day coverage' }],
    }
    const answer = {
      query: 'wedding photographer',
      oneLine: 'Photographer One is available.',
      providers: [provider],
      summary: 'A grounded summary.',
      nextStep: 'Request a quote.',
      agentJsonUrl: '/api/agent?q=wedding+photographer',
    }
    const sent: AnswerTurnFrame[] = [
      { seq: 0, event: { type: 'thread', threadId: 'thread:all', turnId: 'turn:all', turnSeq: 1 } },
      {
        seq: 1,
        event: {
          type: 'work-step',
          step: { id: 'step-1', phase: 'search', status: 'running', title: 'Finding matches' },
        },
      },
      { seq: 2, event: { type: 'thinking', step: 'read', label: 'Reading details' } },
      {
        seq: 3,
        event: {
          type: 'plan',
          mode: 'answer',
          layoutProfile: 'discovery_full',
          providerBudget: { searchLimit: 3, visibleLimit: 1 },
          artifactBudget: {
            layoutProfile: 'discovery_full',
            allowedKinds: ['one-line'],
            maxArtifactCount: 1,
            maxProviderCards: 1,
          },
        },
      },
      { seq: 4, event: { type: 'one-line', oneLine: answer.oneLine } },
      { seq: 5, event: { type: 'sources', providers: [provider] } },
      { seq: 6, event: { type: 'summary-delta', delta: 'A grounded summary.' } },
      { seq: 7, event: { type: 'next-step', nextStep: answer.nextStep } },
      { seq: 8, event: { type: 'artifact', artifact: { kind: 'one-line', text: answer.oneLine } } },
      { seq: 9, event: { type: 'complete', answer } },

    ]

    await expect(drain(answerTurnResponse(sent))).resolves.toEqual(sent)
  })

  it('rejects unknown and malformed event variants at the SSE boundary', async () => {
    const malformedEvents: unknown[] = [
      { type: 'unknown' },
      { type: 'thread', threadId: 'thread:1', turnId: 'turn:1' },
      { type: 'complete', answer: { query: 'missing required snapshot fields' } },
      { type: 'error', problem: { ...buildAnswerTurnProblem('answer_turn_failed'), copyId: 'private' } },
    ]

    for (const event of malformedEvents) {
      await expect(drain(rawAnswerTurnResponse(event))).rejects.toMatchObject({
        name: 'AnswerTurnProtocolError',
        code: 'malformed_sse',
      })
    }
  })

  it('classifies a malformed frame as a protocol failure', async () => {
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

    await expect((async () => {
      for await (const frame of readAnswerTurnFrames(body)) {
        void frame
      }
    })()).rejects.toMatchObject({ name: 'AnswerTurnProtocolError', code: 'malformed_sse' })
  })
})

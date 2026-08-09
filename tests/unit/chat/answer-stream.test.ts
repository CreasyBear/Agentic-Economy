import { describe, expect, it, vi } from 'vitest'

import { buildAnswerTurnProblem } from '@/lib/errors'
import { streamAnswerTurnRequest } from '@/components/ae/chat/answer-stream'

function answerStreamResponse(event: unknown): Response {
  const body = [
    {
      type: 'data-answer-event',
      data: { seq: 0, event },
    },
    {
      type: 'data-answer-event',
      data: {
        seq: 1,
        event: {
          type: 'complete',
          answer: {
            query: 'bitcoin price',
            oneLine: 'A grounded answer.',
            providers: [],
            summary: 'A grounded answer.',
            nextStep: 'Continue.',
            agentJsonUrl: '/api/agent?q=bitcoin+price',
          },
        },
      },
    },
  ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

describe('browser answer stream transport', () => {
  it('parses a safe RFC problem response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      type: 'about:blank',
      title: 'provider leaked',
      status: 429,
      kind: 'RESOURCE_EXHAUSTED',
      code: 'rate_limited',
      detail: 'secret upstream detail',
      copyId: 'private-copy-id',
    }, { status: 429 })))

    const result = await streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: 'turn-key-1',
      onFrame: vi.fn(),
    })

    expect(result).toEqual({ kind: 'problem', problem: buildAnswerTurnProblem('rate_limited') })
  })

  it('distinguishes malformed SSE from network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: {"type":"data-answer-event","data":{"seq":"bad"}}\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )))

    const malformed = await streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: 'turn-key-2',
      onFrame: vi.fn(),
    })
    expect(malformed).toMatchObject({ kind: 'transport_error', error: { kind: 'protocol', code: 'malformed_sse' } })

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('socket secret') }))
    const network = await streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: 'turn-key-3',
      onFrame: vi.fn(),
    })
    expect(JSON.stringify(network)).not.toContain('socket secret')
  })

  it('returns complete only after a valid frame stream and sends the required key', async () => {
    const onFrame = vi.fn()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('X-AE-Turn-Key')).toBe('turn-key-4')
      return answerStreamResponse({ type: 'one-line', oneLine: 'A grounded answer.' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: 'turn-key-4',
      onFrame,
    })

    expect(result).toEqual({ kind: 'complete' })
    expect(onFrame).toHaveBeenCalledTimes(2)
  })
})

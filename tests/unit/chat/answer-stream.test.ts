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
function terminalStreamResponse(...events: readonly unknown[]): Response {
  const body = events.map((event, seq) => `data: ${JSON.stringify({
    type: 'data-answer-event',
    data: { seq, event },
  })}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(
    body,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}

const completeTerminal = {
  type: 'complete',
  answer: {
    query: 'bitcoin price',
    oneLine: 'A grounded answer.',
    providers: [],
    summary: 'A grounded answer.',
    nextStep: 'Continue.',
    agentJsonUrl: '/api/agent?q=bitcoin+price',
  },
} as const
const errorTerminal = {
  type: 'error',
  problem: buildAnswerTurnProblem('rate_limited'),
} as const


describe('browser answer stream transport', () => {
  it('parses a safe RFC problem response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(
      buildAnswerTurnProblem('rate_limited'),
      { status: 429 },
    )))

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

  it('rejects a malformed RFC problem body as a protocol failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ...buildAnswerTurnProblem('rate_limited'),
      detail: 'provider detail',
    }, { status: 429 })))

    const result = await streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: 'turn-key-malformed-problem',
      onFrame: vi.fn(),
    })

    expect(result).toEqual({
      kind: 'transport_error',
      error: expect.objectContaining({ kind: 'protocol', code: 'malformed_problem' }),
    })
  })

  it('keeps pending and stopped terminal outcomes distinct from complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => (
      JSON.parse(String(init?.body)).query === 'pending'
        ? terminalStreamResponse({ type: 'pending' })
        : terminalStreamResponse({ type: 'stopped' })
    )))

    await expect(streamAnswerTurnRequest({
      query: 'pending',
      clientTurnKey: 'turn-key-pending',
      onFrame: vi.fn(),
    })).resolves.toEqual({ kind: 'pending' })
    await expect(streamAnswerTurnRequest({
      query: 'stopped',
      clientTurnKey: 'turn-key-stopped',
      onFrame: vi.fn(),
    })).resolves.toEqual({ kind: 'stopped' })
  })

  it.each([
    ['complete then error', [completeTerminal, errorTerminal]],
    ['error then complete', [errorTerminal, completeTerminal]],
  ] as const)('rejects a second terminal frame: %s', async (_label, events) => {
    vi.stubGlobal('fetch', vi.fn(async () => terminalStreamResponse(...events)))

    await expect(streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: `turn-key-duplicate-${_label.replaceAll(' ', '-')}`,
      onFrame: vi.fn(),
    })).resolves.toEqual({
      kind: 'transport_error',
      error: expect.objectContaining({ kind: 'protocol', code: 'malformed_sse' }),
    })
  })

  it('rejects a stream with no terminal frame as a protocol failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => terminalStreamResponse({
      type: 'one-line',
      oneLine: 'Still streaming.',
    })))

    await expect(streamAnswerTurnRequest({
      query: 'bitcoin price',
      clientTurnKey: 'turn-key-missing-terminal',
      onFrame: vi.fn(),
    })).resolves.toEqual({
      kind: 'transport_error',
      error: expect.objectContaining({ kind: 'protocol', code: 'malformed_sse' }),
    })
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

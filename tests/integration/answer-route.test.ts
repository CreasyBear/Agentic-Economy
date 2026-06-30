import { describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { handleAnswerRequest } from '@/routes/api.answer'

const QUERY = 'emergency plumber parramatta'

type StreamFrame = { seq: number; event: AnswerEvent }

function parseStream(text: string): StreamFrame[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice('data:'.length).trim()) as StreamFrame)
}

describe('GET /api/answer', () => {
  it('returns a safe unavailable JSON response when streaming is off', async () => {
    const response = await handleAnswerRequest(
      new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}`),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')

    const body = (await response.json()) as {
      kind: string
      code: string
      copyId: string
    }

    expect(body.kind).toBe('error')
    expect(body.code).toBe('answer_unavailable')
    expect(body.copyId).toMatch(/^answer-/)
  })

  it('streams a safe unavailable SSE event with a stop-friendly no-store response', async () => {
    const response = await handleAnswerRequest(
      new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}&stream=1`),
    )

    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-accel-buffering')).toBe('no')

    const frames = parseStream(await response.text())

    expect(frames).toHaveLength(1)
    expect(frames[0]?.seq).toBe(0)
    expect(frames[0]?.event).toMatchObject({
      type: 'error',
      code: 'answer_unavailable',
    })
  })

  it('continues seqs after the requested event when replaying the unavailable event', async () => {
    const response = await handleAnswerRequest(
      new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}&stream=1&after=2`),
    )

    const frames = parseStream(await response.text())

    expect(frames).toHaveLength(1)
    expect(frames[0]?.seq).toBe(3)
    expect(frames[0]?.event.type).toBe('error')
  })
})

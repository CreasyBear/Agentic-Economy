import { describe, expect, it } from 'vitest'

import { handleAnswerRequest } from '@/routes/api.answer'
import type { AnswerEvent } from '@/modules/answer/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

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
  it('returns a JSON snapshot when streaming is off', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerRequest(
        new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}`)
      )

      expect(response.headers.get('content-type')).toContain('application/json')
      expect(response.headers.get('cache-control')).toBe('no-store')

      const body = (await response.json()) as {
        providers: readonly { slug: string; detailUrl: string }[]
        summary: string
        agentJsonUrl: string
      }

      expect(body.providers.length).toBeGreaterThan(0)
      expect(body.providers[0]?.slug).toBe('parramatta-emergency-plumbing')
      expect(body.summary).toContain('No booking or payment happens on this page')
      expect(body.agentJsonUrl).toContain('/api/businesses/search')
    })
  })

  it('streams the full SSE event sequence with a stop-friendly no-store response', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerRequest(
        new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}&stream=1`)
      )

      expect(response.headers.get('content-type')).toContain('text/event-stream')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('x-accel-buffering')).toBe('no')

      const frames = parseStream(await response.text())
      const events = frames.map((frame) => frame.event)
      const types = events.map((event) => event.type)

      expect(types[0]).toBe('thinking')
      expect(types[1]).toBe('one-line')
      expect(types).toContain('sources')
      expect(types).toContain('summary-delta')
      expect(types).toContain('next-step')
      expect(types.at(-1)).toBe('complete')

      // Every frame carries a monotonically increasing seq (resumable reconnect).
      const seqs = frames.map((frame) => frame.seq)
      expect(seqs).toEqual(seqs.map((_, i) => i))
    })
  })

  it('replays only events after the requested seq on reconnect', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      // Prime the cache so resumption replays the cached snapshot.
      await handleAnswerRequest(
        new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}&stream=1`)
      )

      const response = await handleAnswerRequest(
        new Request(`https://ae.example/api/answer?q=${encodeURIComponent(QUERY)}&stream=1&after=2`)
      )

      const frames = parseStream(await response.text())
      const seqs = frames.map((frame) => frame.seq)

      // Nothing the client already saw is replayed; seqs continue from after + 1.
      expect(seqs.every((seq) => seq > 2)).toBe(true)
      expect(seqs.at(0)).toBe(3)
      expect(frames.at(-1)?.event.type).toBe('complete')
    })
  })

  it('streams an empty answer when no providers match', async () => {
    const state = createDefaultRegistrySourceState()

    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerRequest(
        new Request('https://ae.example/api/answer?q=zzz-no-such-trade-xyz&stream=1')
      )
      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event

      if (complete?.type !== 'complete') {
        throw new Error('Expected a complete event.')
      }

      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toMatch(/No listed businesses match/)
    })
  })
})

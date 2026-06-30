import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { handleChatRequest } from '@/routes/api.chat'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

type StreamFrame = { seq: number; event: AnswerEvent }

function parseStream(text: string): StreamFrame[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map(
      (frame) => JSON.parse(frame.slice('data:'.length).trim()) as StreamFrame,
    )
}

describe('POST /api/chat (deprecated, dev-only)', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_ALLOW_CHAT_API
  })

  it('returns 503 when OpenRouter is not configured', async () => {
    process.env.AE_ALLOW_CHAT_API = '1'
    const response = await handleChatRequest(
      new Request('https://ae.example/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'emergency plumber parramatta' }),
      }),
    )

    expect(response.status).toBe(503)
  })

  it('streams a safe chat_unavailable error - no deterministic prose path remains', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.AE_ALLOW_CHAT_API = '1'

    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleChatRequest(
        new Request('https://ae.example/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'emergency plumber parramatta' }),
        }),
      )

      expect(response.headers.get('content-type')).toContain('text/event-stream')
      const frames = parseStream(await response.text())
      const lastEvent = frames.at(-1)?.event
      expect(lastEvent?.type).toBe('error')
      if (lastEvent?.type !== 'error') {
        throw new Error('expected error event')
      }
      expect(lastEvent.code).toBe('chat_unavailable')
    })
  })
})

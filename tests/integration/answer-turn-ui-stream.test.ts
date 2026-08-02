import { afterEach, describe, expect, it, vi } from 'vitest'

import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'

import { readAnswerTurnStream } from '../helpers/answer-turn-stream'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

/**
 * The rate-limit seam calls a live Convex deployment, which no source-level
 * suite can reach. Admitting every request here keeps this test about the wire
 * format: that the real route handler produces a stream the real browser reader
 * consumes, end to end, with no hand-rolled framing on either side.
 */
vi.mock('@/lib/server/rate-limit', () => ({
  assertHttpAdmission: async () => ({ ok: true as const }),
  requestAdmissionKey: () => 'test-admission-key',
}))

describe('POST /api/answer/turn UI message stream', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
    vi.restoreAllMocks()
  })

  it('streams a full turn the browser reader can consume without any hand-rolled parsing', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'Three studios are open this week.',
        summary: 'All three publish same-week availability.',
        whatToDoNow: 'Send one a first message.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    const turns: unknown[] = []
    setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => {
        turns.push(args)
        return { turnId: args.turnId }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ page: [], isDone: true, continueCursor: '' }),
    })

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'wedding photographer in parramatta' }),
        }),
      )

      expect(response.ok).toBe(true)
      // The SDK owns framing and headers; agent callers still see SSE.
      expect(response.headers.get('content-type')).toContain('text/event-stream')

      const frames = await readAnswerTurnStream(response)

      // A turn that produced no frames would mean the writer never reached the
      // wire — the exact failure a green typecheck cannot catch.
      expect(frames.length).toBeGreaterThan(0)

      // Sequence numbers are the client reducer's ordering contract.
      expect(frames.map((frame) => frame.seq)).toEqual(
        frames.map((_frame, index) => index),
      )

      const kinds = frames.map((frame) => frame.event.type)
      expect(kinds[0]).toBe('thread')
      expect(kinds.at(-1) === 'complete' || kinds.at(-1) === 'error').toBe(true)

      // The durable record, not the wire, is the replay source: transient data
      // parts must still have persisted a turn.
      expect(turns).toHaveLength(1)
    } finally {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      restoreOpenRouter()
      await server.close()
    }
  })

  it('refuses an oversized body before opening a stream', async () => {
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: '' },
        body: JSON.stringify({ query: 'x'.repeat(32 * 1024) }),
      }),
    )

    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toContain('application/json')
  })
})

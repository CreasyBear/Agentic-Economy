import { afterEach, describe, expect, it } from 'vitest'

import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { handleListAnswerThreadsRequest } from '@/routes/api.answer.threads'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  readSessionCookieFromResponse,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

describe('session sidebar after the first turn', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    delete process.env.AE_ANSWER_SYNTHESIZER
  })

  it('lists the first thread in /api/answer/threads so the sidebar can render it', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

        // First turn: no threadId, no session cookie yet.
        const turnResponse = await handleAnswerTurnRequest(
          new Request('https://ae.example/api/answer/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'emergency plumber parramatta' }),
          }),
        )

        expect(turnResponse.ok).toBe(true)
        // Drain the SSE stream so the turn persists before the sidebar query.
        await turnResponse.text()
        const sessionCookie = readSessionCookieFromResponse(turnResponse)
        expect(sessionCookie.length).toBeGreaterThan(0)

        // The sidebar refreshes from /api/answer/threads after a turn completes.
        // Reuse the session cookie so the new thread is attributed to this session.
        const listResponse = await handleListAnswerThreadsRequest(
          new Request('https://ae.example/api/answer/threads', {
            headers: { cookie: sessionCookieHeader(sessionCookie) },
          }),
        )

        const body = (await listResponse.json()) as {
          threads: readonly { threadId: string; title: string }[]
        }
        expect(body.threads.length).toBeGreaterThanOrEqual(1)
        expect(body.threads[0]?.title).toBe('emergency plumber parramatta')
        expect(server.requests.length).toBeLessThanOrEqual(2)
      } finally {
        restoreOpenRouter()
        await server.close()
        if (previousLocalRegistry === undefined) {
          delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
        } else {
          process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
        }
        resetPort()
      }
  })

  it('keeps the sidebar empty for a fresh session that has not asked anything', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const response = await handleListAnswerThreadsRequest(
        new Request('https://ae.example/api/answer/threads'),
      )
      const body = (await response.json()) as { threads: readonly unknown[] }
      expect(body.threads).toEqual([])
    } finally {
      resetPort()
    }
  })
})

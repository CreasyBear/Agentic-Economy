import { afterEach, describe, expect, it } from 'vitest'

import { buildPublicThreadSeo } from '@/modules/seo/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { handleGetAnswerThreadRequest } from '@/routes/api.answer.threads.$threadId'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  readSessionCookieFromResponse,
} from '../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

describe('public thread share route', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
  })

  it('loads the public projection and OG tags without auth', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business confirms timing, price, availability, and the work.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. The business confirms timing, price, availability, and the work.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

        const turnResponse = await handleAnswerTurnRequest(
          new Request('https://ae.example/api/answer/turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'emergency plumber parramatta' }),
          }),
        )
        await turnResponse.text()
        const sessionCookie = readSessionCookieFromResponse(turnResponse)
        expect(sessionCookie.length).toBeGreaterThan(0)

        const threadId = [...store.threads.values()].at(0)?.threadId
        expect(threadId).toBeDefined()

        // Share fetch carries NO session cookie - public projection must load anyway.
        const shareResponse = await handleGetAnswerThreadRequest(threadId as string)
        expect(shareResponse.status).toBe(200)

        const projection = (await shareResponse.json()) as {
          threadId: string
          title: string
          turns: readonly { oneLine: string; query: string }[]
        }
        expect(projection.threadId).toBe(threadId)
        expect(projection.title).toBe('emergency plumber parramatta')
        expect(projection.turns.length).toBeGreaterThanOrEqual(1)

        const firstTurn = projection.turns.at(0)
        const seo = buildPublicThreadSeo({
          threadId: projection.threadId,
          title: projection.title,
          ...(firstTurn === undefined ? {} : { firstTurnOneLine: firstTurn.oneLine }),
          options: { canonicalBaseUrl: 'https://ae.example' },
        })

        expect(seo.canonicalUrl).toBe(`https://ae.example/t/${threadId}`)
        expect(seo.indexDirective).toBe('noindex')
        expect(seo.ogType).toBe('article')
        expect(seo.title).toContain('Agentic Economy')
        // Share copy must stay boundary-honest.
        expect(seo.description).not.toMatch(/book now|booking confirmed|pay now|payment required/i)
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

  it('returns 404 for an unknown thread without auth', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const response = await handleGetAnswerThreadRequest('thr_does_not_exist')
      expect(response.status).toBe(404)
    } finally {
      resetPort()
    }
  })
})

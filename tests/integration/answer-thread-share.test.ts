import { afterEach, describe, expect, it } from 'vitest'

import { buildSharedThreadSeo } from '@/modules/seo/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { handleIssueAnswerThreadShareRequest } from '@/routes/api.answer.threads.$threadId.share'
import { loadSharedThreadRouteReadback } from '@/routes/s.$shareToken'
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

describe('public thread share route', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
  })

  it('loads the public projection and OG tags without auth', async () => {
    const canonicalBaseUrl = 'https://share.agentic.test'
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
    const previousCanonicalBaseUrl = process.env.AE_CANONICAL_BASE_URL

    try {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
      process.env.AE_CANONICAL_BASE_URL = canonicalBaseUrl

        const turnResponse = await handleAnswerTurnRequest(
          new Request(`${canonicalBaseUrl}/api/answer/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-AE-Turn-Key': 'share:emergency-plumber-parramatta' },
            body: JSON.stringify({ query: 'emergency plumber parramatta' }),
          }),
        )
        await turnResponse.text()
        const sessionCookie = readSessionCookieFromResponse(turnResponse)
        expect(sessionCookie.length).toBeGreaterThan(0)

        const threadId = [...store.threads.values()].at(0)?.threadId
        expect(threadId).toBeDefined()

        // Issue the share grant through the current owner API, then read the
        // projection through the token-only public route seam.
        const shareResponse = await handleIssueAnswerThreadShareRequest(
          new Request(`${canonicalBaseUrl}/api/answer/threads/${encodeURIComponent(threadId as string)}/share`, {
            method: 'POST',
            headers: { cookie: sessionCookieHeader(sessionCookie) },
          }),
          threadId as string,
        )
        expect(shareResponse.status).toBe(200)
        const shareBody = (await shareResponse.json()) as { sharePath: string }
        expect(shareBody.sharePath).toMatch(/^\/s\/[0-9a-f]{64}$/)
        const shareToken = shareBody.sharePath.slice('/s/'.length)

        const routeReadback = await loadSharedThreadRouteReadback(
          shareToken,
          new Request(`${canonicalBaseUrl}${shareBody.sharePath}`),
        )
        expect(routeReadback.projection).not.toBeNull()
        if (routeReadback.projection === null) {
          throw new Error('Expected a public shared thread projection.')
        }
        const projection = routeReadback.projection
        expect(projection.threadId).toBe(threadId)
        expect(projection.title).toBe('emergency plumber parramatta')
        expect(projection.turns.length).toBeGreaterThanOrEqual(1)

        const firstTurn = projection.turns.at(0)
        const seo = buildSharedThreadSeo({
          threadId: projection.threadId,
          shareToken,
          title: projection.title,
          ...(firstTurn === undefined ? {} : { firstTurnOneLine: firstTurn.oneLine }),
          options: { canonicalBaseUrl },
        })

        expect(routeReadback.seo).toEqual(seo)
        expect(seo.canonicalUrl).toBe(`${canonicalBaseUrl}/s/${shareToken}`)
        expect(seo.shareToken).toBe(shareToken)
        expect(seo.indexDirective).toBe('noindex')
        expect(seo.ogType).toBe('article')
        expect(seo.title).toContain('Agentic Economy')
        // Share copy must stay boundary-honest.
        expect(seo.description).not.toMatch(/book now|booking confirmed|pay now|payment required/i)
        expect(server.requests.length).toBeLessThanOrEqual(3)
      } finally {
        restoreOpenRouter()
        await server.close()
        if (previousLocalRegistry === undefined) {
          delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
        } else {
          process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
        }
        if (previousCanonicalBaseUrl === undefined) {
          delete process.env.AE_CANONICAL_BASE_URL
        } else {
          process.env.AE_CANONICAL_BASE_URL = previousCanonicalBaseUrl
        }
        resetPort()
      }
  })

  it('returns unavailable for an unknown share token without auth', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const shareToken = 'a'.repeat(64)
      const readback = await loadSharedThreadRouteReadback(
        shareToken,
        new Request(`https://ae.example/s/${shareToken}`),
      )
      expect(readback.projection).toBeNull()
      expect(readback.unavailable).toBe(true)
    } finally {
      resetPort()
    }
  })
})

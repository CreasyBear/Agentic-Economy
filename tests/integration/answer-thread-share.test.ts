import { afterEach, describe, expect, it } from 'vitest'

import { setAnswerToolUseAgentForTests } from '@/modules/answer/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { buildPublicThreadSeo } from '@/modules/seo/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { handleGetAnswerThreadRequest } from '@/routes/api.answer.threads.$threadId'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  readSessionCookieFromResponse,
} from '../helpers/answer-thread-test-port'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

describe('public thread share route', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_ANSWER_SYNTHESIZER
    setAnswerToolUseAgentForTests(undefined)
  })

  it('loads the public projection and OG tags without auth', async () => {
    const store = createAnswerThreadTestStore()
    const resetPort = installAnswerThreadTestPort(store)

    try {
      const state = createDefaultRegistrySourceState()
      await withRegistrySourcePortForTest(state, async () => {
        process.env.OPENROUTER_API_KEY = 'test-key'
        setAnswerToolUseAgentForTests(async () => ({
          toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
          prose: {
            oneLine: 'One listed business matches this need.',
            summary:
              'The listing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
            whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
          },
        }))

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
      })
    } finally {
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

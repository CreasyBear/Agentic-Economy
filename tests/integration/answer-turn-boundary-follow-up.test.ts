import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

type StreamFrame = { seq: number; event: AnswerEvent }

function parseStream(text: string): StreamFrame[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice('data:'.length).trim()) as StreamFrame)
}

const SESSION_COOKIE = sessionCookieHeader('session-boundary')


describe('POST /api/answer/turn boundary follow-up', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
  })

  it('returns boundary copy for the AE chip even when prior turns fail to load', async () => {
    setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => ({ turnId: args.turnId }),
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getAnswerThread: async (threadId) => ({
        threadId,
        pseudonymousSessionId: 'session-boundary',
        title: 'Boundary',
        sharePolicy: 'public',
        createdAt: 1,
        updatedAt: 1,
        turnCount: 1,
      }),
      getThreadTurns: async () => {
        throw new Error('convex unavailable')
      },
    })

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
          },
          body: JSON.stringify({
            threadId: 'thread-boundary-test',
            query: 'What can Agentic Economy do here?',
          }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('does not book')
      expect(complete.answer.oneLine).not.toContain('No listed businesses match')
      expect(complete.answer.summary).toContain('The business handles timing, price, and availability')
    } finally {
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })

  it('returns boundary copy after an empty first turn in the same thread', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'No listed businesses match "Emergency plumber Brunswick" yet.',
        summary:
          'No providers are listed for that yet. You can list a business, or try a different need or suburb.',
        whatToDoNow: 'Try a nearby suburb, browse services, or list a business that should appear here.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    let threadId = ''
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const first = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
          },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )
      const firstFrames = parseStream(await first.text())
      const threadEvent = firstFrames.find((frame) => frame.event.type === 'thread')?.event
      if (threadEvent?.type !== 'thread') {
        throw new Error('expected thread event')
      }
      threadId = threadEvent.threadId

      const followUp = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
          },
          body: JSON.stringify({
            threadId,
            query: 'What can Agentic Economy do here?',
          }),
        }),
      )

      expect(followUp.ok).toBe(true)
      const frames = parseStream(await followUp.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('does not book')
      expect(complete.answer.summary).not.toContain('No providers are listed for that yet')
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  })

  it('narrows to Parramatta from frozen providers instead of searching the chip label', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'One listed business is listed in Parramatta.',
        summary:
          'The listing publishes emergency pipe repair around Parramatta. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    let threadId = ''
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const first = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
          },
          body: JSON.stringify({ query: 'plumber parramatta' }),
        }),
      )
      const firstFrames = parseStream(await first.text())
      const firstComplete = firstFrames.at(-1)?.event
      if (firstComplete?.type !== 'complete') {
        throw new Error('expected first complete event')
      }
      expect(firstComplete.answer.providers.length).toBeGreaterThan(0)

      const threadEvent = firstFrames.find((frame) => frame.event.type === 'thread')?.event
      if (threadEvent?.type !== 'thread') {
        throw new Error('expected thread event')
      }
      threadId = threadEvent.threadId

      const followUp = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
          },
          body: JSON.stringify({
            threadId,
            query: 'Narrow to Parramatta',
          }),
        }),
      )

      expect(followUp.ok).toBe(true)
      const frames = parseStream(await followUp.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers.length).toBeGreaterThan(0)
      expect(complete.answer.oneLine).toContain('listed in Parramatta')
      expect(complete.answer.oneLine).not.toContain('No listed businesses match "Narrow to Parramatta"')
      expect(complete.answer.compactLayout).toBe(true)
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
    }
  }, 15_000)
})

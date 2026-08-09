import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/rate-limit', () => ({
  assertHttpAdmission: async () => ({ ok: true as const }),
  requestAdmissionKey: () => 'test-admission-key',
}))

import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'
import { readAnswerTurnStream } from '../helpers/answer-turn-stream'

const SESSION_COOKIE = sessionCookieHeader('session-boundary')

describe('POST /api/answer/turn boundary follow-up', () => {
  let previousConvexUrl: string | undefined
  let previousPublicConvexUrl: string | undefined

  beforeEach(() => {
    previousConvexUrl = process.env.CONVEX_URL
    previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
  })

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL
    } else {
      process.env.CONVEX_URL = previousConvexUrl
    }
    if (previousPublicConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL
    } else {
      process.env.VITE_CONVEX_URL = previousPublicConvexUrl
    }
  })

  it('returns boundary copy for the AE chip even when prior turns fail to load', async () => {
    const store = createAnswerThreadTestStore()
    store.threads.set('thread-boundary-test', {
      threadId: 'thread-boundary-test',
      pseudonymousSessionId: 'session-boundary',
      title: 'Boundary',
      createdAt: 1,
      updatedAt: 1,
    })
    store.turns.set('boundary-prior', {
      turnId: 'boundary-prior',
      threadId: 'thread-boundary-test',
      seq: 1,
      query: 'prior',
      intent: 'refine_search',
      evidenceJson: '{}',
      snapshotHash: '',
      proseJson: '{}',
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 1,
    })
    store.getThreadTurnsError = new Error('convex unavailable')
    installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
            'X-AE-Turn-Key': 'boundary:prior-load-failure',
          },
          body: JSON.stringify({
            threadId: 'thread-boundary-test',
            query: 'What can Agentic Economy do here?',
          }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('cannot book or start the job')
      expect(complete.answer.oneLine).not.toContain('No businesses match')
      expect(complete.answer.summary).toContain('Use the cards to compare what is offered')
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

  it('returns boundary copy after an empty first turn in the same thread', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'No businesses match "Emergency plumber Brunswick" yet.',
        summary:
          'No matches found yet. You can add a business, or try a different need or suburb.',
        whatToDoNow: 'Try a nearby suburb, see other options, or add a business that should appear here.',
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
            'X-AE-Turn-Key': 'boundary:empty-first',
          },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )
      const firstFrames = await readAnswerTurnStream(first)
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
            'X-AE-Turn-Key': 'boundary:empty-follow-up',
          },
          body: JSON.stringify({
            threadId,
            query: 'What can Agentic Economy do here?',
          }),
        }),
      )

      expect(followUp.ok).toBe(true)
      const frames = await readAnswerTurnStream(followUp)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('cannot book or start the job')
      expect(complete.answer.summary).not.toContain('No matches found yet')
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
        oneLine: 'One business is in Parramatta.',
        summary:
          'The business offers emergency pipe repair around Parramatta. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
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
            'X-AE-Turn-Key': 'boundary:parramatta-first',
          },
          body: JSON.stringify({ query: 'plumber parramatta' }),
        }),
      )
      const firstFrames = await readAnswerTurnStream(first)
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
            'X-AE-Turn-Key': 'boundary:parramatta-follow-up',
          },
          body: JSON.stringify({
            threadId,
            query: 'Narrow to Parramatta',
          }),
        }),
      )

      expect(followUp.ok).toBe(true)
      const frames = await readAnswerTurnStream(followUp)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers.length).toBeGreaterThan(0)
      expect(complete.answer.oneLine).toContain('matches in Parramatta')
      expect(complete.answer.oneLine).not.toContain('No businesses match "Narrow to Parramatta"')
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
  it('keeps the dental need while refining a natural Adelaide location follow-up', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'Start with a dentist serving Adelaide.',
        summary:
          'The Adelaide listing publishes general dental care. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the listing and ask whether it handles this need, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    const previousSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED

    let threadId = ''
    try {
      const first = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
            'X-AE-Turn-Key': 'boundary:adelaide-first',
          },
          body: JSON.stringify({ query: 'My tooth hurts and I need a dentist near Adelaide this week' }),
        }),
      )
      const firstFrames = await readAnswerTurnStream(first)
      const firstComplete = firstFrames.at(-1)?.event
      if (firstComplete?.type !== 'complete') throw new Error('expected first complete event')
      expect(firstComplete.answer.providers.map((provider) => provider.slug)).toEqual(['adelaide-dental-clinic'])

      const threadEvent = firstFrames.find((frame) => frame.event.type === 'thread')?.event
      if (threadEvent?.type !== 'thread') throw new Error('expected thread event')
      threadId = threadEvent.threadId

      const followUp = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
            'X-AE-Turn-Key': 'boundary:adelaide-follow-up',
          },
          body: JSON.stringify({ threadId, query: 'Only show options near Adelaide' }),
        }),
      )
      const followUpFrames = await readAnswerTurnStream(followUp)
      const complete = followUpFrames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected follow-up complete event')
      expect(complete.answer.providers.map((provider) => provider.slug)).toEqual(['adelaide-dental-clinic'])
      expect(complete.answer.oneLine).toContain('Adelaide')
      // Retrieval-first reuses the frozen provider snapshot for this location-only follow-up.
      // Both turns perform the private safety preflight; no answer model request is needed.
      expect(server.requests).toHaveLength(2)
      expect(server.requests.every((request) => request.tools === undefined)).toBe(true)
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      if (previousSeed === undefined) delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
      else process.env.AE_ANSWER_EVAL_REGISTRY_SEED = previousSeed
      if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvexUrl
      if (previousPublicConvexUrl === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousPublicConvexUrl
    }
  }, 15_000)
})

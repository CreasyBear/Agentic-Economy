import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAnswerTurnProblem } from '@/lib/errors'

import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { streamAnswerTurn } from '@/modules/answer-thread/server'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { handleStopAnswerTurnRequest } from '@/routes/api.answer.turn.stop'

import { readAnswerTurnStream } from '../helpers/answer-turn-stream'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'
const emptyKeylessExecutableSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

const streamWithLocalSources: typeof streamAnswerTurn = (input, onEvent) =>
  streamAnswerTurn({
    ...input,
    keylessExecutableSource: emptyKeylessExecutableSource,
  }, onEvent)

function handleLocalAnswerTurnRequest(request: Request): Promise<Response> {
  return handleAnswerTurnRequest(request, { stream: streamWithLocalSources })
}


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
  let previousConvexUrl: string | undefined
  let previousViteConvexUrl: string | undefined
  let restoreRegistrySource: (() => void) | undefined

  beforeEach(() => {
    previousConvexUrl = process.env.CONVEX_URL
    previousViteConvexUrl = process.env.VITE_CONVEX_URL
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    restoreRegistrySource = installLocalE2eRegistrySourceForTests()
  })

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
    restoreRegistrySource?.()
    restoreRegistrySource = undefined
    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL
    } else {
      process.env.CONVEX_URL = previousConvexUrl
    }
    if (previousViteConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL
    } else {
      process.env.VITE_CONVEX_URL = previousViteConvexUrl
    }
    vi.restoreAllMocks()
  })

  it('streams a full turn the browser reader can consume without any hand-rolled parsing', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'plumber Parramatta' } }],
      prose: {
        oneLine: 'A listed plumber may fit this request.',
        summary: 'The listing publishes plumbing details; timing and price still need confirmation.',
        whatToDoNow: 'Contact the business and confirm the scope, price, and timing.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'ui-stream:parramatta-plumber' },
          body: JSON.stringify({ query: 'plumber in Parramatta' }),
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

      // The durable row, not the wire, is the replay source: transient data
      // parts must still have persisted a terminal turn.
      const durableTurns = [...store.turns.values()]
      expect(durableTurns).toHaveLength(1)
      expect(durableTurns[0]?.status).toBe('complete')
    } finally {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      restoreOpenRouter()
      await server.close()
    }
  })
  it('continues SSE sequence after an injected stream failure', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookieHeader('stream-failure-owner'),
          'X-AE-Turn-Key': 'ui-stream:failure',
        },
        body: JSON.stringify({ query: 'find a plumber' }),
      }),
      {
        admit: async () => ({ ok: true }),
        stream: async (_input, send) => {
          send({
            seq: 0,
            event: { type: 'thread', threadId: 'thread:failure', turnId: 'turn:failure', turnSeq: 1 },
          })
          throw new Error('private orchestrator failure')
        },
      },
    )

    const frames = await readAnswerTurnStream(response)
    expect(frames.map((frame) => frame.seq)).toEqual([0, 1])
    expect(frames[1]).toEqual({
      seq: 1,
      event: { type: 'error', problem: buildAnswerTurnProblem('answer_turn_failed') },
    })
  })


  it('refuses an oversized body before opening a stream', async () => {
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'ui-stream:oversized-body' },
        body: JSON.stringify({ query: 'x'.repeat(32 * 1024) }),
      }),
    )

    expect(response.status).toBe(413)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('durably stops a reserved turn and replays the stopped status', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const sessionId = 'stop-owner-session'
    const cookie = sessionCookieHeader(sessionId)

    const turnResponse = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie,
          'X-AE-Turn-Key': 'ui-stream:stop',
        },
        body: JSON.stringify({ query: 'find a plumber' }),
      }),
      {
        admit: async () => ({ ok: true }),
        stream: async () => undefined,
      },
    )
    await turnResponse.text()
    const reservation = [...store.reservations.values()].at(0)
    expect(reservation).toBeDefined()
    if (reservation === undefined) throw new Error('Expected a reserved answer turn.')

    const stopRequest = () => new Request('https://ae.example/api/answer/turn/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ threadId: reservation.threadId, turnId: reservation.turnId }),
    })
    const stopped = await handleStopAnswerTurnRequest(stopRequest())
    expect(stopped.status).toBe(200)
    await expect(stopped.json()).resolves.toEqual({
      kind: 'stopped',
      threadId: reservation.threadId,
      turnId: reservation.turnId,
    })

    const replayed = await handleStopAnswerTurnRequest(stopRequest())
    expect(replayed.status).toBe(200)
    await expect(replayed.json()).resolves.toEqual({
      kind: 'already_settled',
      threadId: reservation.threadId,
      turnId: reservation.turnId,
      status: 'stopped',
    })
  })
})

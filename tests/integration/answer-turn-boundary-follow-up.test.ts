import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/rate-limit', () => ({
  assertHttpAdmission: async () => ({ ok: true as const }),
  requestAdmissionKey: () => 'test-admission-key',
}))

import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { streamAnswerTurn } from '@/modules/answer-thread/server'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
  type AnswerThreadTestStore,
} from '../helpers/answer-thread-test-port'
import {
  openRouterProseResponse,
  openRouterToolResponse,
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
  type OpenRouterContractRequest,
  type OpenRouterContractResponseSource,
  type OpenRouterProsePlan,
  type OpenRouterToolCallPlan,
} from '../helpers/openrouter-contract-server'
import { readAnswerTurnStream } from '../helpers/answer-turn-stream'

const SESSION_COOKIE = sessionCookieHeader('session-boundary')
const emptyKeylessExecutableSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

function isSafetyModelRequest(request: OpenRouterContractRequest): boolean {
  const schemaName = request.response_format?.json_schema?.name
  return schemaName === 'answer_query_safety'
    || schemaName === 'answer_request_preflight'
    || request.messages.some((message) =>
      message.role === 'system' && message.content.includes('Classify the user request'),
    )
}

type QueryAwareAnswerScenario = Readonly<{
  query: RegExp
  toolCall?: OpenRouterToolCallPlan
  prose: OpenRouterProsePlan
}>

function queryAwareAnswerResponses(
  scenarios: readonly QueryAwareAnswerScenario[],
): OpenRouterContractResponseSource {
  return (request) => {
    const userMessage = request.messages.find((message) => message.role === 'user')?.content ?? ''
    const latestQuery =
      userMessage.match(/^User query:\s*(?<query>.*)$/m)?.groups?.query?.trim() ?? userMessage
    const scenario = scenarios.find((candidate) => candidate.query.test(latestQuery))
    if (scenario === undefined) {
      throw new Error(`unexpected answer query: ${latestQuery}`)
    }
    const hasToolResult = request.messages.some((message) => message.role === 'tool')
    const hasRegistrySearchTool = request.tools?.some((tool) =>
      tool.function.name === openRouterToolName('registry.search'),
    ) === true
    if (scenario.toolCall === undefined) {
      if (hasRegistrySearchTool) {
        throw new Error('boundary scenario must not expose registry.search')
      }
      return openRouterProseResponse(scenario.prose)
    }
    if (!hasToolResult) {
      if (!hasRegistrySearchTool) {
        throw new Error('expected registry.search before answer prose')
      }
      return openRouterToolResponse([scenario.toolCall])
    }
    return openRouterProseResponse(scenario.prose)
  }
}

type PersistedAnswerToolCall = Readonly<{
  toolId?: string
  inputJson?: string
}>

function persistedRegistrySearches(
  store: AnswerThreadTestStore,
): PersistedAnswerToolCall[][] {
  return [...store.turns.values()]
    .sort((left, right) => left.seq - right.seq)
    .map((turn) => {
      const evidence = JSON.parse(turn.evidenceJson) as {
        toolCalls?: readonly PersistedAnswerToolCall[]
      }
      return evidence.toolCalls?.filter((call) => call.toolId === 'registry.search') ?? []
    })
}

const streamWithLocalSources: typeof streamAnswerTurn = (input, onEvent) =>
  streamAnswerTurn({
    ...input,
    keylessExecutableSource: emptyKeylessExecutableSource,
  }, onEvent)

function handleLocalAnswerTurnRequest(request: Request): Promise<Response> {
  return handleAnswerTurnRequest(request, { stream: streamWithLocalSources })
}

describe('POST /api/answer/turn boundary follow-up', () => {
  let previousConvexUrl: string | undefined
  let previousPublicConvexUrl: string | undefined
  let restoreRegistrySource: (() => void) | undefined

  beforeEach(() => {
    previousConvexUrl = process.env.CONVEX_URL
    previousPublicConvexUrl = process.env.VITE_CONVEX_URL
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
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'The assistant compares published details, but it cannot book or start the job.',
        summary: 'Use the cards to compare what is offered and contact the business for anything beyond comparison.',
        whatToDoNow: 'Open a business page and contact the business when you are ready.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(
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
      expect(server.requests).toHaveLength(2)
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(1)
      expect(server.requests.filter((request) => !isSafetyModelRequest(request))).toHaveLength(1)
      expect(server.requests.every((request) => request.tools === undefined)).toBe(true)
      expect(server.requests.filter((request) =>
        request.tools?.some((tool) =>
          tool.function.name === openRouterToolName('registry.search'),
        ),
      )).toHaveLength(0)
      expect(
        persistedRegistrySearches(store).reduce((count, calls) => count + calls.length, 0),
      ).toBe(0)
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
    const server = await startOpenRouterContractServer(queryAwareAnswerResponses([
      {
        query: /Emergency plumber Brunswick/i,
        toolCall: {
          toolId: 'registry.search',
          input: { query: 'Emergency plumber Brunswick' },
        },
        prose: {
          oneLine: 'No businesses match "Emergency plumber Brunswick" yet.',
          summary:
            'No matches found yet. You can add a business, or try a different need or suburb.',
          whatToDoNow: 'Try a nearby suburb, see other options, or add a business that should appear here.',
        },
      },
      {
        query: /What can Agentic Economy do here/i,
        prose: {
          oneLine: 'The assistant compares published details, but it cannot book or start the job.',
          summary: 'Use the cards to compare what is offered and contact the business for anything beyond comparison.',
          whatToDoNow: 'Open a business page and contact the business when you are ready.',
        },
      },
    ]))
    const restoreOpenRouter = server.installEnv()

    let threadId = ''
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const first = await handleLocalAnswerTurnRequest(
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

      const followUp = await handleLocalAnswerTurnRequest(
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
      // Two preflights plus the first turn's search/prose pair and one boundary prose request.
      expect(server.requests).toHaveLength(5)
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(2)
      const agentRequests = server.requests.filter((request) => !isSafetyModelRequest(request))
      expect(agentRequests).toHaveLength(3)
      const boundaryRequests = agentRequests.filter((request) =>
        request.messages.some((message) =>
          message.role === 'user' && message.content.includes('User query: What can Agentic Economy do here?'),
        ),
      )
      expect(boundaryRequests).toHaveLength(1)
      expect(boundaryRequests[0]?.tools).toBeUndefined()
      expect(boundaryRequests[0]?.messages.filter((message) => message.role === 'tool')).toHaveLength(0)

      const searches = persistedRegistrySearches(store)
      expect(searches).toHaveLength(2)
      expect(searches[0]).toHaveLength(1)
      expect(searches[1]).toHaveLength(0)
      expect(JSON.parse(searches[0]?.[0]?.inputJson ?? '{}')).toMatchObject({
        query: 'Emergency plumber Brunswick',
      })
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

  it('re-searches Parramatta while retaining the service need instead of searching the chip label', async () => {
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)
    const server = await startOpenRouterContractServer(queryAwareAnswerResponses([{
      query: /parramatta/i,
      toolCall: {
        toolId: 'registry.search',
        input: {
          query: 'plumber Parramatta',
          limit: 3,
          mode: 'near_me',
          location: 'Parramatta',
        },
      },
      prose: {
        oneLine: 'One business matches in Parramatta.',
        summary:
          'The business offers emergency pipe repair around Parramatta. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }]))
    const restoreOpenRouter = server.installEnv()

    let threadId = ''
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const first = await handleLocalAnswerTurnRequest(
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

      const followUp = await handleLocalAnswerTurnRequest(
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
      // Each refine_search turn pays one preflight plus a registry.search/prose pair.
      expect(server.requests).toHaveLength(6)
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(2)
      expect(server.requests.filter((request) => !isSafetyModelRequest(request))).toHaveLength(4)

      const searches = persistedRegistrySearches(store)
      expect(searches).toHaveLength(2)
      for (const turnSearches of searches) {
        expect(turnSearches).toHaveLength(1)
      }
      const searchInputs = searches.map((turnSearches) =>
        JSON.parse(turnSearches[0]?.inputJson ?? '{}') as Record<string, unknown>,
      )
      for (const input of searchInputs) {
        expect(input).toMatchObject({
          location: 'Parramatta',
          mode: 'near_me',
        })
        expect(input.query).toEqual(expect.stringContaining('plumber'))
        expect(input.query).toEqual(expect.stringContaining('Parramatta'))
      }
      expect(searchInputs[1]?.query).not.toContain('Narrow to Parramatta')
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
    const server = await startOpenRouterContractServer(queryAwareAnswerResponses([{
      query: /adelaide/i,
      toolCall: {
        toolId: 'registry.search',
        input: {
          query: 'dentist Adelaide',
          limit: 3,
          mode: 'near_me',
          location: 'Adelaide',
        },
      },
      prose: {
        oneLine: 'Start with a dentist serving Adelaide.',
        summary:
          'The Adelaide listing publishes general dental care. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the listing and ask whether it handles this need, what it costs, and when it is available.',
      },
    }]))
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
      const first = await handleLocalAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
            'X-AE-Turn-Key': 'boundary:adelaide-first',
          },
          body: JSON.stringify({ query: 'dentist Adelaide' }),
        }),
      )
      const firstFrames = await readAnswerTurnStream(first)
      const firstComplete = firstFrames.at(-1)?.event
      if (firstComplete?.type !== 'complete') throw new Error('expected first complete event')
      expect(firstComplete.answer.providers.map((provider) => provider.slug)).toEqual(['adelaide-dental-clinic'])

      const threadEvent = firstFrames.find((frame) => frame.event.type === 'thread')?.event
      if (threadEvent?.type !== 'thread') throw new Error('expected thread event')
      threadId = threadEvent.threadId

      const followUp = await handleLocalAnswerTurnRequest(
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
      // Each refine_search turn pays one preflight plus a registry.search/prose pair.
      expect(server.requests).toHaveLength(6)
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(2)
      expect(server.requests.filter((request) => !isSafetyModelRequest(request))).toHaveLength(4)
      const searches = persistedRegistrySearches(store)
      expect(searches).toHaveLength(2)
      for (const turnSearches of searches) {
        expect(turnSearches).toHaveLength(1)
      }
      const searchInputs = searches.map((turnSearches) =>
        JSON.parse(turnSearches[0]?.inputJson ?? '{}') as Record<string, unknown>,
      )
      for (const input of searchInputs) {
        expect(input).toMatchObject({
          location: 'Adelaide',
          mode: 'near_me',
        })
        expect(input.query).toEqual(expect.stringContaining('dentist'))
        expect(input.query).toEqual(expect.stringContaining('Adelaide'))
      }
      expect(searchInputs[1]?.query).not.toContain('Only show options near Adelaide')
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

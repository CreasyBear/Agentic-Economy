import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/rate-limit', () => ({
  assertHttpAdmission: async () => ({ ok: true as const }),
  requestAdmissionKey: () => 'test-admission-key',
}))

import { DEFAULT_AE_SEARCH_CONTEXT } from '@/modules/answer/search-context'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { streamAnswerTurn } from '@/modules/answer-thread/server'
import { handleAnswerTurnRequest as handleAnswerTurnRequestRaw } from '@/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'
import { readAnswerTurnStream } from '../helpers/answer-turn-stream'
import {
  openRouterProseResponse,
  openRouterToolResponse,
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'
import type {
  OpenRouterContractRequest,
  OpenRouterContractResponseSource,
  OpenRouterProsePlan,
} from '../helpers/openrouter-contract-server'

const SESSION_COOKIE = sessionCookieHeader('session-empty-state')

function latestUserQuery(request: OpenRouterContractRequest): string {
  const content = request.messages.findLast((message) => message.role === 'user')?.content ?? ''
  return content.match(/^User query: (?<query>.*)$/m)?.groups?.query?.trim() ?? content
}

function queryAwareRegistrySearchThenProse(
  prose: OpenRouterProsePlan,
): OpenRouterContractResponseSource {
  return (request) => {
    const toolResultCount = request.messages.filter((message) => message.role === 'tool').length
    if (request.tools !== undefined && toolResultCount === 0) {
      const parramatta = /parramatta/i.test(latestUserQuery(request))
      return openRouterToolResponse([{
        toolId: 'registry.search',
        input: parramatta
          ? { query: 'Emergency plumber Parramatta' }
          : { query: 'Emergency plumber Brunswick' },
      }])
    }
    return openRouterProseResponse(prose)
  }
}

function webFailureToolThenProseResponses(): OpenRouterContractResponseSource {
  const prose: OpenRouterProsePlan = {
    oneLine: 'No businesses match "Emergency plumber Brunswick" yet.',
    summary: 'No matches found yet. We searched for emergency plumbers in Brunswick.',
    whatToDoNow: 'Try a nearby suburb, see other options, or add a business that should appear here.',
  }
  return (request) => {
    const isNestedWebDiscovery =
      request.response_format?.type === 'json_object'
      || request.messages.some((message) =>
        message.role === 'system' && message.content.includes('Find real published businesses'),
      )
    if (isNestedWebDiscovery) return undefined

    const toolResultCount = request.messages.filter((message) => message.role === 'tool').length
    if (request.tools !== undefined && toolResultCount === 0) {
      return openRouterToolResponse([{
        toolId: 'registry.search',
        input: { query: 'Emergency plumber Brunswick' },
      }])
    }
    return openRouterProseResponse(prose)
  }
}
 
 

function isSafetyModelRequest(request: {
  messages?: readonly { role: string; content: string }[]
  response_format?: { json_schema?: { name?: string } }
}): boolean {
  const schemaName = request.response_format?.json_schema?.name
  return schemaName === 'answer_query_safety'
    || schemaName === 'answer_request_preflight'
    || request.messages?.some((message) =>
      message.role === 'system' && message.content.includes('Classify the user request'),
    ) === true
}


function stubThreadPort(turns: unknown[]): void {
  const store = createAnswerThreadTestStore()
  store.persisted = turns
  installAnswerThreadTestPort(store)
}
const EMPTY_KEYLESS_EXECUTABLE_SOURCE: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

const streamAnswerTurnWithLocalPorts: typeof streamAnswerTurn = (input, send) =>
  streamAnswerTurn({
    ...input,
    keylessExecutableSource: EMPTY_KEYLESS_EXECUTABLE_SOURCE,
  }, send)

function handleAnswerTurnRequest(request: Request): Promise<Response> {
  return handleAnswerTurnRequestRaw(request, { stream: streamAnswerTurnWithLocalPorts })
}
describe('POST /api/answer/turn empty-state queries', () => {

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
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
    restoreRegistrySource?.()
    restoreRegistrySource = undefined
  })

  it('completes with honest empty-state copy when no providers match', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{
        toolId: 'registry.search',
        input: { query: 'Emergency plumber Brunswick' },
      }],
      prose: {
        oneLine: 'No businesses match "Emergency plumber Brunswick" yet.',
        summary: 'No matches found yet. We searched for emergency plumbers in Brunswick.',
        whatToDoNow: 'Try a nearby suburb, see other options, or add a business that should appear here.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    installAnswerThreadTestPort(createAnswerThreadTestStore())

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:no-match-brunswick' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      const earlyEventTypes = frames.slice(0, 3).map((frame) => frame.event.type)
      expect(earlyEventTypes[0]).toBe('thread')
      expect(earlyEventTypes.slice(1)).toContain('work-step')
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(isSafetyModelRequest(server.requests[0]!)).toBe(true)
      expect(complete.answer.oneLine).toContain('No businesses match')
      expect(complete.answer.summary).toContain('Brunswick')
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(1)
      const answerRequests = server.requests.filter((request) => !isSafetyModelRequest(request))
      expect(answerRequests).toHaveLength(3)
      expect(answerRequests[0]?.tools?.some((tool) => tool.function.name === 'registry_search')).toBe(true)
      expect(answerRequests[0]?.response_format?.type).not.toBe('json_schema')
      expect(answerRequests.at(-1)?.response_format?.json_schema?.name).toBe('answer_prose')
      expect(answerRequests.at(-1)?.messages.filter((message) => message.role === 'tool')).toHaveLength(1)
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

  it('synthesizes direct registry matches after one bounded search', async () => {
    const turns: unknown[] = []
    stubThreadPort(turns)
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{
        toolId: 'registry.search',
        input: {
          query: 'parramatta',
        },
      }],
      prose: {
        oneLine: 'This business may fit what you need in Parramatta.',
        summary: 'What they offer, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask what it costs and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:parramatta-match' },
          body: JSON.stringify({ query: 'emergency plumber Parramatta' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }

      expect(complete.answer.oneLine).toBe('This business may fit what you need in Parramatta.')
      expect(complete.answer.summary).toContain('What they offer, price, and current availability still need confirmation.')
      expect(complete.answer.nextStep).toContain('what it costs')

      const persisted = turns.at(0) as { evidenceJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { toolId?: string; inputJson?: string; resultJson?: string }[]
        timings?: readonly { name?: string }[]
        workLog?: readonly {
          id?: string
          phase?: string
          status?: string
          detailRows?: readonly { label?: string; value?: string }[]
        }[]
      }
      expect(evidence.toolCalls?.[0]?.toolId).toBe('registry.search')
      expect(JSON.parse(evidence.toolCalls?.[0]?.inputJson ?? '{}')).toMatchObject({
        query: 'parramatta',
        limit: 3,
      })
      expect(JSON.parse(evidence.toolCalls?.[0]?.inputJson ?? '{}').mode).toBeUndefined()
      expect(JSON.parse(evidence.toolCalls?.[0]?.inputJson ?? '{}').location).toBeUndefined()
      expect(evidence.toolCalls?.[0]?.resultJson).toContain('Demo listed provider')
      expect(evidence.timings?.map((timing) => timing.name)).toEqual(
        expect.arrayContaining([
          'turn.context_parse',
          'model.answer_request_preflight',
          'model.agent_total',
          'model.openrouter_round',
          'registry.search.convex',
          'tool.run',
          'sse.emit_snapshot',
          'turn.persistence_prepare',
        ]),
      )
      expect(evidence.workLog?.map((step) => ({ phase: step.phase, status: step.status }))).toEqual([
        { phase: 'search', status: 'complete' },
        { phase: 'read', status: 'complete' },
        { phase: 'compare', status: 'complete' },
      ])
      const searchStep = evidence.workLog?.find((step) => step.phase === 'search')
      expect(searchStep?.status).toBe('complete')
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(1)
      const answerRequests = server.requests.filter((request) => !isSafetyModelRequest(request))
      expect(answerRequests).toHaveLength(3)
      expect(answerRequests[0]?.tools?.some((tool) => tool.function.name === 'registry_search')).toBe(true)
      expect(answerRequests[0]?.response_format?.type).not.toBe('json_schema')
      expect(answerRequests.at(-1)?.response_format?.json_schema?.name).toBe('answer_prose')
      expect(answerRequests.at(-1)?.messages.filter((message) => message.role === 'tool')).toHaveLength(1)
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

  it('persists discovery evidence when the web provider fails, then completes with no matches', async () => {
    const server = await startOpenRouterContractServer(webFailureToolThenProseResponses())
    const restoreOpenRouter = server.installEnv()
    const turns: unknown[] = []
    stubThreadPort(turns)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:web-provider-failure' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      const terminal = frames.at(-1)?.event
      expect(terminal?.type).toBe('complete')
      if (terminal?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(terminal.answer.providers).toEqual([])
      expect(terminal.answer.oneLine).toBe('No businesses match "Emergency plumber Brunswick" yet.')

      const persisted = turns.at(0) as {
        turnId: string
        evidenceJson: string
        toolCalls: readonly {
          toolCallId: string
          seq: number
          toolId: string
          inputJson: string
          status: string
          resultHash: string
        }[]
      } | undefined
      if (persisted === undefined) {
        throw new Error('expected persisted answer turn')
      }
      const thread = frames[0]?.event
      if (thread?.type !== 'thread') {
        throw new Error('expected persisted answer turn parent')
      }
      expect(persisted.turnId).toBe(thread.turnId)
      const evidence = JSON.parse(persisted.evidenceJson) as {
        providers?: unknown[]
        allowedSlugs?: unknown[]
        timings?: readonly { name?: string }[]
        harnessRunRef?: string
      }
      expect(evidence.providers).toEqual([])
      expect(evidence.allowedSlugs).toEqual([])
      const toolCalls = persisted.toolCalls
      expect(toolCalls).toHaveLength(1)
      expect(toolCalls.map((call) => call.toolId)).toEqual([
        'registry.search',
      ])
      expect(toolCalls.map((call) => call.seq)).toEqual([0])
      expect(new Set(toolCalls.map((call) => call.toolCallId)).size).toBe(toolCalls.length)
      expect(toolCalls.map((call) => call.status)).toEqual(['complete'])
      expect(toolCalls.map((call) => JSON.parse(call.inputJson).query)).toEqual([
        'Emergency plumber Brunswick',
      ])
      expect(toolCalls.every((call) => call.resultHash.startsWith('sha256:'))).toBe(true)
      // The public evidence retains only the immutable run reference. Full
      // harness telemetry lives in private harness-session entries.
      expect(evidence.harnessRunRef).toBe(thread.turnId)
      expect(evidence.timings?.map((timing) => timing.name)).toEqual(
        expect.arrayContaining([
          'turn.context_parse',
          'model.answer_request_preflight',
          'model.agent_total',
          'model.openrouter_round',
          'registry.search.convex',
          'tool.run',
          'sse.emit_snapshot',
          'turn.persistence_prepare',
        ]),
      )

      const outerToolRounds = server.requests.filter((request) =>
        request.tools !== undefined && request.response_format?.type !== 'json_object',
      )
      expect(outerToolRounds.length).toBeGreaterThanOrEqual(1)
      expect(outerToolRounds[0]?.tools?.some((tool) => tool.function.name === 'registry_search')).toBe(true)
      const proseRounds = server.requests.filter((request) =>
        request.response_format?.json_schema?.name === 'answer_prose',
      )
      expect(proseRounds.length).toBeGreaterThanOrEqual(1)
      expect(server.requests.filter(isSafetyModelRequest)).toHaveLength(1)
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

  it('keeps registry.search results as tool evidence without a host location rewrite', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'Emergency plumber Brunswick' } }],
      prose: {
        oneLine: 'No businesses match "Emergency plumber Brunswick" yet.',
        summary: 'No matches found yet. We searched for emergency plumbers in Brunswick.',
        whatToDoNow: 'Try a nearby suburb, see other options, or add a business that should appear here.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const turns: unknown[] = []
    stubThreadPort(turns)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:wrong-location' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.agentJsonUrl).toContain('q=Emergency+plumber+Brunswick')
      const persisted = turns.at(0) as {
        evidenceJson: string
        toolCalls?: readonly { resultJson?: string }[]
      } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        providers?: unknown[]
        allowedSlugs?: unknown[]
        agentJsonUrl?: string
      }
      expect(evidence.providers).toEqual([])
      expect(evidence.allowedSlugs).toEqual([])
      expect(evidence.agentJsonUrl).toContain('q=Emergency+plumber+Brunswick')
      const answerRequests = server.requests.filter(
        (request) => !isSafetyModelRequest(request),
      )
      const finalAnswerRequest = answerRequests.find(
        (request) =>
          request.response_format?.json_schema?.name === 'answer_prose'
          && request.messages.some((message) => message.role === 'tool'),
      )
      expect(finalAnswerRequest).toBeDefined()
      const toolContent = finalAnswerRequest?.messages
        .filter((message) => message.role === 'tool')
        .map((message) => message.content)
        .join('\n') ?? ''
      const projectedToolResult = JSON.parse(toolContent) as {
        items?: unknown[]
        pagination?: {
          total?: number
          hasMore?: boolean
          nextCursor?: string
        }
      }
      expect(projectedToolResult.items).toEqual([])
      expect(projectedToolResult.pagination).toMatchObject({
        total: 0,
        hasMore: false,
      })
      expect(projectedToolResult.pagination?.nextCursor).toBeUndefined()
      expect(toolContent).not.toContain('Demo listed provider')
      expect(toolContent).not.toContain('Listed offering')
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

  it('does not block a placeless query behind a hardcoded place confirmation', async () => {
    const server = await startOpenRouterContractServer(queryAwareRegistrySearchThenProse({
      oneLine: 'No emergency plumber listings are published right now.',
      summary: 'The catalog returned zero results for that search.',
      whatToDoNow: 'Try a different search, or browse listed Market Operations.',
    }))
    const restoreOpenRouter = server.installEnv()
    const turns: unknown[] = []
    stubThreadPort(turns)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:active-context' },
          body: JSON.stringify({
            query: 'Emergency plumber',
            searchContext: DEFAULT_AE_SEARCH_CONTEXT,
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
      expect(complete.answer.oneLine).not.toContain('Perth')
      expect(complete.answer.summary).not.toContain('configured context')
      const answerRequests = server.requests.filter((request) => !isSafetyModelRequest(request))
      expect(answerRequests.some((request) => request.tools !== undefined)).toBe(true)
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

  it('does not compare older providers after the latest turn has no valid providers', async () => {
    const server = await startOpenRouterContractServer((request) => {
      const userMessage = request.messages.find((message) => message.role === 'user')?.content ?? ''
      const latestQuery = userMessage.match(/^User query: (?<query>.*)$/m)?.groups?.query ?? userMessage
      const hasToolResult = request.messages.some((message) => message.role === 'tool')
      if (
        request.response_format?.type === 'json_schema'
        && request.tools === undefined
        && /parramatta/i.test(latestQuery)
      ) {
        return openRouterProseResponse({
          oneLine: 'Start with an emergency plumber serving Parramatta.',
          summary:
            'Demo listed provider offers emergency pipe repair. Scope, price, and current availability still need confirmation.',
          whatToDoNow:
            'Contact the business and ask whether it handles this job, what it costs, and when it is available.',
        })
      }
      if (request.tools === undefined && request.response_format?.type !== 'json_schema') {
        return {
          id: 'chatcmpl-discovery-empty',
          model: 'test-model',
          choices: [{
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify({ businesses: [] }) },
          }],
        }
      }
      if (hasToolResult && /brunswick/i.test(latestQuery)) {
        return openRouterProseResponse({
          oneLine: 'No businesses match "Emergency plumber Brunswick" yet.',
          summary:
            'No matches found yet. We searched for emergency plumbers in Brunswick.',
          whatToDoNow: 'Try a nearby suburb, see other options, or add a business that should appear here.',
        })
      }
      if (hasToolResult) {
        return openRouterProseResponse({
          oneLine: 'One business matches Parramatta.',
          summary:
            'Demo listed provider offers emergency pipe repair. Scope, price, and current availability still need confirmation.',
          whatToDoNow:
            'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
        })
      }
      if (/brunswick/i.test(latestQuery)) {
        return openRouterToolResponse([{ toolId: 'registry.search', input: { query: 'emergency plumbing' } }])
      }
      if (/parramatta/i.test(latestQuery)) {
        return openRouterToolResponse([{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }])
      }
      return openRouterProseResponse({
        oneLine: 'Not enough matches to compare yet.',
        summary: 'There are not enough matches in the latest answer to compare.',
        whatToDoNow: 'Try another search.',
      })
    })
    const restoreOpenRouter = server.installEnv()

    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

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
            'X-AE-Turn-Key': 'empty:comparison-first',
          },
          body: JSON.stringify({ query: 'Emergency plumber Parramatta' }),
        }),
      )
      const firstFrames = await readAnswerTurnStream(first)
      const firstThread = firstFrames.find((frame) => frame.event.type === 'thread')?.event
      if (firstThread?.type !== 'thread') {
        throw new Error('expected thread event')
      }
      threadId = firstThread.threadId
      const firstComplete = firstFrames.at(-1)?.event
      expect(firstComplete?.type).toBe('complete')
      if (firstComplete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(firstComplete.answer.oneLine).toContain('Parramatta')

      const second = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
            'X-AE-Turn-Key': 'empty:comparison-second',
          },
          body: JSON.stringify({ threadId, query: 'Emergency plumber Brunswick' }),
        }),
      )
      const secondFrames = await readAnswerTurnStream(second)
      const secondComplete = secondFrames.at(-1)?.event
      expect(secondComplete?.type).toBe('complete')
      if (secondComplete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(secondComplete.answer.providers).toEqual([])

      const compare = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
            'X-AE-Turn-Key': 'empty:comparison-final',
          },
          body: JSON.stringify({ threadId, query: 'Compare the top two' }),
        }),
      )
      const compareFrames = await readAnswerTurnStream(compare)
      const compareComplete = compareFrames.at(-1)?.event
      expect(compareComplete?.type).toBe('complete')
      if (compareComplete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(compareComplete.answer.providers).toEqual([])
      expect(compareComplete.answer.oneLine).toBe('Not enough matches to compare yet.')
      expect(compareComplete.answer.summary).not.toContain('Parramatta')
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
  it('restarts one validated registry search with the prior need plus a new location', async () => {
    const server = await startOpenRouterContractServer(queryAwareRegistrySearchThenProse({
      oneLine: 'No businesses match this refined request yet.',
      summary: 'No matches were found after applying the retained need and new location.',
      whatToDoNow: 'Try another suburb or revise a constraint.',
    }))
    const restoreOpenRouter = server.installEnv()
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const first = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: SESSION_COOKIE, 'X-AE-Turn-Key': 'empty:recovery-first' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )
      const firstFrames = await readAnswerTurnStream(first)
      const firstThread = firstFrames.find((frame) => frame.event.type === 'thread')?.event
      if (firstThread?.type !== 'thread') throw new Error('expected first thread event')

      const second = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: SESSION_COOKIE, 'X-AE-Turn-Key': 'empty:recovery-second' },
          body: JSON.stringify({
            threadId: firstThread.threadId,
            query: 'Only show options in Parramatta',
          }),
        }),
      )
      const secondFrames = await readAnswerTurnStream(second)
      const secondComplete = secondFrames.at(-1)?.event
      expect(secondComplete?.type).toBe('complete')
      if (secondComplete?.type !== 'complete') throw new Error('expected second complete event')

      const firstPersisted = store.persisted.at(0) as { evidenceJson?: string } | undefined
      const firstEvidence = JSON.parse(firstPersisted?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { seq?: number; toolId?: string; inputJson?: string }[]
      }
      const firstSearches = firstEvidence.toolCalls?.filter((call) => call.toolId === 'registry.search') ?? []
      expect(firstSearches).toHaveLength(1)
      expect(firstSearches.map((call) => call.seq)).toEqual([0])
      expect(JSON.parse(firstSearches[0]?.inputJson ?? '{}')).toMatchObject({
        query: 'Emergency plumber Brunswick',
        limit: 3,
      })
      expect(JSON.parse(firstSearches[0]?.inputJson ?? '{}').mode).toBeUndefined()
      expect(JSON.parse(firstSearches[0]?.inputJson ?? '{}').location).toBeUndefined()

      const persisted = store.persisted.at(-1) as { query?: string; evidenceJson?: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { seq?: number; toolId?: string; inputJson?: string }[]
      }
      const searches = evidence.toolCalls?.filter((call) => call.toolId === 'registry.search') ?? []
      expect(searches).toHaveLength(1)
      expect(searches.map((call) => call.seq)).toEqual([0])
      expect(JSON.parse(searches[0]?.inputJson ?? '{}')).toMatchObject({
        query: 'Emergency plumber Parramatta',
        limit: 3,
      })
      expect(JSON.parse(searches[0]?.inputJson ?? '{}').mode).toBeUndefined()
      expect(JSON.parse(searches[0]?.inputJson ?? '{}').location).toBeUndefined()
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
    }
  })

  it('recovers a misspelled query through the tool-use agent choosing registry.search("parramatta")', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One business may fit what you need.',
        summary:
          'The business offers emergency pipe repair. Scope, price, and current availability still need confirmation.',
        whatToDoNow:
          'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const turns: unknown[] = []
    stubThreadPort(turns)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:misspelled-query' },
          body: JSON.stringify({ query: 'paramata' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(
        complete.answer.providers.map((provider) => provider.slug),
      ).toContain('demo-listed-provider')
      // The frozen snapshot query stays honest to what the person typed.
      expect(complete.answer.query).toBe('paramata')
      // The agent JSON URL reflects the tool's chosen search query.
      expect(complete.answer.agentJsonUrl).toContain('q=parramatta')
      expect(complete.answer.oneLine).not.toContain('No businesses match')

      const persisted = turns.at(0) as { evidenceJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { seq?: number; toolId?: string; inputJson?: string }[]
        timings?: readonly { name?: string }[]
      }
      expect(evidence.toolCalls?.map((call) => call.seq)).toEqual([0])
      expect(
        evidence.toolCalls?.map((call) => JSON.parse(call.inputJson ?? '{}').query),
      ).toEqual(['parramatta'])
      expect(evidence.toolCalls?.map((call) => call.toolId)).toEqual(['registry.search'])
      expect(evidence.timings?.map((timing) => timing.name)).toContain(
        'model.agent_total',
      )
      expect(evidence.timings?.map((timing) => timing.name)).toContain(
        'model.openrouter_round',
      )
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
})

describe('POST /api/answer/turn persistence resilience', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
  })

  it('does not emit a provider-bearing complete when Convex persistence is unavailable', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One business may fit what you need.',
        summary:
          'The business offers emergency pipe repair. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const store = createAnswerThreadTestStore()
    store.persistError = new Error('convex unavailable')
    installAnswerThreadTestPort(store)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '', 'X-AE-Turn-Key': 'empty:persistence-failure' },
          body: JSON.stringify({ query: 'emergency plumber parramatta' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = await readAnswerTurnStream(response)
      expect(
        frames.some(
          (frame) =>
            frame.event.type === 'complete' &&
            frame.event.answer.providers.length > 0,
        ),
      ).toBe(false)
      expect(frames.at(-1)?.event).toMatchObject({
        type: 'error',
        problem: { code: 'answer_turn_persist_failed' },
      })
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
})

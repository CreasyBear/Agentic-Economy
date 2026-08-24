import { describe, expect, it, vi } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import type { KeylessExecutableSourcePort, KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { answerTurnRequestDigest, streamAnswerTurn } from '@/modules/answer-thread/server'
import { reserveAnswerTurn } from '@/modules/answer-thread/answer-thread.functions'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  type AnswerThreadTestStore,
} from '../../helpers/answer-thread-test-port'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'
import { createLocalE2eRegistrySourcePort } from '../../helpers/registry-local-e2e'

const operationSourceMocks = vi.hoisted(() => ({
  readCapabilityOperationSearch: vi.fn(),
  readCapabilityOperationDetail: vi.fn(),
  readCapabilityOperationCompare: vi.fn(),
  readCapabilityOperationInspectPlan: vi.fn(),
  readCatalogOfferingOperationMap: vi.fn(async () => []),
}))

vi.mock('@/modules/capability-supply/operation-source', () => operationSourceMocks)

function publicOperationFor(
  descriptor: KeylessExecutableToolDescriptor,
): PublicOperationDescriptor {
  const operationRef = descriptor.operationRef as PublicOperationDescriptor['operationRef']
  return {
    operationRef,
    operationId: `operation:${descriptor.capabilityId}`,
    callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    paymentLane: 'brokered',
    contract: {
      capabilityId: descriptor.capabilityId,
      version: 1,
      inputJsonSchema: descriptor.inputSchema as PublicOperationDescriptor['contract']['inputJsonSchema'],
      outputJsonSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      customerAnnotations: [],
    },
    business: {
      businessId: `business:${descriptor.capabilityId}`,
      slug: descriptor.capabilityId,
      name: descriptor.name,
    },
    offering: {
      offeringRef: `offering:${descriptor.capabilityId}`,
      revision: 1,
      label: descriptor.name,
      summary: descriptor.summary,
    },
    summary: descriptor.summary,
    commercial: {
      price: { kind: 'on_request' },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No commercial relationship.' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    authentication: { kind: 'keyless' },
    transport: { method: 'GET', requestTimeoutMs: 5_000 },
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    availability: { posture: 'routeable' },
    navigation: [{
      relation: 'execute',
      method: 'POST',
      actionId: 'operation.execute',
      authentication: 'none',
      surfaces: ['chat'],
    }],
  }
}

function operationSearchResultFor(
  descriptors: readonly KeylessExecutableToolDescriptor[],
): unknown {
  const operations = descriptors.map(publicOperationFor)
  return {
    kind: 'ok',
    schemaVersion: 'registry-operations:v1',
    query: 'current measurement for Sydney',
    items: operations,
    matchedCount: operations.length,
    ranking: operations.map((operation, index) => ({
      operationRef: operation.operationRef,
      rank: index + 1,
      score: operations.length - index,
    })),
    pagination: { limit: 20, hasMore: false },
    navigation: [],
  }
}

const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: vi.fn(async () => []),
}

type StreamFixture = {
  readonly events: readonly AnswerEvent[]
  readonly store: AnswerThreadTestStore
  readonly turnId: string
}

async function runTurn(query: string, keylessExecutableSource = emptyKeylessSource): Promise<StreamFixture> {
  const store = createAnswerThreadTestStore()
  const reset = installAnswerThreadTestPort(store)
  const requestDigest = answerTurnRequestDigest({ query })
  const admission = await reserveAnswerTurn({
    sessionId: 'answer-reference-boundary',
    query,
    requestDigest,
    reservationKey: `reference-boundary:${query}`,
    title: query,
  })
  if (admission.kind !== 'reserved') {
    reset()
    throw new Error(`fixture reservation ${admission.kind}`)
  }

  const events: AnswerEvent[] = []
  try {
    await streamAnswerTurn(
      {
        sessionId: 'answer-reference-boundary',
        query,
        requestDigest,
        admission,
        sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
          method: 'POST',
          headers: { 'X-AE-Turn-Key': 'harness:reference-boundary' },
        }),
        sourceWriteBody: '',
        keylessExecutableSource,
      },
      ({ event }) => events.push(event),
    )
    return { events, store, turnId: admission.turnId }
  } finally {
    reset()
  }
}


describe('answer reference boundary', () => {
  it('uses operation reads before explaining an unavailable Wikipedia request', async () => {
    operationSourceMocks.readCapabilityOperationSearch.mockResolvedValue({
      kind: 'no_candidates',
      schemaVersion: 'registry-operations:v1',
      query: 'Wikipedia page summary Ada Lovelace',
      appliedFilters: {},
      matchedCount: 0,
      ranking: [],
      navigation: [],
    })
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{
        toolId: 'registry.operations.search',
        input: { query: 'Wikipedia page summary Ada Lovelace', limit: 3 },
      }],
      prose: {
        oneLine: 'No admitted live capability matched this request.',
        summary: 'The registered operation search returned no executable capability for Wikipedia.',
        whatToDoNow: 'Ask for a supported live data lookup.',
      },
    }), { preflightRoute: 'operation' })
    const restoreOpenRouter = server.installEnv()
    try {
      const result = await runTurn('Give me a Wikipedia page summary of Ada Lovelace')
      const complete = result.events.at(-1)
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected a complete boundary answer')

      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toBe('No admitted live capability matched this request.')
      expect(complete.answer.summary).toContain('registered operation search')
      expect(complete.answer.nextStep).not.toMatch(/business|contact|timing|match/i)

      const turn = result.store.turns.get(result.turnId)
      const evidence = JSON.parse(turn?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { toolId?: string; status?: string }[]
      }
      expect(evidence.toolCalls ?? []).toHaveLength(1)
      expect(evidence.toolCalls ?? []).toEqual(expect.arrayContaining([
        expect.objectContaining({
          toolId: 'registry.operations.search',
          status: 'complete',
        }),
      ]))
      expect((evidence.toolCalls ?? []).every(
        ({ toolId }) => toolId === 'registry.operations.search',
      )).toBe(true)
      expect(server.requests.filter(
        (request) => request.response_format?.json_schema?.name === 'answer_navigation',
      )).toHaveLength(0)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('lets the model clarify ambiguous live operations without executing or business-searching', async () => {
    const descriptors: readonly KeylessExecutableToolDescriptor[] = [
      {
        operationRef: `operation:v1:${'a'.repeat(64)}`,
        capabilityId: 'alpha.current-measurement',
        name: 'Alpha current measurement',
        summary: 'Returns a current measurement for a city.',
        searchTerms: ['current measurement', 'measurement'],
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
      {
        operationRef: `operation:v1:${'b'.repeat(64)}`,
        capabilityId: 'beta.current-measurement',
        name: 'Beta current measurement',
        summary: 'Returns a current measurement for a city.',
        searchTerms: ['current measurement', 'measurement'],
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ]
    operationSourceMocks.readCapabilityOperationSearch.mockResolvedValue(
      operationSearchResultFor(descriptors),
    )
    const keylessSource: KeylessExecutableSourcePort = {
      list: async () => descriptors,
      read: async () => null,
      search: async () => descriptors.map(({ operationRef }) => operationRef),
    }
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{
        toolId: 'registry.operations.search',
        input: { query: 'current measurement for Sydney', limit: 3 },
      }],
      prose: {
        oneLine: 'Which live source should I use?',
        summary: 'Multiple admitted live operations match this request.',
        whatToDoNow: 'Choose the live source you want.',
      },
    }), { preflightRoute: 'operation' })
    const restoreOpenRouter = server.installEnv()
    try {
      const result = await runTurn('Get the current measurement for Sydney', keylessSource)
      const complete = result.events.at(-1)
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected a complete ambiguous answer')

      expect(complete.answer.oneLine).toBe('Which live source should I use?')
      expect(complete.answer.nextStep).toBe('Choose the live source you want.')
      expect(complete.answer.providers).toEqual([])
      expect(server.requests.filter(
        (request) => request.response_format?.json_schema?.name === 'answer_navigation',
      )).toHaveLength(0)
      const evidence = JSON.parse(result.store.turns.get(result.turnId)?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { toolId?: string; status?: string }[]
      }
      expect(evidence.toolCalls ?? []).toEqual([
        expect.objectContaining({
          toolId: 'registry.operations.search',
          status: 'complete',
        }),
      ])
      expect(evidence.toolCalls?.some(
        ({ toolId }) => toolId === 'registry.search'
          || toolId === 'operation.execute'
          || toolId === 'operation.invoke',
      )).toBe(false)
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })


  it('keeps local-business retrieval authoritative when preflight chooses operation', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'I need an emergency plumber near Perth', limit: 3 } }],
      prose: {
        oneLine: 'A Perth emergency plumber may fit.',
        summary: 'Listed plumbing options still need confirmation of scope and availability.',
        whatToDoNow: 'Review the listed provider options.',
      },
    }), { preflightRoute: 'operation' })
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const restoreRegistry = setPublicRegistrySourcePortForTests(
      createLocalE2eRegistrySourcePort(),
    )
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runTurn('I need an emergency plumber near Perth')
      const complete = result.events.at(-1)
      expect(server.requests.length).toBeGreaterThan(0)
      expect(result.events.some(
        (event) => event.type === 'work-step'
          && event.step.phase === 'search',
      )).toBe(true)
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected a complete local-business answer')
      expect(complete.answer.layoutProfile).toBe('empty_state')
      const evidence = JSON.parse(
        result.store.turns.get(result.turnId)?.evidenceJson ?? '{}',
      ) as {
        toolCalls?: readonly { toolId?: string }[]
      }
      expect(evidence.toolCalls ?? []).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolId: 'registry.search' }),
      ]))
      expect(
        (evidence.toolCalls ?? []).some(({ toolId }) =>
          toolId?.startsWith('registry.operations.') === true,
        ),
      ).toBe(false)
    } finally {
      restoreOpenRouter()
      await server.close()
      restoreRegistry()
      if (previousLocalRegistry === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvexUrl
      if (previousViteConvexUrl === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousViteConvexUrl
    }
  })
})

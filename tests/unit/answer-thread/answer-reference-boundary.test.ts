import { describe, expect, it, vi } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import type { KeylessExecutableSourcePort, KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import { answerTurnRequestDigest, streamAnswerTurn } from '@/modules/answer-thread/server'
import { reserveAnswerTurn } from '@/modules/answer-thread/answer-thread.functions'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  type AnswerThreadTestStore,
} from '../../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'

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
  it('keeps an unavailable Wikipedia summary request out of business search', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'No prose should be needed for this boundary.',
        summary: 'No prose should be needed for this boundary.',
        whatToDoNow: 'Ask a supported question.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    try {
      const result = await runTurn('Give me a Wikipedia page summary of Ada Lovelace')
      const complete = result.events.at(-1)
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected a complete boundary answer')

      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toContain('cannot search the web')
      expect(complete.answer.summary).toContain('No web search was run')
      expect(complete.answer.nextStep).not.toMatch(/business|contact|timing|match/i)
      expect(complete.answer.layoutProfile).toBe('data_answer')

      const turn = result.store.turns.get(result.turnId)
      const evidence = JSON.parse(turn?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { toolId?: string }[]
      }
      expect(evidence.toolCalls ?? []).toEqual([])
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('keeps ambiguous live operations out of business retrieval and model selection', async () => {
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
    const keylessSource: KeylessExecutableSourcePort = {
      list: async () => descriptors,
      read: async () => null,
      search: async () => descriptors.map(({ operationRef }) => operationRef),
    }
    const server = await startOpenRouterContractServer(() => {
      throw new Error('model must not choose among ambiguous operations')
    })
    const restoreOpenRouter = server.installEnv()
    try {
      const result = await runTurn('Get the current measurement for Sydney', keylessSource)
      const complete = result.events.at(-1)
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected a complete ambiguous answer')

      expect(complete.answer.oneLine).toBe('Which live source should I use?')
      expect(complete.answer.providers).toEqual([])
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.response_format?.json_schema?.name).toBe('answer_query_safety')
      expect(server.requests[0]?.tools).toBeUndefined()
      const evidence = JSON.parse(result.store.turns.get(result.turnId)?.evidenceJson ?? '{}') as {
        toolCalls?: readonly unknown[]
      }
      expect(evidence.toolCalls ?? []).toEqual([])
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('still routes a general local-business request through business retrieval', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'Emergency plumber Brunswick', limit: 3 } }],
      prose: {
        oneLine: 'A Brunswick emergency plumber may fit.',
        summary: 'Listed plumbing options still need confirmation of scope and availability.',
        whatToDoNow: 'Review the listed provider options.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousViteConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL

    try {
      const result = await runTurn('Emergency plumber Brunswick')
      const complete = result.events.at(-1)
      expect(server.requests.length).toBeGreaterThan(0)
      expect(result.events.some(
        (event) => event.type === 'work-step'
          && event.step.phase === 'search'
          && event.step.title === 'Searching for matches',
      )).toBe(true)
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected a complete local-business answer')
      expect(complete.answer.layoutProfile).toBe('empty_state')
    } finally {
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      else process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      if (previousConvexUrl === undefined) delete process.env.CONVEX_URL
      else process.env.CONVEX_URL = previousConvexUrl
      if (previousViteConvexUrl === undefined) delete process.env.VITE_CONVEX_URL
      else process.env.VITE_CONVEX_URL = previousViteConvexUrl
    }
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { DEFAULT_AE_SEARCH_CONTEXT } from '@/modules/answer/search-context'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import {
  openRouterProseResponse,
  openRouterToolResponse,
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

type StreamFrame = { seq: number; event: AnswerEvent }

const SESSION_COOKIE = sessionCookieHeader('session-empty-state')

function parseStream(text: string): StreamFrame[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map(
      (frame) => JSON.parse(frame.slice('data:'.length).trim()) as StreamFrame,
    )
}

function stubThreadPort(turns: unknown[]): void {
  setAnswerThreadPortForTests({
    createThread: async (args) => ({ threadId: args.threadId }),
    appendTurn: async (args) => {
      turns.push(args)
      return { turnId: args.turnId }
    },
    listSessionThreads: async () => ({ threads: [] }),
    getPublicThreadProjection: async () => null,
    getThreadTurns: async () => ({ turns: [] }),
  })
}

describe('POST /api/answer/turn empty-state queries', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    delete process.env.AE_ANSWER_SYNTHESIZER
    setAnswerThreadPortForTests(undefined)
  })

  it('completes with honest empty-state copy when no providers match', async () => {
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()
    setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => ({ turnId: args.turnId }),
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ turns: [] }),
    })

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      expect(frames.slice(0, 3).map((frame) => frame.event.type)).toEqual([
        'thread',
        'work-step',
        'work-step',
      ])
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toContain('No listed businesses match')
      expect(complete.answer.summary).toContain('Brunswick')
      expect(server.requests).toHaveLength(0)
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

  it('answers direct registry matches without requiring model planning', async () => {
    const turns: unknown[] = []
    stubThreadPort(turns)
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'emergency plumber parramatta' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }

      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.offeringSources?.map((source) => source.business.slug)).toEqual([
        'plumbing-demo',
        'parramatta-emergency-plumbing',
      ])
      expect(complete.answer.offeringSources?.flatMap((source) => source.offerings).every(
        (offering) => offering.revision > 0,
      )).toBe(true)
      const offeringArtifact = frames
        .map((frame) => frame.event)
        .find((event) => event.type === 'artifact' && event.artifact.kind === 'offering-cards')
      expect(offeringArtifact).toMatchObject({
        type: 'artifact',
        artifact: {
          kind: 'offering-cards',
          sources: complete.answer.offeringSources,
        },
      })
      expect(complete.answer.oneLine).not.toContain('No listed businesses match')

      const persisted = turns.at(0) as { evidenceJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        offeringSources?: typeof complete.answer.offeringSources
        toolCalls?: readonly { toolId?: string; inputJson?: string }[]
        timings?: readonly { name?: string }[]
        workLog?: readonly { id?: string; status?: string; detailRows?: readonly { label?: string; value?: string }[] }[]
      }
      expect(evidence.offeringSources).toEqual(complete.answer.offeringSources)
      expect(evidence.toolCalls?.[0]?.toolId).toBe('registry.search')
      expect(JSON.parse(evidence.toolCalls?.[0]?.inputJson ?? '{}')).toMatchObject({
        query: 'emergency plumber parramatta',
        limit: 3,
      })
      expect(evidence.timings?.map((timing) => timing.name)).toEqual(
        expect.arrayContaining([
          'turn.context_parse',
          'retrieval.initial_search',
          'tool.run',
          'sse.emit_snapshot',
          'turn.persistence_prepare',
        ]),
      )
      expect(evidence.workLog?.map((step) => step.id)).toEqual(
        expect.arrayContaining([
          'step-1',
          'step-2',
          'step-3',
          'step-4',
          'step-5',
        ]),
      )
      const searchStep = evidence.workLog?.find((step) => step.id === 'step-2')
      expect(searchStep?.status).toBe('complete')
      expect(searchStep?.detailRows?.some((row) => row.label === 'Results' && row.value === '2')).toBe(true)
      expect(server.requests).toHaveLength(0)
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

  it('does not freeze service-only tool results for a suburb-specific query', async () => {
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()
    const turns: unknown[] = []
    stubThreadPort(turns)

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.agentJsonUrl).toContain('q=Emergency+plumber+Brunswick')
      const persisted = turns.at(0) as { evidenceJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        providers?: unknown[]
        allowedSlugs?: unknown[]
        toolCalls?: readonly { inputJson?: string }[]
        timings?: readonly { name?: string }[]
      }
      expect(evidence.providers).toEqual([])
      expect(evidence.allowedSlugs).toEqual([])
      expect(
        evidence.toolCalls?.map((call) => JSON.parse(call.inputJson ?? '{}').query),
      ).toEqual(['Emergency plumber Brunswick'])
      expect(evidence.timings?.map((timing) => timing.name)).not.toContain('model.agent_total')
      expect(server.requests).toHaveLength(0)
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

  it('filters a wrong-location tool query and rebuilds provider prose', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }],
      prose: {
        oneLine: 'Parramatta Emergency Plumbing matches this need.',
        summary:
          'Parramatta Emergency Plumbing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow:
          'Open Parramatta Emergency Plumbing and send an inquiry when published. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
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
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'Emergency plumber Brunswick' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toBe('No listed businesses match "Emergency plumber Brunswick" yet.')
      expect(complete.answer.oneLine).not.toContain('Parramatta')
      expect(complete.answer.summary).not.toContain('Parramatta')
      expect(complete.answer.nextStep).not.toContain('Parramatta')
      const persisted = turns.at(0) as { evidenceJson: string; proseJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        providers?: unknown[]
        allowedSlugs?: unknown[]
      }
      const prose = JSON.parse(persisted?.proseJson ?? '{}') as {
        oneLine?: string
        summary?: string
        nextStep?: string
      }
      expect(evidence.providers).toEqual([])
      expect(evidence.allowedSlugs).toEqual([])
      expect(prose.oneLine).not.toContain('Parramatta')
      expect(prose.summary).not.toContain('Parramatta')
      expect(prose.nextStep).not.toContain('Parramatta')
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

  it('scopes a placeless query to the active search context', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }],
      prose: {
        oneLine: 'Parramatta Emergency Plumbing matches this need.',
        summary:
          'Parramatta Emergency Plumbing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow:
          'Open Parramatta Emergency Plumbing and send an inquiry when published. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
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
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({
            query: 'Emergency plumber',
            searchContext: DEFAULT_AE_SEARCH_CONTEXT,
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
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.summary).toContain('Perth')
      expect(complete.answer.summary).not.toContain('Parramatta')
      expect(complete.answer.agentJsonUrl).toContain('q=Emergency+plumber+near+Perth')

      const persisted = turns.at(0) as { evidenceJson: string; proseJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        providers?: unknown[]
        searchContext?: { location?: { label?: string } }
      }
      expect(evidence.providers).toEqual([])
      expect(evidence.searchContext?.location?.label).toBe('Perth, WA')
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
      if (hasToolResult && /brunswick/i.test(latestQuery)) {
        return openRouterProseResponse({
          oneLine: 'No emergency plumbers currently listed on Agentic Economy for Brunswick.',
          summary:
            'We searched the Agentic Economy registry for emergency plumbers in Brunswick and no providers were found.',
          whatToDoNow: 'Try a nearby suburb, browse services, or list a business that should appear here.',
        })
      }
      if (hasToolResult) {
        return openRouterProseResponse({
          oneLine: 'One listed business matches Parramatta.',
          summary:
            'Parramatta Emergency Plumbing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
          whatToDoNow:
            'Open the provider page and send an inquiry when published. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        })
      }
      if (/brunswick/i.test(latestQuery)) {
        return openRouterToolResponse([{ toolId: 'registry.search', input: { query: 'emergency plumbing' } }])
      }
      if (/parramatta/i.test(latestQuery)) {
        return openRouterToolResponse([{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }])
      }
      return openRouterProseResponse({
        oneLine: 'No two listed businesses to compare yet.',
        summary: 'There are not two current listed businesses to compare.',
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
          },
          body: JSON.stringify({ query: 'Emergency plumber Parramatta' }),
        }),
      )
      const firstFrames = parseStream(await first.text())
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
      expect(firstComplete.answer.providers).toEqual([])
      expect(firstComplete.answer.offeringSources?.map((source) => source.business.slug)).toContain(
        'parramatta-emergency-plumbing',
      )

      const second = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: SESSION_COOKIE,
          },
          body: JSON.stringify({ threadId, query: 'Emergency plumber Brunswick' }),
        }),
      )
      const secondFrames = parseStream(await second.text())
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
          },
          body: JSON.stringify({ threadId, query: 'Compare the top two' }),
        }),
      )
      const compareFrames = parseStream(await compare.text())
      const compareComplete = compareFrames.at(-1)?.event
      expect(compareComplete?.type).toBe('complete')
      if (compareComplete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(compareComplete.answer.providers).toEqual([])
      expect(compareComplete.answer.oneLine).toBe('No two listed businesses to compare yet.')
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

  it('recovers a misspelled query through the tool-use agent choosing registry.search("parramatta")', async () => {
    process.env.AE_ANSWER_SYNTHESIZER = 'tool-use'
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow:
          'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
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
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'paramata' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(
        complete.answer.offeringSources?.map((source) => source.business.slug),
      ).toContain('parramatta-emergency-plumbing')
      // The frozen snapshot query stays honest to what the person typed.
      expect(complete.answer.query).toBe('paramata')
      // The agent JSON URL reflects the tool's chosen search query.
      expect(complete.answer.agentJsonUrl).toContain('q=parramatta')
      expect(complete.answer.oneLine).not.toContain('No listed businesses match')

      const persisted = turns.at(0) as { evidenceJson: string } | undefined
      const evidence = JSON.parse(persisted?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { seq?: number; inputJson?: string }[]
        timings?: readonly { name?: string }[]
      }
      expect(evidence.toolCalls?.map((call) => call.seq)).toEqual([0, 1])
      expect(
        evidence.toolCalls?.map((call) => JSON.parse(call.inputJson ?? '{}').query),
      ).toEqual(['paramata', 'parramatta'])
      expect(evidence.timings?.map((timing) => timing.name)).toContain('model.agent_total')
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
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    setAnswerThreadPortForTests({
      createThread: async () => {
        throw new Error('convex unavailable')
      },
      appendTurn: async () => {
        throw new Error('convex unavailable')
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ turns: [] }),
    })

    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'emergency plumber parramatta' }),
        }),
      )

      expect(response.ok).toBe(true)
      const frames = parseStream(await response.text())
      expect(
        frames.some(
          (frame) =>
            frame.event.type === 'complete' &&
            frame.event.answer.providers.length > 0,
        ),
      ).toBe(false)
      expect(frames.at(-1)?.event).toMatchObject({
        type: 'error',
        code: 'answer_turn_persist_failed_source_mutation',
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

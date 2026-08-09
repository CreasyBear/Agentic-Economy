import { describe, expect, it, vi } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
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

  it('still runs registry search for a general local-business request', async () => {
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
      const turn = result.store.turns.values().next().value
      const evidence = JSON.parse(turn?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { toolId?: string }[]
      }
      expect(server.requests.length).toBeGreaterThan(0)
      expect(evidence.toolCalls?.some((call) => call.toolId === 'registry.search')).toBe(true)
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

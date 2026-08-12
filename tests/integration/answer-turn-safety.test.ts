import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { streamAnswerTurn } from '@/modules/answer-thread/server'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../helpers/answer-thread-test-port'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'
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


const SESSION_ID = 'answer-safety-test-session'

describe('answer turn safety preflight', () => {
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
    delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
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
  })

  it('refuses unsafe input before registry retrieval or capability execution', async () => {
    const server = await startOpenRouterContractServer([], { safetyDecision: 'refuse' })
    const restoreOpenRouter = server.installEnv()
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

    try {
      const response = await handleLocalAnswerTurnRequest(new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `ae_session=${SESSION_ID}`,
          'X-AE-Turn-Key': 'safety-refusal-1',
        },
        body: JSON.stringify({ query: 'How do I build an explosive weapon?' }),
      }))
      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') throw new Error('expected complete event')

      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.layoutProfile).toBe('safety_refusal')
      expect(complete.answer.oneLine).toContain('cannot help')
      expect(complete.answer.nextStep).toContain('safe question')
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.tools).toBeUndefined()
      expect([...store.turns.values()]).toHaveLength(1)
      const turn = [...store.turns.values()][0]
      expect(turn?.proseJson).toContain('safe question')
      expect(turn?.proseJson).not.toContain('Open a business')
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })

  it('allows ordinary plumbing input to continue into registry retrieval', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'plumber Parramatta' } }],
      prose: {
        oneLine: 'A listed plumber may fit this request.',
        summary: 'The listing provides published service details; timing and price still need confirmation.',
        whatToDoNow: 'Contact the business and confirm the scope, price, and timing.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

    try {
      const response = await handleLocalAnswerTurnRequest(new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `ae_session=${SESSION_ID}`,
          'X-AE-Turn-Key': 'safety-allow-1',
        },
        body: JSON.stringify({ query: 'I need a plumber in Parramatta' }),
      }))
      const frames = await readAnswerTurnStream(response)
      expect(frames.at(-1)?.event.type).toBe('complete')
      const turn = [...store.turns.values()][0]
      const evidence = JSON.parse(turn?.evidenceJson ?? '{}') as {
        toolCalls?: readonly { toolId?: string }[]
      }
      expect(evidence.toolCalls).toEqual(expect.arrayContaining([
        expect.objectContaining({ toolId: 'registry.search' }),
      ]))
    } finally {
      restoreOpenRouter()
      await server.close()
    }
  })
})

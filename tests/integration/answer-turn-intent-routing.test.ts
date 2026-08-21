import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { streamAnswerTurn } from '@/modules/answer-thread/server'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../helpers/answer-thread-test-port'
import { installLocalE2eRegistrySourceForTests } from '../helpers/registry-local-e2e'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

import { readAnswerTurnStream } from '../helpers/answer-turn-stream'
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

function isSafetyModelRequest(request: { response_format?: { json_schema?: { name?: string } }; messages: readonly { role: string; content: string }[] }): boolean {
  const schemaName = request.response_format?.json_schema?.name
  return schemaName === 'answer_query_safety'
    || schemaName === 'answer_request_preflight'
    || request.messages.some((message) =>
      message.role === 'system' && message.content.includes('Classify the user request'),
    )
}

function expectSafetyThenToolLoop(requests: readonly { tools?: unknown; response_format?: { json_schema?: { name?: string } }; messages: readonly { role: string; content: string }[] }[]): void {
  const safety = requests.filter(isSafetyModelRequest)
  const agent = requests.filter((request) => !isSafetyModelRequest(request))
  expect(safety.length).toBeGreaterThanOrEqual(1)
  expect(safety.every((request) => request.tools === undefined)).toBe(true)
  expect(agent.some((request) => Array.isArray(request.tools) && request.tools.length > 0)).toBe(true)
}

function handleLocalAnswerTurnRequest(request: Request): Promise<Response> {
  return handleAnswerTurnRequest(request, { stream: streamWithLocalSources })
}


const PARRAMATTA_PROVIDER = {
  citationIndex: 1,
  slug: 'demo-listed-provider',
  name: 'Demo listed provider',
  category: 'Emergency plumbing',
  suburb: 'Parramatta',
  stateTerritory: 'NSW',
  serviceArea: 'Parramatta and nearby suburbs',
  hoursLabel: 'Hours supplied by owner',
  availabilityLabel: 'Checked by Agentic Economy',
  trustLabel: 'Checked',
  responseTimeLabel: 'Response time not supplied',
  trustCue: 'Checked',
  nextStepLabel: 'Send inquiry',
  detailUrl: '/demo-listed-provider',
  services: [{ name: 'Listed offering', category: 'Emergency plumbing', summary: 'x' }],
}


const FROZEN_EVIDENCE_DRAFT: FrozenTurnEvidenceDraft = {
  providers: [PARRAMATTA_PROVIDER],
  allowedSlugs: ['demo-listed-provider'],
  agentJsonUrl: '/api/businesses/search?q=parramatta',
  toolCalls: [],
  timings: [],
  workLog: [],
}

const FROZEN_EVIDENCE = {
  ...FROZEN_EVIDENCE_DRAFT,
  answerRun: buildAnswerRunReport({
    intent: 'refine_search',
    status: 'complete',
    snapshotHash: 'hash-prior',
    evidence: FROZEN_EVIDENCE_DRAFT,
  }),
}
const FIXED_SESSION_ID = `session-routing-test-${crypto.randomUUID()}`
const PRIOR_THREAD_ID = 'thread-prior'

function priorThreadPort(): void {
  const store = createAnswerThreadTestStore()
  store.threads.set(PRIOR_THREAD_ID, {
    threadId: PRIOR_THREAD_ID,
    pseudonymousSessionId: FIXED_SESSION_ID,
    title: 'emergency plumber parramatta',
    createdAt: 1_000,
    updatedAt: 1_000,
  })
  store.turns.set('prior-1', {
    turnId: 'prior-1',
    threadId: PRIOR_THREAD_ID,
    seq: 1,
    query: 'emergency plumber parramatta',
    intent: 'refine_search',
    evidenceJson: JSON.stringify(FROZEN_EVIDENCE),
    snapshotHash: 'hash-prior',
    proseJson: JSON.stringify({ oneLine: 'x', summary: 'y', nextStep: 'z' }),
    artifactKindsJson: '[]',
    status: 'complete',
    createdAt: 1_000,
  })
  installAnswerThreadTestPort(store)
}

function turnRequest(query: string, threadId: string = PRIOR_THREAD_ID): Request {
  return new Request('https://ae.example/api/answer/turn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `ae_session=${FIXED_SESSION_ID}`,
      'X-AE-Turn-Key': `intent:${query}`,
    },
    body: JSON.stringify({ threadId, query }),
  })
}

describe('POST /api/answer/turn common safe-turn agent behavior (tool-use)', () => {
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
  })

  it('uses the common agent to recover a misspelled business search with registry tools', async () => {
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

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      // First turn without thread context enters the common agent path.
      const response = await handleLocalAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `ae_session=${FIXED_SESSION_ID}`,
            'X-AE-Turn-Key': 'intent:first-paramata',
          },
          body: JSON.stringify({ query: 'paramata' }),
        }),
      )

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(server.requests).toHaveLength(4)
      expect(server.requests[0]?.response_format?.json_schema?.name).toBe('answer_request_preflight')
      const agentRequests = server.requests.slice(1)
      expect(agentRequests).toHaveLength(3)
      for (const request of agentRequests) {
        const userPrompt = request.messages.find((message) => message.role === 'user')?.content ?? ''
        expect(userPrompt).toContain('User query: paramata')
        expect(userPrompt).not.toContain('<catalog_data>')
      }
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

  it('keeps clarification in the common agent without recovery prompts', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'Which kind of plumbing help do you need?',
        summary: 'Tell me the plumbing service you need so I can narrow the search.',
        whatToDoNow: 'Name the plumbing service you need.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `ae_session=${FIXED_SESSION_ID}`,
            'X-AE-Turn-Key': 'intent:clarify-plumber',
          },
          body: JSON.stringify({ query: 'plumber' }),
        }),
      )

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expectSafetyThenToolLoop(server.requests)
      expect(server.requests.slice(1).flatMap((request) =>
        request.messages.filter((message) => message.role === 'tool'),
      )).toHaveLength(0)
      const plan = frames.find(({ event }) => event.type === 'plan')?.event
      if (plan?.type !== 'plan') {
        throw new Error('expected clarification plan event')
      }
      expect(plan.layoutProfile).toBe('empty_state')
      expect(frames.some(({ event }) =>
        event.type === 'thinking' && event.label === 'Searching for matches…',
      )).toBe(true)
      expect(frames.some(({ event }) =>
        event.type === 'artifact' && event.artifact.kind === 'recovery-prompts',
      )).toBe(false)
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.layoutProfile).toBe('empty_state')
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

  it('reuses frozen prior providers as the common agent answer source', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'One business accepts requests.',
        summary:
          'The earlier business has a request option. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(turnRequest('compare the listed businesses'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      // The common agent receives the frozen provider projection after the mandatory safety preflight.
      expectSafetyThenToolLoop(server.requests)
      expect(server.requests.slice(1).flatMap((request) =>
        request.messages.filter((message) => message.role === 'tool'),
      )).toHaveLength(0)
      expect(complete.answer.providers).toEqual([])
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

  it('uses frozen provider evidence without inventing a hosted contact path', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'Demo listed provider is selected for review.',
        summary: 'Review the published details before using a contact channel listed by the business.',
        whatToDoNow: 'Open the business page and use a published contact channel if one is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(turnRequest('review the first one'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expectSafetyThenToolLoop(server.requests)
      expect(server.requests.slice(1).flatMap((request) =>
        request.messages.filter((message) => message.role === 'tool'),
      )).toHaveLength(0)
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toBe(
        'Demo listed provider is selected for review.',
      )
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.nextStep).toContain('published contact channel')
      expect(complete.answer.nextStep).not.toContain('request form')
      expect(complete.answer.summary).toContain('published details')
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

  it('uses the common agent to explain the safe operating boundary', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'The assistant compares published details, but it cannot book or start the job.',
        summary: 'Use the cards to compare published details and contact the business for anything beyond comparison.',
        whatToDoNow: 'Open a business page and contact the business when you are ready.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(turnRequest('what can agentic economy do'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expectSafetyThenToolLoop(server.requests)
      expect(server.requests.slice(1).flatMap((request) =>
        request.messages.filter((message) => message.role === 'tool'),
      )).toHaveLength(0)
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toContain('cannot book or start the job')
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

  it.each([
    ['book this plumber and charge my card'],
    ['send a technician now'],
  ])('keeps imperative requests on the safe-action boundary through the common agent: "%s"', async (query) => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'This kind of request is not available here; the business would need to handle it directly.',
        summary: 'The business reviews your message and replies using the contact details you provide.',
        whatToDoNow: 'Open a business page to use its request option when available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: `ae_session=${FIXED_SESSION_ID}`,
            'X-AE-Turn-Key': `intent:imperative:${query}`,
          },
          body: JSON.stringify({ query }),
        }),
      )

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expectSafetyThenToolLoop(server.requests)
      expect(server.requests.slice(1).flatMap((request) =>
        request.messages.filter((message) => message.role === 'tool'),
      )).toHaveLength(0)
      if (complete?.type !== 'complete') {
        throw new Error(`expected complete event, got ${JSON.stringify(complete)}`)
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toContain('This kind of request is not available here')
      expect(complete.answer.nextStep).toContain('Open a business page')
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

  it('keeps unsupported requests on the safe-action boundary through the common agent', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      prose: {
        oneLine: 'This kind of request is not available here; the business would need to handle it directly.',
        summary: 'The business reviews your message and replies using the contact details you provide.',
        whatToDoNow: 'Open a business page to use its request option when available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleLocalAnswerTurnRequest(turnRequest('book now and pay today'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expectSafetyThenToolLoop(server.requests)
      expect(server.requests.slice(1).flatMap((request) =>
        request.messages.filter((message) => message.role === 'tool'),
      )).toHaveLength(0)
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toContain('This kind of request is not available here')
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

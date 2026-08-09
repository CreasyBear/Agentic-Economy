import { afterEach, describe, expect, it } from 'vitest'

import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../helpers/answer-thread-test-port'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

import { readAnswerTurnStream } from '../helpers/answer-turn-stream'

const PARRAMATTA_PROVIDER = {
  citationIndex: 1,
  slug: 'parramatta-emergency-plumbing',
  name: 'Parramatta Emergency Plumbing',
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
  detailUrl: '/parramatta-emergency-plumbing',
  inquiryUrl: '/parramatta-emergency-plumbing/inquiry',
  services: [{ name: 'Emergency pipe repair', category: 'Emergency plumbing', summary: 'x' }],
}


const FROZEN_EVIDENCE_DRAFT: FrozenTurnEvidenceDraft = {
  providers: [PARRAMATTA_PROVIDER],
  allowedSlugs: ['parramatta-emergency-plumbing'],
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

describe('POST /api/answer/turn intent routing (tool-use)', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
  })

  it('refine_search: runs the agent with registry tools and records the tool call', async () => {
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
      // First turn (no threadId) → refine_search.
      const response = await handleAnswerTurnRequest(
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
      expect(server.requests).toHaveLength(3)
      const firstPrompt = server.requests[1]?.messages.find((message) => message.role === 'user')?.content ?? ''
      expect(firstPrompt).toContain('User query: paramata')
      expect(firstPrompt).not.toContain('<catalog_data>')
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

  it('filter_known: reuses frozen prior providers and calls no registry tool', async () => {
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
      const response = await handleAnswerTurnRequest(turnRequest('which ones accept inquiries'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      // Frozen provider reused deterministically; only the mandatory safety preflight runs.
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.tools).toBeUndefined()
      expect(complete.answer.providers.map((provider) => provider.slug)).toEqual([
        'parramatta-emergency-plumbing',
      ])
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

  it('inquiry_handoff: resolves a prior provider without calling the agent', async () => {
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(turnRequest('message the first one'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.tools).toBeUndefined()
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toBe(
        'Ready to send a request to Parramatta Emergency Plumbing.',
      )
      expect(complete.answer.selectedProvider?.slug).toBe('parramatta-emergency-plumbing')
      expect(complete.answer.providers.map((provider) => provider.slug)).toEqual([
        'parramatta-emergency-plumbing',
      ])
      expect(complete.answer.nextStep).toContain('request form')
      expect(complete.answer.summary).toContain('timing, price, and availability are not confirmed yet')
      const eventTypes = frames.map((frame) => frame.event.type)
      const selectedProviderArtifactEvent = frames
        .map((frame) => frame.event)
        .find((event) =>
          event.type === 'artifact' && event.artifact.kind === 'selected-provider')
      if (selectedProviderArtifactEvent?.type !== 'artifact' || selectedProviderArtifactEvent.artifact.kind !== 'selected-provider') {
        throw new Error('expected selected-provider artifact')
      }
      expect(selectedProviderArtifactEvent.artifact.provider.slug).toBe('parramatta-emergency-plumbing')
      expect(eventTypes.indexOf('artifact')).toBeLessThan(eventTypes.indexOf('next-step'))
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

  it('explain_boundary: answers from boundary-prose directly without calling the agent', async () => {
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(turnRequest('what can agentic economy do'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.tools).toBeUndefined()
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
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
  ])('first-turn imperative "%s" stays on the safe-action boundary without registry tools', async (query) => {
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(
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
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.tools).toBeUndefined()
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

  it('unsupported: answers from unsupported-prose directly without calling the agent', async () => {
    const server = await startOpenRouterContractServer([])
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(turnRequest('book now and pay today'))

      const frames = await readAnswerTurnStream(response)
      const complete = frames.at(-1)?.event
      expect(server.requests).toHaveLength(1)
      expect(server.requests[0]?.tools).toBeUndefined()
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
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

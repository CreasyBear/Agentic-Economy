import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../helpers/openrouter-contract-server'

type StreamFrame = { seq: number; event: AnswerEvent }

function parseStream(text: string): StreamFrame[] {
  return text
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice('data:'.length).trim()) as StreamFrame)
}

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

const FROZEN_EVIDENCE = {
  providers: [PARRAMATTA_PROVIDER],
  allowedSlugs: ['parramatta-emergency-plumbing'],
  agentJsonUrl: '/api/businesses/search?q=parramatta',
}

const FIXED_SESSION_ID = 'session-routing-test'
const PRIOR_THREAD_ID = 'thread-prior'

function priorThreadPort(): void {
  setAnswerThreadPortForTests({
    createThread: async (args) => ({ threadId: args.threadId }),
    appendTurn: async (args) => ({ turnId: args.turnId }),
    listSessionThreads: async () => ({ threads: [] }),
    getPublicThreadProjection: async () => null,
    getThreadTurns: async () => ({
      turns: [
        {
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
        },
      ],
    }),
    getAnswerThread: async (threadId) => {
      if (threadId !== PRIOR_THREAD_ID) {
        return null
      }
      return {
        threadId: PRIOR_THREAD_ID,
        pseudonymousSessionId: FIXED_SESSION_ID,
        title: 'emergency plumber parramatta',
        sharePolicy: 'public',
        createdAt: 1_000,
        updatedAt: 1_000,
        turnCount: 1,
      }
    },
  })
}

function turnRequest(query: string, threadId: string = PRIOR_THREAD_ID): Request {
  return new Request('https://ae.example/api/answer/turn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `ae_session=${FIXED_SESSION_ID}`,
    },
    body: JSON.stringify({ threadId, query }),
  })
}

describe('POST /api/answer/turn intent routing (tool-use)', () => {
  afterEach(() => {
    delete process.env.AE_ANSWER_SYNTHESIZER
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_OPENROUTER_API_BASE_URL
    setAnswerThreadPortForTests(undefined)
  })

  it('refine_search: runs the agent with registry tools and records the tool call', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. The business confirms timing, price, availability, and the work.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. The business confirms timing, price, availability, and the work.',
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
          },
          body: JSON.stringify({ query: 'paramata' }),
        }),
      )

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(server.requests).toHaveLength(2)
      const firstPrompt = server.requests[0]?.messages.find((message) => message.role === 'user')?.content ?? ''
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
        oneLine: 'One listing accepts inquiries.',
        summary:
          'The earlier provider publishes an inquiry option. The business confirms timing, price, availability, and the work.',
        whatToDoNow: 'Open the provider page and send an inquiry when published. The business confirms timing, price, availability, and the work.',
      },
    }))
    const restoreOpenRouter = server.installEnv()

    priorThreadPort()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const response = await handleAnswerTurnRequest(turnRequest('which ones accept inquiries'))

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      // Frozen provider reused deterministically; no model request and no fresh registry tool.
      expect(server.requests).toEqual([])
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

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(server.requests).toEqual([])
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toBe(
        "Ready to open Parramatta Emergency Plumbing's qualified inquiry form.",
      )
      expect(complete.answer.selectedProvider?.slug).toBe('parramatta-emergency-plumbing')
      expect(complete.answer.providers.map((provider) => provider.slug)).toEqual([
        'parramatta-emergency-plumbing',
      ])
      expect(complete.answer.nextStep).toContain('inquiry form')
      expect(complete.answer.summary).toContain('business confirms timing, quote, availability, and the work')
      expect(
        frames
          .map((frame) => frame.event)
          .filter((event): event is Extract<AnswerEvent, { type: 'work-step' }> => event.type === 'work-step')
          .map((event) => event.step.title),
      ).toEqual(expect.arrayContaining(['Resolving provider', 'Checking inquiry path', 'Checking safe-action boundary']))
      const resolveProviderStep = frames
        .map((frame) => frame.event)
        .filter((event): event is Extract<AnswerEvent, { type: 'work-step' }> => event.type === 'work-step')
        .find((event) => event.step.title === 'Resolving provider' && event.step.status === 'complete')
      expect(resolveProviderStep?.step.detailRows).toEqual(
        expect.arrayContaining([
          { label: 'Selected business', value: 'Parramatta Emergency Plumbing' },
        ]),
      )
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

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(server.requests).toEqual([])
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('business confirms what happens next')
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
          },
          body: JSON.stringify({ query }),
        }),
      )

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(server.requests).toEqual([])
      if (complete?.type !== 'complete') {
        throw new Error(`expected complete event, got ${JSON.stringify(complete)}`)
      }
      expect(complete.answer.providers).toEqual([])
      expect(complete.answer.oneLine).toContain('business-supported action')
      expect(complete.answer.nextStep).toContain('Find a listed business')
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

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(server.requests).toEqual([])
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('business-supported action')
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

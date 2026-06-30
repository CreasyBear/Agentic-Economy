import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { setAnswerToolUseAgentForTests } from '@/modules/answer/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

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
    setAnswerToolUseAgentForTests(undefined)
    setAnswerThreadPortForTests(undefined)
  })

  it('refine_search: runs the agent with registry tools and records the tool call', async () => {
    process.env.AE_ANSWER_SYNTHESIZER = 'tool-use'
    process.env.OPENROUTER_API_KEY = 'test-key'

    let receivedPriorProviders: unknown = 'unset'
    setAnswerToolUseAgentForTests(async ({ query, priorProviders }) => {
      receivedPriorProviders = priorProviders ?? 'none'
      return {
        toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
        prose: {
          oneLine: 'One listed business matches this need.',
          summary:
            'The listing publishes emergency pipe repair. Agentic Economy does not book or take payment on this page.',
          whatToDoNow: 'Open the provider page and send an inquiry when published.',
        },
      }
    })

    priorThreadPort()
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
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
      expect(receivedPriorProviders).toBe('none')
    })
  })

  it('filter_known: reuses frozen prior providers and calls no registry tool', async () => {
    process.env.AE_ANSWER_SYNTHESIZER = 'tool-use'
    process.env.OPENROUTER_API_KEY = 'test-key'

    let receivedPriorProviders: unknown = 'unset'
    setAnswerToolUseAgentForTests(async ({ priorProviders }) => {
      receivedPriorProviders = priorProviders ?? 'none'
      return {
        toolCalls: [],
        prose: {
          oneLine: 'One listing accepts inquiries.',
          summary:
            'The earlier provider publishes an inquiry option. Agentic Economy does not book or take payment on this page.',
          whatToDoNow: 'Open the provider page and send an inquiry when published.',
        },
      }
    })

    priorThreadPort()
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerTurnRequest(turnRequest('which ones accept inquiries'))

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      // Frozen provider reused; no tool call.
      expect(receivedPriorProviders).not.toBe('none')
      expect(complete.answer.providers.map((provider) => provider.slug)).toEqual([
        'parramatta-emergency-plumbing',
      ])
    })
  })

  it('explain_boundary: answers from boundary-prose directly without calling the agent', async () => {
    process.env.AE_ANSWER_SYNTHESIZER = 'tool-use'
    process.env.OPENROUTER_API_KEY = 'test-key'

    let agentCalled = false
    setAnswerToolUseAgentForTests(async () => {
      agentCalled = true
      return { toolCalls: [], prose: { oneLine: 'x', summary: 'y', whatToDoNow: 'z' } }
    })

    priorThreadPort()
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerTurnRequest(turnRequest('what can agentic economy do'))

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(agentCalled).toBe(false)
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('does not book')
    })
  })

  it('unsupported: answers from unsupported-prose directly without calling the agent', async () => {
    process.env.AE_ANSWER_SYNTHESIZER = 'tool-use'
    process.env.OPENROUTER_API_KEY = 'test-key'

    let agentCalled = false
    setAnswerToolUseAgentForTests(async () => {
      agentCalled = true
      return { toolCalls: [], prose: { oneLine: 'x', summary: 'y', whatToDoNow: 'z' } }
    })

    priorThreadPort()
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerTurnRequest(turnRequest('book now and pay today'))

      const frames = parseStream(await response.text())
      const complete = frames.at(-1)?.event
      expect(complete?.type).toBe('complete')
      expect(agentCalled).toBe(false)
      if (complete?.type !== 'complete') {
        throw new Error('expected complete event')
      }
      expect(complete.answer.oneLine).toContain('cannot book')
    })
  })
})

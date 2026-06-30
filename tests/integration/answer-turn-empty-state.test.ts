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
    delete process.env.AE_ANSWER_SYNTHESIZER
    setAnswerThreadPortForTests(undefined)
    setAnswerToolUseAgentForTests(undefined)
  })

  it('completes with honest empty-state copy when no providers match', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'

    setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'Emergency plumber Brunswick' } }],
      prose: {
        oneLine: 'No listed businesses match "Emergency plumber Brunswick" yet.',
        summary:
          'No providers are listed for that yet. You can list a business, or try a different need or suburb.',
        whatToDoNow: 'Try a nearby suburb, browse the registry, or list a business that should appear here.',
      },
    }))

    setAnswerThreadPortForTests({
      createThread: async (args) => ({ threadId: args.threadId }),
      appendTurn: async (args) => ({ turnId: args.turnId }),
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async () => null,
      getThreadTurns: async () => ({ turns: [] }),
    })

    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
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
      expect(complete.answer.oneLine).toContain('No listed businesses match')
      expect(complete.answer.summary).toContain('No providers are listed')
    })
  })

  it('recovers a misspelled query through the tool-use agent choosing registry.search("parramatta")', async () => {
    process.env.AE_ANSWER_SYNTHESIZER = 'tool-use'
    process.env.OPENROUTER_API_KEY = 'test-key'

    setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published.',
      },
    }))

    const turns: unknown[] = []
    stubThreadPort(turns)

    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
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
        complete.answer.providers.map((provider) => provider.slug),
      ).toEqual(['parramatta-emergency-plumbing'])
      // The frozen snapshot query stays honest to what the person typed.
      expect(complete.answer.query).toBe('paramata')
      // The agent JSON URL reflects the tool's chosen search query.
      expect(complete.answer.agentJsonUrl).toContain('q=parramatta')
      expect(complete.answer.oneLine).not.toContain('No listed businesses match')
    })
  })
})

describe('POST /api/answer/turn persistence resilience', () => {
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY
    setAnswerThreadPortForTests(undefined)
    setAnswerToolUseAgentForTests(undefined)
  })

  it('does not emit a provider-bearing complete when Convex persistence is unavailable', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'

    setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes emergency pipe repair. Agentic Economy does not book or take payment on this page.',
        whatToDoNow: 'Open the provider page and send an inquiry when published.',
      },
    }))

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

    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
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
        code: 'answer_turn_persist_failed',
      })
    })
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { setAnswerToolUseAgentForTests } from '@/modules/answer/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  sessionCookieHeader,
} from '../helpers/answer-thread-test-port'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

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

  it('does not freeze service-only tool results for a suburb-specific query', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'

    setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumbing' } }],
      prose: {
        oneLine: 'No emergency plumbers currently listed on Agentic Economy for Brunswick.',
        summary:
          'We searched the Agentic Economy registry for emergency plumbers in Brunswick and no providers were found.',
        whatToDoNow:
          'Try a nearby suburb, browse the registry, or list a business that should appear here. Agentic Economy does not book or take payment on this page.',
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
      }
      expect(evidence.providers).toEqual([])
      expect(evidence.allowedSlugs).toEqual([])
    })
  })

  it('filters a wrong-location tool query and rebuilds provider prose', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'

    setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }],
      prose: {
        oneLine: 'Parramatta Emergency Plumbing matches this need.',
        summary:
          'Parramatta Emergency Plumbing publishes emergency pipe repair. Agentic Economy does not book or take payment on this page.',
        whatToDoNow:
          'Open Parramatta Emergency Plumbing and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
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
    })
  })

  it('does not compare older providers after the latest turn has no valid providers', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'

    setAnswerToolUseAgentForTests(async ({ query }) => {
      if (/parramatta/i.test(query)) {
        return {
          toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumber parramatta' } }],
          prose: {
            oneLine: 'One listed business matches Parramatta.',
            summary:
              'Parramatta Emergency Plumbing publishes emergency pipe repair. Agentic Economy does not book or take payment on this page.',
            whatToDoNow:
              'Open the provider page and send an inquiry when published. Agentic Economy does not book or take payment on this page.',
          },
        }
      }

      if (/brunswick/i.test(query)) {
        return {
          toolCalls: [{ toolId: 'registry.search', input: { query: 'emergency plumbing' } }],
          prose: {
            oneLine: 'No emergency plumbers currently listed on Agentic Economy for Brunswick.',
            summary:
              'We searched the Agentic Economy registry for emergency plumbers in Brunswick and no providers were found.',
            whatToDoNow:
              'Try a nearby suburb, browse the registry, or list a business that should appear here.',
          },
        }
      }

      throw new Error(`unexpected agent call for ${query}`)
    })

    const store = createAnswerThreadTestStore()
    installAnswerThreadTestPort(store)

    const state = createDefaultRegistrySourceState()
    let threadId = ''
    await withRegistrySourcePortForTest(state, async () => {
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
      expect(firstComplete.answer.providers.map((provider) => provider.slug)).toContain(
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

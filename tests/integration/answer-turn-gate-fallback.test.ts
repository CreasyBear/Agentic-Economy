import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerEvent } from '@/modules/answer/public'
import { setAnswerToolUseAgentForTests } from '@/modules/answer/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
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

describe('POST /api/answer/turn gate failure', () => {
  afterEach(() => {
    delete process.env.AE_ANSWER_SYNTHESIZER
    delete process.env.OPENROUTER_API_KEY
    setAnswerToolUseAgentForTests(undefined)
    setAnswerThreadPortForTests(undefined)
  })

  it('emits a safe error and persists an error turn when the agent prose fails the gate', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'

    const turns: unknown[] = []

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

    // A misspelled query needs the agent recovery path. If the agent returns
    // overclaim prose after choosing a visible registry search, the gate must
    // reject it and the turn lands as an error.
    setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: 'registry.search', input: { query: 'parramatta' } }],
      prose: {
        oneLine: 'Book now for instant service.',
        summary: 'Pay today to confirm the job.',
        whatToDoNow: 'Dispatch immediately.',
      },
    }))

    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleAnswerTurnRequest(
        new Request('https://ae.example/api/answer/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: '' },
          body: JSON.stringify({ query: 'paramata' }),
        }),
      )

      expect(response.headers.get('content-type')).toContain('text/event-stream')
      const frames = parseStream(await response.text())
      const lastEvent = frames.at(-1)?.event
      expect(lastEvent?.type).toBe('error')

      expect(turns).toHaveLength(1)
      const turn = turns[0] as { status: string; proseJson: string }
      expect(turn.status).toBe('error')
      // No hallucinated overclaim prose is persisted.
      expect(turn.proseJson).not.toContain('Book now')
    })
  })
})

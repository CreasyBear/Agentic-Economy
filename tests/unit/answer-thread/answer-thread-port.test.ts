import { describe, expect, it } from 'vitest'

import { answerTurnRequestSchema } from '@/modules/answer-thread/public'
import { handleAnswerTurnRequest } from '@/routes/api.answer.turn'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/testing'
import type { AnswerThreadRecord, AnswerTurnRecord } from '@/modules/answer-thread/public'

describe('POST /api/answer/turn', () => {
  it('rejects empty query bodies', async () => {
    const response = await handleAnswerTurnRequest(
      new Request('https://ae.example/api/answer/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '   ' }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it('validates turn request schema', () => {
    const parsed = answerTurnRequestSchema.safeParse({ query: 'plumber Preston' })
    expect(parsed.success).toBe(true)
  })
})

describe('answer thread in-memory port', () => {
  it('creates threads and appends turns through the test port seam', async () => {
    const threads = new Map<string, AnswerThreadRecord>()
    const turns = new Map<string, AnswerTurnRecord>()

    const reset = setAnswerThreadPortForTests({
      createThread: async (args) => {
        const now = Date.now()
        threads.set(args.threadId, {
          threadId: args.threadId,
          pseudonymousSessionId: args.pseudonymousSessionId,
          title: args.title,
          sharePolicy: 'public',
          createdAt: now,
          updatedAt: now,
        })
        return { threadId: args.threadId }
      },
      appendTurn: async (args) => {
        turns.set(args.turnId, {
          ...args,
          createdAt: Date.now(),
        })
        return { turnId: args.turnId }
      },
      listSessionThreads: async (sessionId) => ({
        threads: [...threads.values()].filter((thread) => thread.pseudonymousSessionId === sessionId),
      }),
      getPublicThreadProjection: async (threadId) => {
        const thread = threads.get(threadId)
        if (thread === undefined) {
          return null
        }
        const { buildPublicThreadProjection } = await import('@/modules/answer-thread/public')
        return buildPublicThreadProjection(
          thread,
          [...turns.values()].filter((turn) => turn.threadId === threadId),
        )
      },
      getThreadTurns: async (threadId) => ({
        turns: [...turns.values()].filter((turn) => turn.threadId === threadId),
      }),
      getAnswerThread: async (threadId) => {
        const thread = threads.get(threadId)
        if (thread === undefined) {
          return null
        }
        return {
          ...thread,
          turnCount: [...turns.values()].filter((turn) => turn.threadId === threadId).length,
        }
      },
    })

    try {
      const { createAnswerThread, appendAnswerTurn, getPublicThreadProjection } = await import(
        '@/modules/answer-thread/answer-thread.functions'
      )

      await createAnswerThread({
        threadId: 'thread-1',
        pseudonymousSessionId: 'session-1',
        title: 'plumber Preston',
      })

      await appendAnswerTurn({
        turnId: 'turn-1',
        threadId: 'thread-1',
        pseudonymousSessionId: 'session-1',
        seq: 1,
        query: 'plumber Preston',
        intent: 'refine_search',
        evidenceJson: JSON.stringify({ providers: [], allowedSlugs: [], agentJsonUrl: '/api/businesses/search?q=plumber' }),
        snapshotHash: 'hash-1',
        proseJson: JSON.stringify({ oneLine: 'Test', summary: 'Summary', nextStep: 'Next' }),
        artifactKindsJson: '[]',
        status: 'complete',
      })

      const projection = await getPublicThreadProjection('thread-1')
      expect(projection?.turns).toHaveLength(1)
      expect(projection?.turns[0]?.query).toBe('plumber Preston')
    } finally {
      reset()
    }
  })
})

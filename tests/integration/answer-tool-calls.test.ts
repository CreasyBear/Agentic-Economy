import { afterEach, describe, expect, it } from 'vitest'

import {
  appendAnswerToolCalls,
  buildPublicThreadProjection,
  readTurnToolCalls,
  setAnswerThreadPortForTests,
  setAnswerToolCallPortForTests,
  type AnswerThreadRecord,
  type AnswerToolCallRecord,
  type AnswerTurnRecord,
} from '@/modules/answer-thread/public'

describe('answerToolCalls persistence', () => {
  let resetThreadPort: () => void
  let resetToolCallPort: () => void

  afterEach(() => {
    resetToolCallPort()
    resetThreadPort()
  })

  it('buffers tool-call records in memory and persists them with the turn', async () => {
    const threads = new Map<string, AnswerThreadRecord>()
    const turns = new Map<string, AnswerTurnRecord>()
    const toolCalls = new Map<string, AnswerToolCallRecord>()

    resetThreadPort = setAnswerThreadPortForTests({
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
        turns.set(args.turnId, { ...args, createdAt: Date.now() })
        return { turnId: args.turnId }
      },
      listSessionThreads: async () => ({ threads: [] }),
      getPublicThreadProjection: async (threadId) => {
        const thread = threads.get(threadId)
        if (thread === undefined) {
          return null
        }
        return buildPublicThreadProjection(
          thread,
          [...turns.values()].filter((turn) => turn.threadId === threadId),
        )
      },
      getThreadTurns: async (threadId) => ({
        turns: [...turns.values()].filter((turn) => turn.threadId === threadId),
      }),
    })

    resetToolCallPort = setAnswerToolCallPortForTests({
      appendToolCalls: async (args) => {
        for (const call of args.toolCalls) {
          toolCalls.set(call.toolCallId, {
            ...call,
            turnId: args.turnId,
            createdAt: Date.now(),
          })
        }
        return { inserted: args.toolCalls.length }
      },
      readTurnToolCalls: async (turnId) => ({
        toolCalls: [...toolCalls.values()]
          .filter((call) => call.turnId === turnId)
          .sort((a, b) => a.seq - b.seq),
      }),
    })

    const threadId = 'thread-tool-1'
    const turnId = 'turn-tool-1'

    // Orchestrator pattern: create thread, append turn, then flush buffered tool calls.
    await createThread(threadId, 'session-1', 'after hours plumber Preston')
    await appendTurn(turnId, threadId, 'session-1')
    const buffered: AnswerToolCallRecord[] = [
      buildToolCall('tc-1', turnId, 1, 'registry.search', ['parramatta-emergency-plumbing'], 1),
      buildToolCall('tc-2', turnId, 2, 'registry.detail', ['parramatta-emergency-plumbing'], 1),
    ]
    await appendAnswerToolCalls({
      turnId,
      toolCalls: buffered.map((record) => ({
        toolCallId: record.toolCallId,
        seq: record.seq,
        toolId: record.toolId,
        inputJson: record.inputJson,
        resultSummaryJson: record.resultSummaryJson,
        resultHash: record.resultHash,
        status: record.status,
      })),
    })

    const stored = await readTurnToolCalls(turnId)
    expect(stored.toolCalls.map((call) => call.toolCallId)).toEqual(['tc-1', 'tc-2'])
    expect(stored.toolCalls[0]?.toolId).toBe('registry.search')
  })

  it('keeps tool-call evidence out of the public thread projection', async () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-share-1',
      pseudonymousSessionId: 'session-1',
      title: 'after hours plumber Preston',
      sharePolicy: 'public',
      createdAt: 1_000,
      updatedAt: 2_000,
    }
    const turn: AnswerTurnRecord = {
      turnId: 'turn-share-1',
      threadId: 'thread-share-1',
      seq: 1,
      query: 'after hours plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify({
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '/api/businesses/search?q=plumber',
        toolCalls: [buildToolCall('tc-1', 'turn-share-1', 1, 'registry.search', [], 0)],
      }),
      snapshotHash: 'hash-1',
      proseJson: JSON.stringify({ oneLine: 'Honest copy', summary: 'Summary', nextStep: 'Next' }),
      artifactKindsJson: '[]',
      status: 'complete',
      createdAt: 1_500,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const serialized = JSON.stringify(projection)

    // Artifacts + query text only — no raw prompts, gate logs, or tool traces.
    expect(serialized).not.toMatch(/toolCalls|resultSummaryJson|inputJson|resultHash/)
    expect(projection.turns[0]?.query).toBe('after hours plumber Preston')
    expect(projection.turns[0]?.oneLine).toBe('Honest copy')
  })
})

async function createThread(threadId: string, sessionId: string, title: string): Promise<void> {
  const { createAnswerThread } = await import('@/modules/answer-thread/answer-thread.functions')
  await createAnswerThread({ threadId, pseudonymousSessionId: sessionId, title })
}

async function appendTurn(turnId: string, threadId: string, sessionId: string): Promise<void> {
  const { appendAnswerTurn } = await import('@/modules/answer-thread/answer-thread.functions')
  await appendAnswerTurn({
    turnId,
    threadId,
    pseudonymousSessionId: sessionId,
    seq: 1,
    query: 'after hours plumber Preston',
    intent: 'refine_search',
    evidenceJson: JSON.stringify({
      providers: [],
      allowedSlugs: [],
      agentJsonUrl: '/api/businesses/search?q=plumber',
    }),
    snapshotHash: 'hash-1',
    proseJson: JSON.stringify({ oneLine: 'Honest copy', summary: 'Summary', nextStep: 'Next' }),
    artifactKindsJson: '[]',
    status: 'complete',
  })
}

function buildToolCall(
  toolCallId: string,
  turnId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  slugs: readonly string[],
  count: number,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId,
    seq,
    toolId,
    inputJson: JSON.stringify({ query: 'parramatta' }),
    resultSummaryJson: JSON.stringify({ slugs, count }),
    resultHash: 'hash:tool',
    status: 'complete',
    createdAt: 1_000,
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/answer/server', () => ({
  isAnswerToolUseAgentError: () => false,
  runAnswerToolUseAgent: vi.fn(async (input: { query: string }) => {
    const prose = {
      oneLine: 'No live operation was selected.',
      summary: 'The request needs an explicit operation selection.',
      nextStep: 'Choose one of the listed operations.',
    }
    return {
      prose,
      providers: [],
      allowedSlugs: new Set<string>(),
      toolCalls: [],
      modelRequests: [],
      timings: [],
      snapshot: {
        query: input.query,
        ...prose,
        providers: [],
        agentJsonUrl: '',
      },
      gate: { ok: true },
    }
  }),
}))

import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { answerTurnRequestDigest, answerTurnReservationKey, streamAnswerTurn } from '@/modules/answer-thread/server'
import { reserveAnswerTurn } from '@/modules/answer-thread/answer-thread.functions'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../../helpers/answer-thread-test-port'
import { parseAnswerOperationSelectionRecognition } from '@/modules/answer-thread/internal/turn-digests'

const SESSION_ID = 'structured-selection-session'
const THREAD_ID = 'structured-selection-thread'
function source() {
  return {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
  } satisfies KeylessExecutableSourcePort
}

async function runTurn(query: string, keylessExecutableSource: KeylessExecutableSourcePort) {
  const store = createAnswerThreadTestStore()
  store.threads.set(THREAD_ID, {
    threadId: THREAD_ID,
    pseudonymousSessionId: SESSION_ID,
    title: 'structured selection',
    createdAt: 1,
    updatedAt: 1,
  })
  const restorePort = installAnswerThreadTestPort(store)
  const requestDigest = answerTurnRequestDigest({ threadId: THREAD_ID, query })
  const admission = await reserveAnswerTurn({
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    query,
    requestDigest,
    reservationKey: answerTurnReservationKey({
      sessionId: SESSION_ID,
      threadScope: THREAD_ID,
      clientTurnKey: `structured:${crypto.randomUUID()}`,
    }),
    title: 'structured selection',
  })
  if (admission.kind !== 'reserved') throw new Error(`unexpected admission: ${admission.kind}`)
  const events: unknown[] = []
  try {
    await streamAnswerTurn({
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      query,
      requestDigest,
      admission,
      keylessExecutableSource,
      preloadedPriorTurns: [],
      querySafetyClassifier: async () => ({
        kind: 'allowed',
        modelRequest: { status: 'ok', durationMs: 0 },
      }),
    }, ({ event }) => events.push(event))
  } finally {
    restorePort()
  }
  return events
}

describe('answer turn structured selection gate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['malformed closing brace', '{"operationRef":"operation:v1:' + 'a'.repeat(64) + '","input":{},"candidateSetDigest":"sha256:' + 'b'.repeat(64) + '"'],
    ['wrong schema', JSON.stringify({ operationRef: `operation:v1:${'a'.repeat(64)}`, input: [], candidateSetDigest: `sha256:${'b'.repeat(64)}` })],
    ['oversized envelope', JSON.stringify({ operationRef: `operation:v1:${'a'.repeat(64)}`, input: { value: 'x'.repeat(256 * 1024) }, candidateSetDigest: `sha256:${'b'.repeat(64)}` })],
    ['oversized envelope with selection fields after the bound', `{"padding":"${'x'.repeat(256 * 1024)}","operationRef":"operation:v1:${'a'.repeat(64)}","input":{},"candidateSetDigest":"sha256:${'b'.repeat(64)}"}`],
  ])('does not search or execute for %s', async (_label, query) => {
    const executableSource = source()
    await runTurn(query, executableSource)
    expect(parseAnswerOperationSelectionRecognition(query).kind).toBe('invalid')
    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
  })

  it('does not search or execute for a valid reordered envelope without frozen candidates', async () => {
    const query = JSON.stringify({
      candidateSetDigest: `sha256:${'b'.repeat(64)}`,
      input: { value: 'Darwin' },
      operationRef: `operation:v1:${'a'.repeat(64)}`,
    })
    const executableSource = source()
    await runTurn(query, executableSource)
    expect(parseAnswerOperationSelectionRecognition(query).kind).toBe('valid')
    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
  })

  it('keeps ordinary natural language on the discovery path', async () => {
    const query = 'weather in Darwin'
    const executableSource = source()
    await runTurn(query, executableSource)
    expect(parseAnswerOperationSelectionRecognition(query)).toEqual({ kind: 'absent' })
    expect(executableSource.search).toHaveBeenCalledTimes(1)
  })
})

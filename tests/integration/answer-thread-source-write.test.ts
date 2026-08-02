import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
} from '@/modules/security/source-write-admission'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { convexModules as modules } from '../helpers/convex-fixtures'

const SOURCE_WRITE_SECRET = 'answer-thread-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/answer/turn',
  bodyDigest: sourceWriteBodyDigest(undefined),
}
function currentEvidenceJson(snapshotHash: string): string {
  const draft: FrozenTurnEvidenceDraft = {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '',
    toolCalls: [],
    timings: [],
    workLog: [],
  }
  return JSON.stringify({
    ...draft,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash,
      evidence: draft,
    }),
  })
}


describe('answer thread source-write admission', () => {
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSecret
  })

  it('red-covers the app/Convex env mismatch before proving durable resume', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-local-source-write'
    const sessionId = 'session-local-source-write'
    const createOperationKey = `answer_thread:create:${threadId}`

    delete process.env.AE_SOURCE_WRITE_SECRET
    await expect(backend.mutation(api.answerThreads.createAnswerThread, {
      threadId,
      pseudonymousSessionId: sessionId,
      title: 'local source-write repro',
      operationKey: createOperationKey,
      correlationId: 'answer-thread:local-source-write',
      sourceWrite: createAdmission(createOperationKey, 'answer-thread:local-source-write', 'nonce-create-mismatch'),
    })).rejects.toThrow('answer_thread_source_write_rejected:missing_source_write_secret')

    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    await expect(backend.mutation(api.answerThreads.createAnswerThread, {
      threadId,
      pseudonymousSessionId: sessionId,
      title: 'local source-write repro',
      operationKey: createOperationKey,
      correlationId: 'answer-thread:local-source-write',
      sourceWrite: createAdmission(createOperationKey, 'answer-thread:local-source-write', 'nonce-create'),
    })).resolves.toEqual({ threadId })

    await assertDurableResume(backend, { threadId, sessionId })
  })

  async function assertDurableResume(
    backend: TestConvex<typeof schema>,
    input: { threadId: string; sessionId: string },
  ) {
    const firstTurn = await appendTurn(backend, {
      threadId: input.threadId,
      sessionId: input.sessionId,
      turnId: 'turn-local-source-write-1',
      seq: 1,
      operationKey: 'answer_thread:append:turn-local-source-write-1',
      nonce: 'nonce-append-1',
    })
    expect(firstTurn).toEqual({ turnId: 'turn-local-source-write-1' })

    const resumed = await backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId: input.threadId,
      pseudonymousSessionId: input.sessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })
    expect(resumed).toMatchObject({
      thread: {
        threadId: input.threadId,
        pseudonymousSessionId: input.sessionId,
        turnCount: 1,
      },
      turns: {
        page: [{ turnId: 'turn-local-source-write-1', seq: 1, status: 'complete' }],
      },
    })

    const secondTurn = await appendTurn(backend, {
      threadId: input.threadId,
      sessionId: input.sessionId,
      turnId: 'turn-local-source-write-2',
      seq: 2,
      operationKey: 'answer_thread:append:turn-local-source-write-2',
      nonce: 'nonce-append-2',
    })
    expect(secondTurn).toEqual({ turnId: 'turn-local-source-write-2' })

    await expect(backend.query(api.answerThreads.getThreadTurns, {
      threadId: input.threadId,
      pseudonymousSessionId: input.sessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({
      page: [
        { turnId: 'turn-local-source-write-1', seq: 1 },
        { turnId: 'turn-local-source-write-2', seq: 2 },
      ],
    })
  }
  it('denies foreign sessions across raw thread, turn, and tool-call reads', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-raw-read-ownership'
    const turnId = 'turn-raw-read-ownership'
    const ownerSessionId = 'session-raw-read-owner'
    const foreignSessionId = 'session-raw-read-foreign'

    process.env.AE_SOURCE_WRITE_SECRET = SOURCE_WRITE_SECRET
    const createOperationKey = `answer_thread:create:${threadId}`
    await expect(backend.mutation(api.answerThreads.createAnswerThread, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
      title: 'raw read ownership',
      operationKey: createOperationKey,
      correlationId: createOperationKey,
      sourceWrite: createAdmission(createOperationKey, createOperationKey, 'nonce-raw-read-create'),
    })).resolves.toEqual({ threadId })

    await appendTurn(backend, {
      threadId,
      sessionId: ownerSessionId,
      turnId,
      seq: 1,
      operationKey: `answer_thread:append:${turnId}`,
      nonce: 'nonce-raw-read-append',
    })

    const toolCallOperationKey = `answer_thread:append_tool_calls:${turnId}`
    await expect(backend.mutation(api.answerThreads.appendAnswerToolCalls, {
      turnId,
      toolCalls: [{
        toolCallId: 'tool-call-raw-read-ownership',
        seq: 1,
        toolId: 'registry.search',
        inputJson: '{"query":"raw read ownership"}',
        resultSummaryJson: '{"count":1}',
        resultJson: '{"items":["raw-read-ownership"]}',
        resultHash: 'hash-tool-call-raw-read-ownership',
        status: 'complete',
      }],
      operationKey: toolCallOperationKey,
      correlationId: toolCallOperationKey,
      sourceWrite: createAdmission(toolCallOperationKey, toolCallOperationKey, 'nonce-raw-read-tool-call'),
    })).resolves.toEqual({ inserted: 1 })
    await expect(backend.query(api.answerThreads.getAnswerThread, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
    })).resolves.toMatchObject({ threadId, turnCount: 1 })
    await expect(backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({ thread: { threadId }, turns: { page: [{ turnId }] } })
    await expect(backend.query(api.answerThreads.getThreadTurns, {
      threadId,
      pseudonymousSessionId: ownerSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({ page: [{ turnId }] })
    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId,
      pseudonymousSessionId: ownerSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toMatchObject({ page: [{ toolCallId: 'tool-call-raw-read-ownership' }] })

    await expect(backend.query(api.answerThreads.getAnswerThread, {
      threadId,
      pseudonymousSessionId: foreignSessionId,
    })).resolves.toBeNull()
    await expect(backend.query(api.answerThreads.getAnswerThreadWithTurns, {
      threadId,
      pseudonymousSessionId: foreignSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toBeNull()
    await expect(backend.query(api.answerThreads.getThreadTurns, {
      threadId,
      pseudonymousSessionId: foreignSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toEqual({ page: [], isDone: true, continueCursor: '' })
    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId,
      pseudonymousSessionId: foreignSessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).resolves.toEqual({ page: [], isDone: true, continueCursor: '' })

  })
  it('refuses legacy tool-call rows without result JSON instead of pairing an unverifiable hash', async () => {
    const backend = convexTest(schema, modules)
    const threadId = 'thread-legacy-tool-result'
    const turnId = 'turn-legacy-tool-result'
    const sessionId = 'session-legacy-tool-result'
    const legacySummary = '{"slugs":["legacy-plumber"],"count":1}'
    const currentResult = '{"kind":"ok","items":[{"slug":"current-plumber"}]}'

    await backend.run(async (ctx) => {
      await ctx.db.insert('answerThreads', {
        threadId,
        pseudonymousSessionId: sessionId,
        title: 'legacy tool result',
        sharePolicy: 'public',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('answerTurns', {
        turnId,
        threadId,
        seq: 1,
        query: 'legacy tool result',
        intent: 'refine_search',
        evidenceJson: '{}',
        snapshotHash: 'snapshot-legacy-tool-result',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 1,
      })
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-legacy-result',
        turnId,
        seq: 1,
        toolId: 'registry.search',
        inputJson: '{"query":"legacy plumber"}',
        resultSummaryJson: legacySummary,
        resultHash: 'hash-legacy-result',
        status: 'complete',
        createdAt: 1,
      })
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-current-result',
        turnId,
        seq: 2,
        toolId: 'registry.search',
        inputJson: '{"query":"current plumber"}',
        resultSummaryJson: '{"slugs":["current-plumber"],"count":1}',
        resultJson: currentResult,
        resultHash: 'hash-current-result',
        status: 'complete',
        createdAt: 1,
      })
    })

    await expect(backend.query(api.answerThreads.readTurnToolCalls, {
      turnId,
      pseudonymousSessionId: sessionId,
      paginationOpts: { cursor: null, numItems: 25 },
    })).rejects.toThrow('answer_tool_result_missing')
  })

  it('rejects malformed result payloads instead of admitting broad legacy shapes', async () => {
    const backend = convexTest(schema, modules)

    await expect(backend.run(async (ctx) => {
      await ctx.db.insert('answerToolCalls', {
        toolCallId: 'tool-call-malformed-result',
        turnId: 'turn-malformed-result',
        seq: 1,
        toolId: 'registry.search',
        inputJson: '{}',
        resultSummaryJson: '{}',
        resultJson: 42 as never,
        resultHash: 'hash-malformed-result',
        status: 'complete',
        createdAt: 1,
      })
    })).rejects.toThrow('Expected `string`')
  })
})

async function appendTurn(
  backend: TestConvex<typeof schema>,
  input: {
    threadId: string
    sessionId: string
    turnId: string
    seq: number
    operationKey: string
    nonce: string
  },
) {
  return backend.mutation(api.answerThreads.appendAnswerTurn, {
    turnId: input.turnId,
    threadId: input.threadId,
    pseudonymousSessionId: input.sessionId,
    seq: input.seq,
    query: `local source-write query ${input.seq}`,
    intent: 'refine_search',
    evidenceJson: currentEvidenceJson(`snapshot-${input.seq}`),
    snapshotHash: `snapshot-${input.seq}`,
    proseJson: '{}',
    artifactKindsJson: '[]',
    status: 'complete',
    operationKey: input.operationKey,
    correlationId: `answer-thread:local-source-write:${input.seq}`,
    sourceWrite: createAdmission(
      input.operationKey,
      `answer-thread:local-source-write:${input.seq}`,
      input.nonce,
    ),
  })
}

function createAdmission(operationKey: string, correlationId: string, nonce: string) {
  return createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
    request: SOURCE_REQUEST,
    scope: 'answer_thread',
    operationKey,
    correlationId,
    nonce,
  })
}

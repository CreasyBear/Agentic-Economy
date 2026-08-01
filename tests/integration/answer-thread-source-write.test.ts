import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
} from '@/modules/security/source-write-admission'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, load]) => [path.replace('../../convex/', './'), load]),
)

const SOURCE_WRITE_SECRET = 'answer-thread-local-source-write-secret'
const SOURCE_REQUEST = {
  method: 'POST',
  origin: 'http://127.0.0.1:3024',
  pathname: '/api/answer/turn',
  bodyDigest: sourceWriteBodyDigest(undefined),
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

    const resumed = await backend.query(api.answerThreads.getAnswerThreadWithTurns, { threadId: input.threadId })
    expect(resumed).toMatchObject({
      threadId: input.threadId,
      pseudonymousSessionId: input.sessionId,
      turnCount: 1,
      turns: [{ turnId: 'turn-local-source-write-1', seq: 1, status: 'complete' }],
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

    await expect(backend.query(api.answerThreads.getThreadTurns, { threadId: input.threadId })).resolves.toMatchObject({
      turns: [
        { turnId: 'turn-local-source-write-1', seq: 1 },
        { turnId: 'turn-local-source-write-2', seq: 2 },
      ],
    })
  }
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
    evidenceJson: '{}',
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

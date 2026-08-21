import type { TestConvex } from 'convex-test'
import type { FunctionReturnType } from 'convex/server'
import { afterEach, expect } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import {
  parsePublicThreadProjection,
  type PublicThreadProjection,
} from '@/modules/answer-thread/public'
import { answerTurnFinalizationDigest } from '@/modules/answer-thread/internal/turn-digests'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'
import {
  createSourceWriteAdmission,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

export const SOURCE_REQUEST = {
  method: 'POST',
  initiatorOrigin: 'http://127.0.0.1:3024',
  targetOrigin: 'http://127.0.0.1:3024',
  targetPath: '/api/answer/turn',
  targetQuery: '',
} as const
export const SOURCE_WRITE_SECRET = 'source-write-test-secret-32-byte-key-material'
export type OwnedThreadProjection = PublicThreadProjection
export type OwnedThreadTurn = OwnedThreadProjection['turns'][number]
export type ReserveAnswerTurnResult = FunctionReturnType<typeof api.answerThreads.reserveAnswerTurn>
export type AnswerThreadSourceWriteBackend = TestConvex<typeof schema>

export function decodeThreadProjection(encoded: string | null): PublicThreadProjection | null {
  if (encoded === null) return null
  const projection = parsePublicThreadProjection(JSON.parse(encoded))
  if (projection === null) throw new Error('answer_thread_projection_invalid')
  return projection
}

export function currentEvidenceJson(snapshotHash: string): string {
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

export function restoreSourceWriteEnvAfterEach(): void {
  const previousSecret = process.env.AE_SOURCE_WRITE_SECRET
  const previousShareSecret = process.env.AE_ANSWER_THREAD_SHARE_SECRET
  const previousShareKeyId = process.env.AE_ANSWER_THREAD_SHARE_KEY_ID

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AE_SOURCE_WRITE_SECRET
    else process.env.AE_SOURCE_WRITE_SECRET = previousSecret
    if (previousShareSecret === undefined) delete process.env.AE_ANSWER_THREAD_SHARE_SECRET
    else process.env.AE_ANSWER_THREAD_SHARE_SECRET = previousShareSecret
    if (previousShareKeyId === undefined) delete process.env.AE_ANSWER_THREAD_SHARE_KEY_ID
    else process.env.AE_ANSWER_THREAD_SHARE_KEY_ID = previousShareKeyId
  })
}

export async function reserveTurn(
  backend: AnswerThreadSourceWriteBackend,
  input: {
    threadId?: string
    sessionId: string
    reservationKey: string
    requestDigest: string
    operationKey: string
    nonce: string
  },
): Promise<ReserveAnswerTurnResult> {
  return backend.mutation(api.answerThreads.reserveAnswerTurn, await admitted({
    sessionId: input.sessionId,
    requestedThreadScope: input.threadId ?? 'new',
    query: `local source-write query ${input.reservationKey}`,
    requestDigest: input.requestDigest,
    reservationKey: input.reservationKey,
    title: 'local source-write repro',
    operationKey: input.operationKey,
    correlationId: input.operationKey,
  }, input.nonce))
}

export async function persistTurn(
  backend: AnswerThreadSourceWriteBackend,
  input: {
    reservationKey: string
    requestDigest: string
    sessionId: string
    threadId: string
    turnId: string
    turnSeq: number
    seq: number
    operationKey: string
    nonce: string
    toolCalls?: readonly {
      toolCallId: string
      seq: number
      toolId: 'registry.search'
      inputJson: string
      resultSummaryJson: string
      resultJson: string
      resultHash: string
      status: 'complete'
      createdAt?: number
    }[]
    finalize?: boolean
  },
) {
  const snapshotHash = `snapshot-${input.seq}`
  const evidenceJson = currentEvidenceJson(snapshotHash)
  const query = `local source-write query ${input.reservationKey}`
  const proseJson = '{}'
  const artifactKindsJson = '[]'
  const createdAt = 1
  const toolCalls = input.toolCalls?.map((call) => ({ ...call, createdAt: call.createdAt ?? createdAt })) ?? []
  const answerDigest = answerTurnFinalizationDigest({
    expectedGeneration: 0,
    turn: {
      turnId: input.turnId,
      threadId: input.threadId,
      seq: input.turnSeq,
      query,
      intent: 'refine_search',
      evidenceJson,
      snapshotHash,
      proseJson,
      artifactKindsJson,
      status: 'complete',
      createdAt,
    },
    toolCalls,
  })
  if (input.finalize === false) return

  const finalizationOperationKey = `harness_session:finalize:${input.turnId}`
  await expect(backend.mutation(api.harnessSessions.finalizeReservedAnswerTurn, await admitted({
    reservationKey: input.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
    expectedGeneration: 0,
    createdAt,
    answerDigest,
    query,
    intent: 'refine_search',
    finalStatus: 'complete',
    snapshotHash,
    evidenceJson,
    proseJson,
    artifactKindsJson,
    finalizationHash: `finalization-${input.turnId}`,
    toolCalls,
    operationKey: finalizationOperationKey,
    correlationId: finalizationOperationKey,
    entries: [],
  }, `${input.nonce}-finalize`, 'harness_session'))).resolves.toMatchObject({
    status: 'accepted',
    turnId: input.turnId,
  })
}

export function finalizationEntry(input: {
  entryId: string
  sessionId: string
  runId: string
  turnId: string
}): AppendHarnessSessionEntrySourceInput {
  return {
    ownerKey: `owner:${input.sessionId}`,
    entryId: input.entryId,
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId,
    kind: 'turn.completed',
    createdAt: 1,
    payloadJson: '{}',
  }
}

export async function finalizeHarnessRun(
  backend: AnswerThreadSourceWriteBackend,
  input: {
    reservationKey: string
    requestDigest: string
    sessionId: string
    threadId: string
    turnId: string
    turnSeq: number
    seq: number
    entries: readonly AppendHarnessSessionEntrySourceInput[]
  },
  nonce = `${input.turnId}-finalize`,
) {
  const operationKey = `harness_session:finalize:${input.turnId}`
  const query = `local source-write query ${input.reservationKey}`
  const snapshotHash = `snapshot-${input.seq}`
  const evidenceJson = currentEvidenceJson(snapshotHash)
  const proseJson = '{}'
  const artifactKindsJson = '[]'
  const answerDigest = answerTurnFinalizationDigest({
    expectedGeneration: 0,
    turn: {
      turnId: input.turnId,
      threadId: input.threadId,
      seq: input.turnSeq,
      query,
      intent: 'refine_search',
      evidenceJson,
      snapshotHash,
      proseJson,
      artifactKindsJson,
      status: 'complete',
      createdAt: 1,
    },
    toolCalls: [],
  })
  return backend.mutation(api.harnessSessions.finalizeReservedAnswerTurn, await admitted({
    reservationKey: input.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
    expectedGeneration: 0,
    createdAt: 1,
    answerDigest,
    query,
    intent: 'refine_search',
    finalStatus: 'complete',
    snapshotHash,
    evidenceJson,
    proseJson,
    artifactKindsJson,
    finalizationHash: `finalization-${input.turnId}`,
    toolCalls: [],
    operationKey,
    correlationId: operationKey,
    entries: [...input.entries],
  }, nonce, 'harness_session'))
}

type SourceWriteCommand = {
  operationKey: string
  correlationId: string
  [key: string]: unknown
}

export async function admitted<T extends SourceWriteCommand>(
  command: T,
  nonce: string,
  scope: 'answer_thread' | 'harness_session' = 'answer_thread',
) {
  const sourceWriteRequest: SourceWriteAdmissionRequest = {
    ...SOURCE_REQUEST,
    bodyDigest: sourceWriteCommandBodyDigest(command),
  }
  return {
    ...command,
    sourceWriteRequest,
    sourceWrite: await createSourceWriteAdmission({
      env: { AE_SOURCE_WRITE_SECRET: SOURCE_WRITE_SECRET },
      request: sourceWriteRequest,
      scope,
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
      nonce,
    }),
  }
}

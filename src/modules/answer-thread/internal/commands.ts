import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

import type {
  AnswerToolCallRecord,
  AnswerToolCallStatus,
  AnswerToolId,
} from '../answer-thread.schema'

/**
 * Tool-call persistence for answer turns.
 *
 * `answerToolCalls` rows are persisted alongside the owning `answerTurns` row
 * before the turn orchestrator emits a terminal `complete` event - never
 * mid-stream. The orchestrator buffers `AnswerToolCallRecord[]` in memory
 * during the agent loop and fails closed if complete-turn evidence cannot be
 * persisted.
 */

export type AnswerToolCallInputRow = {
  toolCallId: string
  seq: number
  toolId: AnswerToolId
  inputJson: string
  resultSummaryJson: string
  resultJson: string
  resultHash: string
  status: AnswerToolCallStatus
}

type AnswerToolCallSourceWriteMutationArgs = {
  operationKey?: string
  correlationId?: string
  sourceWrite?: SourceWriteAdmission
}

export type AppendAnswerToolCallsArgs = {
  turnId: string
  toolCalls: readonly AnswerToolCallInputRow[]
  sourceWriteRequest?: Request
}

type AppendAnswerToolCallsMutationArgs =
  Omit<AppendAnswerToolCallsArgs, 'sourceWriteRequest'> & AnswerToolCallSourceWriteMutationArgs

export type ReadTurnToolCallsResult = {
  toolCalls: readonly AnswerToolCallRecord[]
}

const appendAnswerToolCallsMutation = sourceMutation<AppendAnswerToolCallsMutationArgs, { inserted: number }>(
  'answerThreads:appendAnswerToolCalls',
)

const readTurnToolCallsQuery = sourceQuery<{ turnId: string }, ReadTurnToolCallsResult>(
  'answerThreads:readTurnToolCalls',
)

type AnswerToolCallPort = {
  appendToolCalls(args: AppendAnswerToolCallsArgs): Promise<{ inserted: number }>
  readTurnToolCalls(turnId: string): Promise<ReadTurnToolCallsResult>
}

let testPort: AnswerToolCallPort | undefined

export function setAnswerToolCallPortForTests(port: AnswerToolCallPort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export async function appendAnswerToolCalls(
  args: AppendAnswerToolCallsArgs,
): Promise<{ inserted: number }> {
  if (testPort !== undefined) {
    return testPort.appendToolCalls(args)
  }
  return callPublicSourceMutation(
    appendAnswerToolCallsMutation,
    await withAnswerToolCallSourceWrite(args),
  )
}

export async function readTurnToolCalls(turnId: string): Promise<ReadTurnToolCallsResult> {
  if (testPort !== undefined) {
    return testPort.readTurnToolCalls(turnId)
  }
  return callPublicSourceQuery(readTurnToolCallsQuery, { turnId })
}

async function withAnswerToolCallSourceWrite(
  args: AppendAnswerToolCallsArgs,
): Promise<AppendAnswerToolCallsMutationArgs> {
  const { sourceWriteRequest, ...serializableArgs } = args
  if (sourceWriteRequest === undefined) {
    return serializableArgs
  }
  const operationKey = `answer_thread:append_tool_calls:${args.turnId}`
  const correlationId = operationKey
  return {
    ...serializableArgs,
    operationKey,
    correlationId,
    sourceWrite: await sourceWriteAdmissionFromRequest({
      request: sourceWriteRequest,
      scope: 'answer_thread',
      operationKey,
      correlationId,
    }),
  }
}

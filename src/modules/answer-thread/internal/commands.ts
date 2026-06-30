import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

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
  resultHash: string
  status: AnswerToolCallStatus
}

export type AppendAnswerToolCallsArgs = {
  turnId: string
  toolCalls: readonly AnswerToolCallInputRow[]
}

export type ReadTurnToolCallsResult = {
  toolCalls: readonly AnswerToolCallRecord[]
}

export const appendAnswerToolCallsMutation = sourceMutation<AppendAnswerToolCallsArgs, { inserted: number }>(
  'answerThreads:appendAnswerToolCalls',
)

export const readTurnToolCallsQuery = sourceQuery<{ turnId: string }, ReadTurnToolCallsResult>(
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
  return callPublicSourceMutation(appendAnswerToolCallsMutation, args)
}

export async function readTurnToolCalls(turnId: string): Promise<ReadTurnToolCallsResult> {
  if (testPort !== undefined) {
    return testPort.readTurnToolCalls(turnId)
  }
  return callPublicSourceQuery(readTurnToolCallsQuery, { turnId })
}

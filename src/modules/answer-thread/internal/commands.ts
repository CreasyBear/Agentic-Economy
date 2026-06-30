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
 * in the turn orchestrator's best-effort `persistTurnBestEffort` step - never
 * mid-stream. This avoids orphaned tool-call rows referencing a `turnId` whose
 * parent turn never landed (e.g. when the SSE stream aborts or final persist
 * fails). The orchestrator buffers `AnswerToolCallRecord[]` in memory during
 * the agent loop and flushes them here together with the turn.
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

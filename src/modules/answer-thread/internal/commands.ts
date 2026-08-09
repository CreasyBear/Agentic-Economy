import type { AnswerToolCallStatus, AnswerToolId } from '../answer-thread.schema'

/**
 * Tool-call persistence for answer turns.
 *
 * `answerToolCalls` rows are persisted alongside the owning `answerTurns` row
 * before the turn orchestrator emits a terminal `complete` event - never
 * mid-stream. The orchestrator buffers tool-call records in memory
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


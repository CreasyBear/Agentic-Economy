import { findAction, type AnyAction } from '@/modules/actions'

import {
  AnswerToolIdValues,
  type AnswerToolId,
} from '../answer-thread.schema'

export const ANSWER_READ_TOOL_IDS: readonly AnswerToolId[] = AnswerToolIdValues

const ANSWER_READ_TOOL_ID_LOOKUP = Object.fromEntries(
  ANSWER_READ_TOOL_IDS.map((toolId) => [toolId, true] as const),
) as Record<AnswerToolId, true>

export function isAnswerReadToolId(toolId: string): toolId is AnswerToolId {
  return ANSWER_READ_TOOL_ID_LOOKUP[toolId as AnswerToolId] === true
}

export function findAnswerReadToolAction(toolId: AnswerToolId): AnyAction | undefined {
  const action = findAction(toolId)
  if (action === undefined || !action.readOnly) {
    return undefined
  }
  return action
}

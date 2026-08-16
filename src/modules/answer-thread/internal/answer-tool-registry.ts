import { findAction } from '@/modules/actions'
import type { AnyAction } from '@/modules/common/action'

import {
  ANSWER_READ_TOOL_IDS,
  type AnswerToolId,
} from '../answer-thread.schema'

export function isAnswerReadToolId(toolId: string): toolId is AnswerToolId {
  return ANSWER_READ_TOOL_IDS.some((candidate) => candidate === toolId)
}

export function isAnswerOperationReadToolId(toolId: string): boolean {
  return isAnswerReadToolId(toolId) && toolId.startsWith('registry.operations.')
}

export function findAnswerReadToolAction(toolId: string): AnyAction | undefined {
  if (!isAnswerReadToolId(toolId)) {
    return undefined
  }
  const action = findAction(toolId)
  if (action === undefined || !action.readOnly) {
    return undefined
  }
  return action
}

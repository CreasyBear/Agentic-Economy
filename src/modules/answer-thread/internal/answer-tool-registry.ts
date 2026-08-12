import { registryDetailAction, registrySearchAction } from '@/modules/registry/registry.actions'
import { registryOperationsSearchAction } from '@/modules/registry/operations.actions'
import { webDiscoverAction } from '@/modules/storefront/storefront.actions'
import type { AnyAction } from '@/modules/common/action'

import {
  ANSWER_READ_TOOL_IDS,
  type AnswerToolId,
} from '../answer-thread.schema'

const ANSWER_READ_ACTIONS: readonly AnyAction[] = [
  registrySearchAction,
  registryDetailAction,
  webDiscoverAction,
  registryOperationsSearchAction,
]

export function isAnswerReadToolId(toolId: string): toolId is AnswerToolId {
  return ANSWER_READ_TOOL_IDS.some((candidate) => candidate === toolId)
}

export function findAnswerReadToolAction(toolId: string): AnyAction | undefined {
  const action = ANSWER_READ_ACTIONS.find((candidate) => candidate.id === toolId)
  if (action === undefined || !action.readOnly) {
    return undefined
  }
  return action
}

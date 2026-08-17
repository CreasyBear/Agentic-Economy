import { findAction } from '@/modules/actions'
import type { AnyAction } from '@/modules/common/action'
import type { HarnessToolContract } from '@/modules/harness/public'

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

export function filterAnswerModelToolContracts(
  contracts: readonly HarnessToolContract[],
): readonly HarnessToolContract[] {
  return sortContractsById(
    contracts.filter((contract) =>
      isAnswerReadToolId(contract.id) &&
      contract.exposure.answerModel &&
      contract.policy.tier === 'read',
    ),
    ANSWER_READ_TOOL_IDS,
  )
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


function sortContractsById(
  contracts: readonly HarnessToolContract[],
  ids: readonly string[],
): readonly HarnessToolContract[] {
  const order = new Map(ids.map((id, index) => [id, index]))
  return [...contracts].sort((left, right) => {
    const leftIndex = order.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = order.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex || left.id.localeCompare(right.id)
  })
}
import { isStepCount, type ToolSet } from 'ai'
import {
  answerRouteForbidsTool,
  nextToolLoopStep,
  selectedOperationRefFromCompletedDetail,
  type AnswerOperationNavigationState,
  type AnswerToolLoopStep,
} from './answer-navigation-policy'
import type { EffectiveAnswerAgentRoute } from '../answer-schema'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/tooling'
import { ANSWER_AGENT_MAX_TOOL_CALLS } from './answer-tool-use-agent-types'
import type { AnswerAgentReadToolEntry } from './answer-agent-tools'

export type { AnswerToolLoopStep }

export function loopStepDisablesTools(loopStep: AnswerToolLoopStep): boolean {
  return loopStep.kind === 'prose' || loopStep.activeToolIds.length === 0
}

/**
 * Resolve the next prepareStep / stopWhen decision. Execute is `required`
 * only after `registry.operations.detail` authenticates the selected ordinal.
 * Search evidence does not unlock execute.
 */
export function resolveAnswerToolLoopStep(input: {
  route: EffectiveAnswerAgentRoute | undefined
  toolCalls: readonly AnswerToolCallRecord[]
  navigationState: AnswerOperationNavigationState
  tools: ToolSet
  readToolEntries: readonly AnswerAgentReadToolEntry[]
  navigationBudget: {
    maxNavigationCalls: number
    maxEffectCalls: number
  }
  unsafeOperationOutput: boolean
  toolExecutionError: boolean
}): AnswerToolLoopStep {
  return nextToolLoopStep({
    route: input.route,
    toolCalls: input.toolCalls,
    navigationState: input.navigationState,
    allowedToolIds: input.readToolEntries
      .filter(
        ({ toolId, toolName }) =>
          input.tools[toolName] !== undefined
          && !answerRouteForbidsTool(input.route, toolId),
      )
      .map(({ toolId }) => toolId),
    ...input.navigationBudget,
    unsafeOperationOutput: input.unsafeOperationOutput,
    toolExecutionError: input.toolExecutionError,
    selectedOperationRef: selectedOperationRefFromCompletedDetail(input.toolCalls),
  })
}

export function prepareAnswerToolLoopStep(input: {
  loopStep: AnswerToolLoopStep
  readToolEntries: readonly AnswerAgentReadToolEntry[]
  instructions: string
}): {
  activeTools: string[]
  toolChoice?: 'required' | 'auto' | 'none'
  instructions: string
} {
  if (loopStepDisablesTools(input.loopStep)) {
    return {
      activeTools: [],
      toolChoice: 'none' as const,
      instructions: input.instructions,
    }
  }
  return {
    activeTools: input.readToolEntries
      .filter(({ toolId }) => input.loopStep.activeToolIds.includes(toolId))
      .map(({ toolName }) => toolName),
    ...(input.loopStep.toolChoice === 'auto'
      ? {}
      : { toolChoice: input.loopStep.toolChoice }),
    instructions: input.instructions,
  }
}

export function createAnswerToolLoopStopWhen(
  resolveLoopStep: () => AnswerToolLoopStep,
) {
  const stopAtMaxRounds = isStepCount(ANSWER_AGENT_MAX_TOOL_CALLS)
  return [
    async (event: Parameters<typeof stopAtMaxRounds>[0]) =>
      loopStepDisablesTools(resolveLoopStep())
      || (await stopAtMaxRounds(event)),
  ]
}

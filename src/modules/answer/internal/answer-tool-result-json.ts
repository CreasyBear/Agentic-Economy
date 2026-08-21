import type { RunAnswerToolCallResult } from '@/modules/answer-thread/tooling'
import { sanitizePromptDataString } from './answer-llm-prompts'

export const MAX_MODEL_TOOL_RESULT_BYTES = 64 * 1024

export function modelFacingToolResultJson(
  result: RunAnswerToolCallResult,
): string {
  return result.resultJson
}

export function safeToolResultJsonForPrompt(resultJson: string): string {
  try {
    return (
      JSON.stringify(JSON.parse(resultJson), (_key, value) =>
        typeof value === 'string' ? sanitizePromptDataString(value) : value,
      ) ?? sanitizePromptDataString(resultJson)
    )
  } catch {
    return sanitizePromptDataString(resultJson)
  }
}

export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash'

export type AnswerLlmConfig = {
  apiKey: string
  model: string
  apiBaseUrl?: string
}

export function readAnswerLlmConfig(): AnswerLlmConfig | undefined {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined
  }

  const model = process.env.AE_LLM_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  const apiBaseUrl = process.env.AE_OPENROUTER_API_BASE_URL?.trim()
  return {
    apiKey,
    model,
    ...(apiBaseUrl === undefined || apiBaseUrl.length === 0 ? {} : { apiBaseUrl }),
  }
}

/** Set to 1 in CI after `npm run test:eval` passes. Unlocks LLM follow-up chips. */
export function readAnswerEvalPassed(): boolean {
  return process.env.AE_ANSWER_EVAL_PASSED === '1'
}

export function readLlmFollowUpChipsEnabled(): boolean {
  return readAnswerEvalPassed() && readAnswerLlmConfig() !== undefined
}

/**
 * Phase 7 collapsed the answer path to a single synthesizer mode: the LLM
 * tool-use agent. The deterministic synthesizer and the legacy gated-LLM prose
 * path were deleted in slice 7G after the eval gate went green. The
 * `AE_ANSWER_SYNTHESIZER` env var is accepted for backward compatibility but no
 * longer selects a different path - every answer now flows through the tool-use
 * agent, which requires an `OPENROUTER_API_KEY`. Boundary/unsupported intents
 * answer from `boundary-prose.ts` without a key; search intents without a key
 * emit a safe `answer_turn_failed` error rather than fabricated prose.
 */
export type AnswerSynthesizerMode = 'tool-use'

export function readAnswerSynthesizerMode(): AnswerSynthesizerMode {
  return 'tool-use'
}

/** The tool-use agent is the primary path; it needs OpenRouter configuration. */
export function readToolUseAgentEnabled(): boolean {
  return readAnswerLlmConfig() !== undefined
}

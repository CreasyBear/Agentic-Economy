import { openRouterGatewayConfig } from '@/modules/model-gateway/public'

/** Set to 1 in CI after `npm run test:eval` passes. Unlocks LLM follow-up chips. */
export function readAnswerEvalPassed(): boolean {
  return process.env.AE_ANSWER_EVAL_PASSED === '1'
}

export function readLlmFollowUpChipsEnabled(): boolean {
  return readAnswerEvalPassed() && openRouterGatewayConfig().apiKey !== undefined
}

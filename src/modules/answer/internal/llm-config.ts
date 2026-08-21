/** Set to 1 in CI after `npm run test:eval` passes. */
export function readAnswerEvalPassed(): boolean {
  return process.env.AE_ANSWER_EVAL_PASSED === '1'
}

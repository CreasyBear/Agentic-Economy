/**
 * Dev-only UI flag. Live answer synthesis always streams via `POST /api/answer/turn`.
 *
 * `structured`: richer thinking trace + dev model selector wrapper; does not switch the API.
 */
export function isStructuredAnswerModeEnabled(): boolean {
  return import.meta.env.VITE_AE_ANSWER_MODE === 'structured'
}

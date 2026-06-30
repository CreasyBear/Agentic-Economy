/**
 * Dev-only UI flags. Live answer synthesis always streams via `POST /api/answer/turn`.
 *
 * `structured`: richer thinking trace + dev model selector wrapper; does not switch the API.
 * `openui`: reserved for experimental OpenUI Lang layout (same server contract).
 */
export function isStructuredAnswerModeEnabled(): boolean {
  return import.meta.env.VITE_AE_ANSWER_MODE === 'structured'
}

/** Feature flag for OpenUI Lang renderer path. Requires structured mode + lazy library load. */
export function isOpenUiAnswerModeEnabled(): boolean {
  return import.meta.env.VITE_AE_ANSWER_MODE === 'openui'
}

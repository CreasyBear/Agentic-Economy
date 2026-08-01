export const MAX_ACTIONS_PER_TURN = 4
export const MAX_MODEL_CALLS_PER_TURN = MAX_ACTIONS_PER_TURN + 2
export const TURN_COST_CEILING_USD = 0.06
export const WORST_CASE_MODEL_CALL_RESERVE_USD = TURN_COST_CEILING_USD / MAX_MODEL_CALLS_PER_TURN

/**
 * Whole-role ceiling across every model fallback and repair attempt. Sized to
 * seat both configured models with one repair pass each (measured 8.7s and
 * 27.4s per attempt), and still finish inside the 69-132s per-answer latency
 * observed from comparable consumer assistants.
 */
export const ROLE_TIMEOUT_MS = {
  proposal: 80_000,
} as const

export type RouteAttemptState =
  | 'queued'
  | 'dispatched'
  | 'accepted'
  | 'succeeded'
  | 'failed'
  | 'outcome_unknown'
  | 'cancelled'

export type ExportedStepState =
  | 'queued'
  | 'ready_to_contact'
  | 'contacting'
  | 'awaiting_result'
  | 'completed'
  | 'failed'
  | 'outcome_unknown'
  | 'cancelled'

export function exportState(state: RouteAttemptState): ExportedStepState {
  if (state === 'dispatched') return 'contacting'
  if (state === 'accepted') return 'awaiting_result'
  if (state === 'succeeded') return 'completed'
  return state
}

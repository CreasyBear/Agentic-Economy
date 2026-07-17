export type RouteAttemptState =
  | 'queued'
  | 'leased'
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
  if (state === 'leased') return 'ready_to_contact'
  if (state === 'dispatched') return 'contacting'
  if (state === 'accepted') return 'awaiting_result'
  if (state === 'succeeded') return 'completed'
  return state
}

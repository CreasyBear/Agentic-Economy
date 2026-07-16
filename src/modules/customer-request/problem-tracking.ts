export const PROBLEM_STATUS_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1_000

export type CustomerRequestProblemTracking = Readonly<{
  state: 'received' | 'update_due'
  nextAction: 'await_status_update' | 'check_status'
  nextActor: 'ae'
  nextUpdateDueAt: number
  decisionAuthority: 'not_assigned'
}>

export function projectCustomerRequestProblemTracking(
  reportedAt: number,
  observedAt: number,
): CustomerRequestProblemTracking {
  const nextUpdateDueAt = reportedAt + PROBLEM_STATUS_UPDATE_WINDOW_MS
  const updateDue = observedAt > nextUpdateDueAt
  return {
    state: updateDue ? 'update_due' : 'received',
    nextAction: updateDue ? 'check_status' : 'await_status_update',
    nextActor: 'ae',
    nextUpdateDueAt,
    decisionAuthority: 'not_assigned',
  }
}

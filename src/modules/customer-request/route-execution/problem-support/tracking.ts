export const PROBLEM_STATUS_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1_000

export type CustomerRequestProblemTracking = Readonly<{
  state: 'received' | 'update_due' | 'investigating' | 'waiting_for_customer' | 'closed'
  nextAction: 'await_status_update' | 'check_status' | 'provide_information' | 'none'
  nextActor: 'ae' | 'customer' | 'none'
  nextUpdateDueAt?: number
  decisionAuthority: 'not_assigned'
}>

export function projectCustomerRequestProblemTracking(
  reportedAt: number,
  observedAt: number,
  latest?: Readonly<{
    state: 'investigating' | 'waiting_for_customer' | 'closed'
    recordedAt: number
  }>,
): CustomerRequestProblemTracking {
  if (latest?.state === 'waiting_for_customer') {
    return {
      state: 'waiting_for_customer',
      nextAction: 'provide_information',
      nextActor: 'customer',
      decisionAuthority: 'not_assigned',
    }
  }
  if (latest?.state === 'closed') {
    return {
      state: 'closed',
      nextAction: 'none',
      nextActor: 'none',
      decisionAuthority: 'not_assigned',
    }
  }
  const nextUpdateDueAt = (latest?.recordedAt ?? reportedAt) + PROBLEM_STATUS_UPDATE_WINDOW_MS
  const updateDue = observedAt > nextUpdateDueAt
  return {
    state: updateDue ? 'update_due' : latest?.state ?? 'received',
    nextAction: updateDue ? 'check_status' : 'await_status_update',
    nextActor: 'ae',
    nextUpdateDueAt,
    decisionAuthority: 'not_assigned',
  }
}

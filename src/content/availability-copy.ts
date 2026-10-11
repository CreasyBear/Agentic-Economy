export type PaidCallsAvailability = 'open' | 'soon'

export function availabilityStatement(paidCalls: PaidCallsAvailability): string {
  return paidCalls === 'open'
    ? 'Paid calls are open.'
    : 'Alpha users get trial credit. Paid calls open soon.'
}

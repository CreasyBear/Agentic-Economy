const legacyReferenceableOutcomes = new Set([
  'queued_communication',
  'completed',
])

export function isLegacyReferenceableInvocationOutcome(outcome: string): boolean {
  return legacyReferenceableOutcomes.has(outcome)
}

/**
 * Canonical Rule-4 operator diagnostic triplet.
 * Shared UI presentation contract — not a domain entity and not an API payload.
 */
export type Rule4Diagnostic = Readonly<{
  whatHappened: string
  financialImpact: string
  nextStep: string
}>

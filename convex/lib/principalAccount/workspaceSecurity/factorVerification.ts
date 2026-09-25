export const MFA_REVERIFICATION_REQUIRED = {
  kind: 'refused',
  code: 'mfa_reverification_required',
} as const

const MFA_EVIDENCE_MAX_AGE_MINUTES = 10

export function hasFreshMfaFactorVerification(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2) return false
  const [firstFactorAgeMinutes, secondFactorAgeMinutes] = value
  return Number.isSafeInteger(firstFactorAgeMinutes)
    && Number.isSafeInteger(secondFactorAgeMinutes)
    && firstFactorAgeMinutes >= 0
    && secondFactorAgeMinutes >= 0
    && firstFactorAgeMinutes <= MFA_EVIDENCE_MAX_AGE_MINUTES
    && secondFactorAgeMinutes <= MFA_EVIDENCE_MAX_AGE_MINUTES
}

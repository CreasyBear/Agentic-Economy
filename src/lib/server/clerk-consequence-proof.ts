import { auth } from '@clerk/tanstack-react-start/server'
import { reverificationError } from '@clerk/shared/authorization-errors'

export type ClerkConsequenceProofInput = Readonly<{
  reverificationId: string
  firstFactorAgeMinutes: number
  secondFactorAgeMinutes: number
}>

export type ClerkMfaConsequenceProofInput = ClerkConsequenceProofInput & Readonly<{
  subject: string
  evidenceObservedAt: number
}>

/** Requires Clerk-authenticated session evidence. No browser-supplied proof is accepted.
 * Both factors must be fresh; Clerk's strict_mfa fallback without an enrolled
 * second factor cannot authorize an MFA-required consequence. The signed JWT's
 * issue time anchors age so transport or retries never refresh old evidence. */
export async function readClerkMfaConsequenceProof(): Promise<ClerkMfaConsequenceProofInput | undefined> {
  const identity = await auth()
  if (!identity.isAuthenticated || identity.userId === null
    || !identity.has({ reverification: 'strict_mfa' })) return undefined
  const claims = identity.sessionClaims
  if (claims === null || claims === undefined) return undefined
  const reverificationId = claims.reverification_id
  const factorAges = identity.factorVerificationAge
  const issuedAt = claims.iat
  const now = Date.now()
  if (typeof reverificationId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(reverificationId)
    || factorAges === null || factorAges.length !== 2
    || !factorAges.every(value => Number.isSafeInteger(value) && value >= 0 && value < 10)
    || typeof issuedAt !== 'number' || !Number.isSafeInteger(issuedAt) || issuedAt <= 0
    || issuedAt * 1_000 > now + 5_000
    || issuedAt * 1_000 + (10 - Math.max(...factorAges)) * 60_000 <= now) return undefined
  return {
    reverificationId,
    firstFactorAgeMinutes: factorAges[0],
    secondFactorAgeMinutes: factorAges[1],
    subject: identity.userId,
    evidenceObservedAt: issuedAt * 1_000,
  }
}

export async function hasStrictClerkConsequenceProof(): Promise<boolean> {
  const identity = await auth()
  return identity.isAuthenticated && identity.userId !== null && identity.has({ reverification: 'strict' })
}

/** Uses Clerk's maintained strict-reverification contract and returns only signed session evidence. */
export async function requireStrictClerkConsequenceProof(
  _commandRef: string,
): Promise<ClerkConsequenceProofInput> {
  const identity = await auth()
  if (!identity.isAuthenticated || identity.userId === null) {
    throw new Error('authentication_required')
  }
  if (!identity.has({ reverification: 'strict' })) {
    throw reverificationError('strict')
  }
  const reverificationId = identity.sessionClaims?.reverification_id
  const factorAges = identity.factorVerificationAge
  if (typeof reverificationId !== 'string'
    || reverificationId.trim().length === 0
    || reverificationId.length > 200
    || factorAges === null
    || factorAges.length !== 2
    || !factorAges.every((value) => Number.isSafeInteger(value) && value >= -1)
    || factorAges[0] < 0) {
    throw new Error('security_evidence_unavailable')
  }
  return {
    reverificationId,
    firstFactorAgeMinutes: factorAges[0],
    secondFactorAgeMinutes: factorAges[1],
  }
}

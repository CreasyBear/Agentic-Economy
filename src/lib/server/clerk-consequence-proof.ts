import { auth } from '@clerk/tanstack-react-start/server'
import { reverificationError } from '@clerk/shared/authorization-errors'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

export type ClerkConsequenceProofInput = Readonly<{
  reverificationId: string
  firstFactorAgeMinutes: number
  secondFactorAgeMinutes: number
}>

/** Uses Clerk's maintained strict-reverification contract and returns only signed session evidence. */
export async function requireStrictClerkConsequenceProof(
  commandRef: string,
): Promise<ClerkConsequenceProofInput> {
  if (isLocalE2EAuthBypassEnabled()) {
    return {
      reverificationId: `local-e2e:${canonicalDigest({
        version: 'ae.local-e2e-consequence-proof:v1',
        commandRef,
      })}`,
      firstFactorAgeMinutes: 0,
      secondFactorAgeMinutes: -1,
    }
  }
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

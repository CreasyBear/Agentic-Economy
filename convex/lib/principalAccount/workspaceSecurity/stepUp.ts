import type { UserIdentity } from 'convex/server'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { hasFreshMfaFactorVerification, MFA_REVERIFICATION_REQUIRED } from './factorVerification'
import type { SecurityDb } from './identity'

export async function assertStepUpForSensitiveAction(
  db: SecurityDb,
  identity: UserIdentity,
  input: Readonly<{ accountRef: string }>,
): Promise<
  | Readonly<{
    kind: 'allowed'
    requireMfaForMembers: boolean
    policyRevision?: number
  }>
  | typeof MFA_REVERIFICATION_REQUIRED
> {
  if (!hasFreshMfaFactorVerification(identity.fva)) {
    return MFA_REVERIFICATION_REQUIRED
  }

  const canonicalAccountRef = accountRef(input.accountRef)
  const row = await db
    .query('accountSecurityPolicies')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()

  if (row === null || !row.requireMfaForMembers) {
    return { kind: 'allowed', requireMfaForMembers: false }
  }

  return {
    kind: 'allowed',
    requireMfaForMembers: true,
    policyRevision: row.revision,
  }
}

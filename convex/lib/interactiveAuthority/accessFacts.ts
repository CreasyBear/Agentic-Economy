import type { AccountRef, PrincipalRef } from '../../../src/modules/principal-account/public'
import { InteractiveAuthorityError } from './errors'
import type { AccessFact, AuthorityDb } from './shared'

export async function requireAccessFactForAccount(
  db: AuthorityDb,
  canonicalPrincipalRef: PrincipalRef,
  targetAccountRef: AccountRef,
): Promise<AccessFact> {
  const ownerships = await db
    .query('accountOwnerships')
    .withIndex('by_accountRef_and_ownerPrincipalRef_and_lifecycle', (query) => query
      .eq('accountRef', targetAccountRef)
      .eq('ownerPrincipalRef', canonicalPrincipalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  const memberships = await db
    .query('memberships')
    .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
      .eq('accountRef', targetAccountRef)
      .eq('memberPrincipalRef', canonicalPrincipalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  if (ownerships.length > 1) throw new InteractiveAuthorityError('ownership_ambiguous')
  if (memberships.length > 1) throw new InteractiveAuthorityError('account_access_ambiguous')
  if (ownerships.length === 1) {
    const [row] = ownerships
    if (row === undefined) throw new InteractiveAuthorityError('account_access_missing')
    return { kind: 'ownership', row }
  }
  if (memberships.length === 1) {
    const [row] = memberships
    if (row === undefined) throw new InteractiveAuthorityError('account_access_missing')
    return { kind: 'membership', row }
  }
  throw new InteractiveAuthorityError('account_access_missing')
}

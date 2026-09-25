import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../../../../src/modules/principal-account/external-identity/public'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'

type BillingSettingsDb = GenericDatabaseReader<DataModel>

async function requireInteractiveHumanPrincipal(
  db: BillingSettingsDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }
  return principal
}

export async function requireAuthenticatedAccountContext(
  db: BillingSettingsDb,
  identity: UserIdentity,
): Promise<{
  principal: Doc<'principals'>
  canonicalPrincipalRef: ReturnType<typeof principalRef>
  canonicalAccountRef: ReturnType<typeof accountRef>
  authorityGeneration: number
}> {
  const principal = await requireInteractiveHumanPrincipal(db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const res = await resolveActiveAccountRefForPrincipal(
    db,
    canonicalPrincipalRef,
    identity,
    'require',
  )
  const canonicalAccountRef = accountRef(res.activeAccountRef)
  const access = await requireAccessFactForAccount(db, canonicalPrincipalRef, canonicalAccountRef)
  if (access.kind !== 'ownership') {
    throw new InteractiveAuthorityError('authority_mismatch')
  }
  const account = await db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()
  if (account === null) throw new InteractiveAuthorityError('account_missing')
  if (account.lifecycle !== 'active') throw new InteractiveAuthorityError('account_inactive')
  return {
    principal,
    canonicalPrincipalRef,
    canonicalAccountRef,
    authorityGeneration: account.revision,
  }
}

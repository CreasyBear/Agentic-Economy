import type { GenericDatabaseReader, UserIdentity } from 'convex/server'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import { resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { WorkspaceSecurityError } from './contracts'

export type SecurityDb = GenericDatabaseReader<DataModel>

export async function requireInteractiveHumanPrincipal(
  db: SecurityDb,
  identity: UserIdentity,
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new WorkspaceSecurityError('identity_invalid')
  }
  if (principal.kind !== 'human') {
    throw new WorkspaceSecurityError('principal_kind_invalid')
  }
  return principal
}

export async function requireActiveAccount(
  db: SecurityDb,
  identity: UserIdentity,
  canonicalPrincipalRef: ReturnType<typeof principalRef>,
): Promise<string> {
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(db, canonicalPrincipalRef, identity)
  return activeAccountRef
}

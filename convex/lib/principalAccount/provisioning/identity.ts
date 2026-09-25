import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel, Doc } from '../../../_generated/dataModel'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { WorkspaceProvisioningError } from './contracts'

export async function resolveCreatorPrincipal(
  db: GenericDatabaseReader<DataModel>,
  creatorTokenIdentifier: string,
): Promise<Doc<'principals'>> {
  const bindings = await db
    .query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', creatorTokenIdentifier))
    .take(2)
  if (bindings.length !== 1) {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }

  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  const [principal] = principals
  if (principal === undefined) {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  if (principal.lifecycle !== 'active') {
    throw new WorkspaceProvisioningError('creator_principal_inactive')
  }
  if (principal.kind !== 'human') {
    throw new WorkspaceProvisioningError('creator_binding_missing')
  }
  return principal
}

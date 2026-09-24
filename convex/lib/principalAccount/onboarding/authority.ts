import type { GenericDatabaseReader, UserIdentity } from 'convex/server'

import type { DataModel, Doc } from '../../../_generated/dataModel'
import { InteractiveAuthorityError } from '../interactiveAuthority/errors'

const CLERK_USER_PROVIDER_NAMESPACE = 'clerk/user' as const
const CORRELATION_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u
const WORKSPACE_NAME_PATTERN = /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u

type OnboardingDb = GenericDatabaseReader<DataModel>

export function redirectPathForRoleIntent(
  roleIntent: 'buyer' | 'supplier',
): '/owner' | '/owner/operations' {
  return roleIntent === 'buyer' ? '/owner' : '/owner/operations'
}

export function validateCorrelationRef(value: string): void {
  if (value.length < 3 || value.length > 128 || !CORRELATION_REF_PATTERN.test(value)) {
    throw new InteractiveAuthorityError('correlation_ref_invalid')
  }
}

export function validateWorkspaceName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 200 || !WORKSPACE_NAME_PATTERN.test(trimmed)) {
    throw new InteractiveAuthorityError('display_name_invalid')
  }
  return trimmed
}

export async function requireInteractiveHumanPrincipal(
  db: OnboardingDb,
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
    throw new InteractiveAuthorityError(bindings.length === 0 ? 'binding_missing' : 'binding_ambiguous')
  }
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('binding_inactive')
  }
  const principals = await db
    .query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .take(2)
  if (principals.length !== 1) {
    throw new InteractiveAuthorityError(principals.length === 0 ? 'principal_missing' : 'principal_ambiguous')
  }
  const [principal] = principals
  if (principal === undefined || principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('principal_inactive')
  }
  if (principal.kind !== 'human') {
    throw new InteractiveAuthorityError('principal_kind_invalid')
  }
  return principal
}


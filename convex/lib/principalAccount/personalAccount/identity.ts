import type { DatabaseReader, MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { CLERK_USER_PROVIDER_NAMESPACE } from '../../../../src/modules/principal-account/external-identity/public'

export async function resolveAccountRefForPrincipal(
  ctx: Pick<MutationCtx, 'db'>,
  principalRef: string,
): Promise<string | undefined> {
  const ownershipRows = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
      .eq('ownerPrincipalRef', principalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  if (ownershipRows[0]?.accountRef !== undefined) return ownershipRows[0].accountRef

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', principalRef)
      .eq('lifecycle', 'active'))
    .take(2)
  return membershipRows[0]?.accountRef
}

export async function requireActiveHumanPrincipal(
  db: DatabaseReader,
  identity: { tokenIdentifier?: string | null },
): Promise<Doc<'principals'>> {
  const principal = await requireHumanPrincipal(db, identity)
  if (principal.lifecycle !== 'active') throw new InteractiveAuthorityError('identity_invalid')
  return principal
}

export async function resolveExportPrincipal(
  db: DatabaseReader,
  identity: { tokenIdentifier?: string | null },
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) throw new InteractiveAuthorityError('identity_invalid')
  const [binding] = bindings
  if (binding === undefined) throw new InteractiveAuthorityError('identity_invalid')
  const principal = await db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .unique()
  if (principal === null || principal.kind !== 'human') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  if (principal.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('personal_account_retired')
  }
  if (binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  return principal
}

async function requireHumanPrincipal(
  db: DatabaseReader,
  identity: { tokenIdentifier?: string | null },
): Promise<Doc<'principals'>> {
  const tokenIdentifier = identity.tokenIdentifier
  if (typeof tokenIdentifier !== 'string' || tokenIdentifier.trim().length === 0) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const bindings = await db.query('externalIdentityBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_USER_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', tokenIdentifier))
    .take(2)
  if (bindings.length !== 1) throw new InteractiveAuthorityError('identity_invalid')
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const principal = await db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
    .unique()
  if (principal === null || principal.kind !== 'human') {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  return principal
}

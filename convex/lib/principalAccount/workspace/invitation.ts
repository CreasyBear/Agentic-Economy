import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'

import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../../interactiveAuthority'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { requireDirectoryInteractiveHumanPrincipal } from './identity'

export const invitationContextArgs = v.object({})

export const invitationContextResult = v.union(
  v.object({ kind: v.literal('available'), accountRef: v.string(), organizationId: v.string() }),
  v.object({ kind: v.literal('role_restricted') }),
  v.object({ kind: v.literal('organization_unset') }),
  v.object({ kind: v.literal('binding_unavailable') }),
)

export const invitationContextHandler = async (ctx: QueryCtx): Promise<
  | { kind: 'available'; accountRef: string; organizationId: string }
  | { kind: 'role_restricted' | 'organization_unset' | 'binding_unavailable' }
> => {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
  const principal = await requireDirectoryInteractiveHumanPrincipal(ctx.db, identity)
  const canonicalPrincipalRef = principalRef(principal.principalRef)
  const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(ctx.db, canonicalPrincipalRef, identity)
  const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, accountRef(activeAccountRef))
  if (access.kind !== 'ownership' && access.row.role !== 'org:admin') return { kind: 'role_restricted' }
  const bindings = await ctx.db.query('accountExternalOrganizationBindings')
    .withIndex('by_accountRef_and_lifecycle', (q) => q.eq('accountRef', activeAccountRef).eq('lifecycle', 'active'))
    .take(2)
  if (bindings.length === 0) return { kind: 'organization_unset' }
  if (bindings.length !== 1 || bindings[0]?.providerNamespace !== CLERK_ORGANIZATION_PROVIDER_NAMESPACE) {
    return { kind: 'binding_unavailable' }
  }
  return { kind: 'available', accountRef: activeAccountRef, organizationId: bindings[0].providerIdentifier }
}

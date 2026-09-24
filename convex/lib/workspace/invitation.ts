import { v } from 'convex/values'
import type { QueryCtx } from '../../_generated/server'

import { accountRef } from '../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../src/modules/principal-account/principal/public'
import { InteractiveAuthorityError, requireAccessFactForAccount, resolveActiveAccountRefForPrincipal } from '../../interactiveAuthority'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from '../../workspaceProvisioning'
import { requireDirectoryInteractiveHumanPrincipal } from './identity'

export const invitationContextArgs = v.object({})

export const invitationContextResult = v.union(v.null(), v.object({ organizationId: v.string() }))

export const invitationContextHandler = async (ctx: QueryCtx): Promise<{ organizationId: string } | null> => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const principal = await requireDirectoryInteractiveHumanPrincipal(ctx.db, identity)
    const canonicalPrincipalRef = principalRef(principal.principalRef)
    const { activeAccountRef } = await resolveActiveAccountRefForPrincipal(
      ctx.db, canonicalPrincipalRef, identity, 'require',
    )
    const access = await requireAccessFactForAccount(ctx.db, canonicalPrincipalRef, accountRef(activeAccountRef))
    if (access.kind !== 'ownership' && access.row.role !== 'org:admin') return null
    const bindings = await ctx.db.query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (q) => q.eq('accountRef', activeAccountRef).eq('lifecycle', 'active'))
      .take(2)
    if (bindings.length !== 1 || bindings[0]?.providerNamespace !== CLERK_ORGANIZATION_PROVIDER_NAMESPACE) return null
    return { organizationId: bindings[0].providerIdentifier }
  }

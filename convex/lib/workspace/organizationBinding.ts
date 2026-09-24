import type { QueryCtx } from '../../_generated/server'
import { v } from 'convex/values'

import { InteractiveAuthorityError } from '../../interactiveAuthority'
import { callerIsAccountOwner, requireAuthenticatedAccountContext, requireCurrentOwnership } from './accountContext'
import { CLERK_USER_PROVIDER_NAMESPACE } from './identity'

export const readWorkspaceOrganizationBindingArgs = v.object({})

export const readWorkspaceOrganizationBindingResult = v.object({
    accountRef: v.string(),
    displayName: v.string(),
    accountRevision: v.number(),
    callerIsOwner: v.boolean(),
    clerkOrgId: v.union(v.string(), v.null()),
    ownerDisplayName: v.string(),
    ownerClerkUserId: v.union(v.string(), v.null()),
  })

export const readWorkspaceOrganizationBindingHandler = async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalAccountRef, canonicalPrincipalRef, account } =
      await requireAuthenticatedAccountContext(ctx.db, identity)
    const bindings = await ctx.db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) => query
        .eq('accountRef', canonicalAccountRef)
        .eq('lifecycle', 'active'))
      .collect()
    const organizations = bindings.filter((binding) => binding.providerNamespace === 'clerk/organization')
    if (organizations.length > 1) throw new InteractiveAuthorityError('ownership_mismatch')
    const ownership = await requireCurrentOwnership(ctx.db, account)
    const owner = await ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', ownership.ownerPrincipalRef))
      .unique()
    if (owner === null || owner.lifecycle !== 'active') throw new InteractiveAuthorityError('ownership_mismatch')
    const ownerBindings = await ctx.db.query('externalIdentityBindings')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', ownership.ownerPrincipalRef)
        .eq('lifecycle', 'active'))
      .collect()
    const clerkUserBinding = ownerBindings.find((binding) => binding.providerNamespace === CLERK_USER_PROVIDER_NAMESPACE)
    const ownerClerkUserId = clerkUserBinding?.providerIdentifier.split('|').at(-1) ?? null
    return {
      accountRef: canonicalAccountRef,
      displayName: account.displayName,
      accountRevision: account.revision,
      callerIsOwner: await callerIsAccountOwner(ctx.db, account, canonicalPrincipalRef),
      clerkOrgId: organizations[0]?.providerIdentifier ?? null,
      ownerDisplayName: owner.displayName,
      ownerClerkUserId: ownerClerkUserId?.startsWith('user_') ? ownerClerkUserId : null,
    }
  }

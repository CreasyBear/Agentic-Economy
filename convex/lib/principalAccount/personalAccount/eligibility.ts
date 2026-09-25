import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { requireActiveHumanPrincipal } from './identity'

export const readDeletionEligibilityArgs = {}
export const readDeletionEligibilityResult = v.union(
  v.object({ kind: v.literal('eligible') }),
  v.object({
    kind: v.literal('blocked'),
    reason: v.union(
      v.literal('last_owner_of_populated_workspace'),
      v.literal('workspace_close_required'),
    ),
  }),
)

export const readDeletionEligibilityHandler = async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')

    const principal = await requireActiveHumanPrincipal(ctx.db, identity)
    const ownershipRows = await ctx.db.query('accountOwnerships')
      .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
        .eq('ownerPrincipalRef', principal.principalRef)
        .eq('lifecycle', 'active'))
      .collect()

    let requiresWorkspaceClose = false
    for (const ownership of ownershipRows) {
      const account = await ctx.db.query('accounts')
        .withIndex('by_accountRef', (index) => index.eq('accountRef', ownership.accountRef))
        .unique()
      if (account === null || account.lifecycle !== 'active') continue

      const memberRows = await ctx.db.query('memberships')
        .withIndex('by_accountRef_and_lifecycle', (index) => index
          .eq('accountRef', ownership.accountRef)
          .eq('lifecycle', 'active'))
        .collect()
      const otherMembers = memberRows.filter((row) => row.memberPrincipalRef !== principal.principalRef)
      if (otherMembers.length > 0) {
        return { kind: 'blocked' as const, reason: 'last_owner_of_populated_workspace' as const }
      }
      requiresWorkspaceClose = true
    }

    if (requiresWorkspaceClose) {
      return { kind: 'blocked' as const, reason: 'workspace_close_required' as const }
    }

    return { kind: 'eligible' as const }
}

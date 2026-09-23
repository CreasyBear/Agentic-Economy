import { v } from 'convex/values'

import { query } from './_generated/server'
import { readCurrentActiveAdminMembership, resolveBusinessActor } from './authz'

const operatorSurface = v.union(
  v.literal('owner'),
  v.literal('admin'),
  v.literal('developer'),
)

const operatorContextResult = v.union(
  v.object({
    kind: v.literal('authorized'),
    userId: v.string(),
    principalRef: v.string(),
    accountRef: v.optional(v.string()),
    allowedSurfaces: v.array(operatorSurface),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.literal('canonical_owner_required'),
  }),
)

/**
 * Resolve shell access from canonical Principal, Account, and active admin
 * membership facts. Clerk identity locates those facts but never supplies
 * ownership or admin authority itself.
 */
export const readCurrent = query({
  args: {},
  returns: operatorContextResult,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      return { kind: 'denied' as const, reason: 'canonical_owner_required' as const }
    }

    const [actor, adminMembership] = await Promise.all([
      resolveBusinessActor(ctx),
      readCurrentActiveAdminMembership(ctx),
    ])

    if (actor.kind === 'authenticated_owner') {
      const allowedSurfaces = adminMembership === undefined
        ? ['owner', 'developer'] as const
        : ['owner', 'admin', 'developer'] as const

      return {
        kind: 'authorized' as const,
        userId: identity.subject,
        principalRef: actor.canonicalPrincipalRef,
        accountRef: actor.canonicalAccountRef,
        allowedSurfaces: [...allowedSurfaces],
      }
    }

    const binding = await ctx.db
      .query('externalIdentityBindings')
      .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
        .eq('providerNamespace', 'clerk/user')
        .eq('providerIdentifier', identity.tokenIdentifier))
      .unique()
    if (binding !== null && binding.lifecycle === 'active') {
      const principal = await ctx.db
        .query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', binding.principalRef))
        .unique()
      if (principal !== null && principal.kind === 'human' && principal.lifecycle === 'active') {
        const [ownership, membership] = await Promise.all([
          ctx.db
            .query('accountOwnerships')
            .withIndex('by_ownerPrincipalRef_and_lifecycle', (query) =>
              query.eq('ownerPrincipalRef', principal.principalRef).eq('lifecycle', 'active'))
            .first(),
          ctx.db
            .query('memberships')
            .withIndex('by_memberPrincipalRef_and_lifecycle', (query) =>
              query.eq('memberPrincipalRef', principal.principalRef).eq('lifecycle', 'active'))
            .first(),
        ])
        const hasAccountAccess = ownership !== null || membership !== null

        if (hasAccountAccess) {
          const allowedSurfaces = adminMembership === undefined
            ? ['owner', 'developer'] as const
            : ['owner', 'admin', 'developer'] as const

          return {
            kind: 'authorized' as const,
            userId: identity.subject,
            principalRef: principal.principalRef,
            allowedSurfaces: [...allowedSurfaces],
          }
        }

        if (adminMembership !== undefined) {
          return {
            kind: 'authorized' as const,
            userId: identity.subject,
            principalRef: principal.principalRef,
            allowedSurfaces: [...(['admin', 'developer'] as const)],
          }
        }
      }
    }

    if (adminMembership !== undefined) {
      return {
        kind: 'authorized' as const,
        userId: identity.subject,
        principalRef: identity.tokenIdentifier,
        allowedSurfaces: [...(['admin', 'developer'] as const)],
      }
    }

    return { kind: 'denied' as const, reason: 'canonical_owner_required' as const }
  },
})

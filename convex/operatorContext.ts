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
    accountRef: v.string(),
    allowedSurfaces: v.array(operatorSurface),
  }),
  v.object({
    kind: v.literal('denied'),
    reason: v.literal('canonical_owner_required'),
  }),
)

/**
 * Resolve shell access from the same canonical Principal and Account facts
 * used by consequence-bearing owner operations. Clerk identity locates those
 * facts but never supplies ownership itself.
 */
export const readCurrent = query({
  args: {},
  returns: operatorContextResult,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      return { kind: 'denied' as const, reason: 'canonical_owner_required' as const }
    }

    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') {
      return { kind: 'denied' as const, reason: 'canonical_owner_required' as const }
    }

    const adminMembership = await readCurrentActiveAdminMembership(ctx)
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
  },
})

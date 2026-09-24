import { v } from 'convex/values'

import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

export const currentOwnerProviderIdentityResult = v.union(
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('conflict'), code: v.literal('multiple_businesses') }),
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    name: v.string(),
    slug: v.string(),
    publicStatus: v.union(v.literal('unpublished'), v.literal('published'), v.literal('suppressed')),
  }),
)

/** Minimal authenticated owner scope used by narrow Provider projections. */
export async function getCurrentOwnerProviderIdentityHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (query) => query.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc')
    .take(2)
  if (businesses.length === 0) return { kind: 'not_found' as const }
  if (businesses.length > 1) return { kind: 'conflict' as const, code: 'multiple_businesses' as const }
  const business = businesses[0]
  if (business === undefined) return { kind: 'not_found' as const }
  return {
    kind: 'available' as const,
    businessId: business._id,
    name: business.name,
    slug: business.slug,
    publicStatus: business.publicStatus,
  }
}

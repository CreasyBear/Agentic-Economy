import { v, type Infer } from 'convex/values'
import { resolveBusinessActor } from '../../../authz'
import { activeDirectoryGeneration } from '../../market/directoryIndex/rows'
import { providerKeyForBusiness } from '../../market/directoryIndex/providerProjection'
import type { QueryCtx } from '../../../_generated/server'

export const resolveOwnerToolSlugArgs = { businessId: v.id('businesses'), slug: v.string() }
export const resolveOwnerToolSlugResult = v.union(v.null(), v.object({ offeringRef: v.string() }))

/**
 * Well 8 Lane C: resolves `/owner/operations/<slug>` server-side - the slug
 * is scoped to the owner's own providerKey (never client-supplied), so this
 * can only ever resolve a Tool the caller's own business owns.
 */
export async function resolveOwnerToolSlugHandler(ctx: QueryCtx, args: { businessId: Infer<typeof resolveOwnerToolSlugArgs.businessId>; slug: string }) {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) return null
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return null
    const providerKey = providerKeyForBusiness(business)
    const row = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_providerKey_and_slug', (index) => index.eq('generation', generation.generation).eq('providerKey', providerKey).eq('slug', args.slug))
      .filter((query) => query.and(query.eq(query.field('network'), '*'), query.eq(query.field('source'), 'provider')))
      .unique()
    if (row === null || row.sourceRouteRef === undefined) return null
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_sourceRouteRef_and_disposition', (index) => index.eq('sourceRouteRef', row.sourceRouteRef).eq('disposition', 'current'))
      .unique()
    if (publication === null || publication.businessId !== args.businessId) return null
    const offering = await ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (index) => index.eq('offeringId', publication.offeringId))
      .unique()
    return offering === null || offering.origin?.kind !== 'catalog_offering' ? null : { offeringRef: offering.origin.offeringRef }
}

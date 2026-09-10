import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

export async function providerRouteabilityIsFrozen(
  ctx: Pick<QueryCtx, 'db'>,
  businessId: Id<'businesses'>,
): Promise<boolean> {
  const current = await ctx.db.query('capabilityProviderOffboardingCases')
    .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', businessId))
    .order('desc')
    .first()
  return current !== null
    && current.state !== 'cancelled'
    && current.routeabilityFrozenAt !== undefined
}

export async function toolProviderRouteabilityIsFrozen(
  ctx: Pick<QueryCtx, 'db'>,
  toolRef: string,
): Promise<boolean> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_toolRef_and_disposition', (index) => index
      .eq('toolRef', toolRef)
      .eq('disposition', 'current'))
    .first()
  return publication === null
    ? false
    : await providerRouteabilityIsFrozen(ctx, publication.businessId)
}

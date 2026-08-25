import type { Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { readCanonicalCompatibilityOwner, resolveBusinessActor } from './authz'
import {
  readOwnerSupplyFunnelProjection,
  type OwnerSupplyFunnelResult,
} from './capabilitySupplyOwnerFunnelProjection'

export async function readOwnerSupplyFunnelHandler(
  ctx: QueryCtx,
  args: { businessId: Id<'businesses'> },
): Promise<OwnerSupplyFunnelResult> {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner')
      return { kind: 'error', code: 'unauthenticated' }
    const business = await ctx.db.get(args.businessId)
    if (business === null) return { kind: 'not_found' }
    const owner = await readCanonicalCompatibilityOwner(ctx.db, actor)
    if (owner === null || owner._id !== business.ownerId)
      return { kind: 'not_found' }
    return await readOwnerSupplyFunnelProjection(ctx, args, business)
}

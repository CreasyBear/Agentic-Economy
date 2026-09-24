import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

async function publishedBusiness(
  db: QueryCtx['db'],
  businessId: string | Id<'businesses'>,
) {
  const business = await db.get(businessId as Id<'businesses'>)
  return business !== null &&
    business.publicStatus === 'published' &&
    business.suppressedAt === undefined
    ? business
    : null
}

export async function ownsPublishedBusiness(
  ctx: Pick<MutationCtx | QueryCtx, 'auth' | 'db'>,
  businessId: Id<'businesses'>,
): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const business = await publishedBusiness(ctx.db, businessId)
  if (business === null) return false

  return business.owningAccountRef === actor.canonicalAccountRef
}

export async function ownsPublishedBusinessForOwnerId(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  businessId: Id<'businesses'>,
  ownerId: string,
): Promise<boolean> {
  const business = await publishedBusiness(ctx.db, businessId)
  if (business === null) return false
  return business.owningAccountRef === ownerId
}

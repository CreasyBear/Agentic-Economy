import type { GenericDatabaseReader } from 'convex/server'

import type { QueryCtx } from '../../../_generated/server'
import type { DataModel, Id } from '../../../_generated/dataModel'

import { resolveBusinessActor } from '../../../authz'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../capabilitySupply/projection/support'
import { readLiveBusinessSupplyProjection } from '../../capabilitySupply/projection/reads'
import { normalizeSlug } from '../../../../src/modules/common/normalize-slug'
import { projectBusinessSupplyToPublicApi } from '../../../../src/modules/registry/public'

function catalogReadNotFound(reason: 'not_public' | 'no_such_business' = 'not_public') {
  return { kind: 'not_found' as const, reason }
}

export async function getPublicBusinessCatalogBySlugHandler(
  ctx: QueryCtx,
  args: { slug: string },
) {
  const now = Date.now()
  const business = await ctx.db
    .query('businesses')
    .withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug) || 'service'))
    .unique()
  if (business === null) {
    return catalogReadNotFound('no_such_business')
  }

  const catalog = await publicCatalogForBusiness(ctx.db, business._id, now)
  return catalog === undefined ? catalogReadNotFound() : { kind: 'available' as const, catalog }
}

export async function getCurrentOwnerPublicCatalogHandler(ctx: QueryCtx) {
  const now = Date.now()
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return catalogReadNotFound()
  }

  const published = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_publicStatus', (query) => (
      query.eq('owningAccountRef', actor.canonicalAccountRef).eq('publicStatus', 'published')
    ))
    .first()
  if (published === null) {
    return catalogReadNotFound()
  }
  const catalog = await publicCatalogForBusiness(ctx.db, published._id, now)
  return catalog === undefined ? catalogReadNotFound() : { kind: 'available' as const, catalog }
}

async function publicCatalogForBusiness(
  db: GenericDatabaseReader<DataModel>,
  businessId: Id<'businesses'>,
  now: number,
) {
  const business = await db.get(businessId)
  if (business === null || business.publicStatus !== 'published') return undefined
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, businessId, now)
  const projection = await readLiveBusinessSupplyProjection({ db, businessId, support, now })
  if (projection === null) return undefined
  const catalog = projectBusinessSupplyToPublicApi(projection, now)
  if (catalog.offerings.length === 0) return undefined
  return {
    ...catalog,
    photos: catalog.photos.map((photo) => ({ ...photo })),
    offerings: catalog.offerings.map((offering) => ({
      ...offering,
      ...(offering.price === undefined ? {} : { price: { ...offering.price } }),
      accessPaths: offering.accessPaths.map((path) => ({ ...path })),
      support: { ...offering.support },
    })),
    accessSummary: { ...catalog.accessSummary },
  }
}

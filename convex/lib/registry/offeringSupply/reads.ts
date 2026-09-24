import type { DatabaseReader, QueryCtx } from '../../../_generated/server'
import type { BusinessSupplyProjection } from '../../../../src/modules/catalog/public'
import { projectBusinessSupplyToPublicApi } from '../../../../src/modules/registry/public'
import { normalizeSlug } from '../../../../src/modules/common/normalize-slug'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../capabilitySupply/projection/support'
import { readLiveBusinessSupplyProjection } from '../../capabilitySupply/projection/reads'
import { paginationOptsValidator } from 'convex/server'
import { type Infer } from 'convex/values'
import { listPublicBusinessOfferingSupplyResult, getPublicBusinessOfferingSupplyBySlugResult } from './contracts'
import { nativeOfferingPageResultValue, toConvexOfferingBusiness } from './projection'

export type OfferingSupplyDto = ReturnType<typeof projectBusinessSupplyToPublicApi>
export type OfferingPage = { items: OfferingSupplyDto[]; isDone: boolean; continueCursor: string }
type NativePaginationOpts = typeof paginationOptsValidator['type']

export type OfferingSupplyBusiness = Readonly<{
  _id: string
  slug: string
  publicStatus?: string
}>

export type OfferingSupplySnapshot = Readonly<{
  status: 'current' | 'projection_pending'
  projection: BusinessSupplyProjection
}>

export type OfferingSupplyReadPort = Readonly<{
  readBusinessSupplyProjectionSnapshot: (businessId: string, expectedSlug?: string) => Promise<OfferingSupplySnapshot | null>
}>

export function createOfferingSupplyReadPort(db: DatabaseReader): OfferingSupplyReadPort {
  return {
    readBusinessSupplyProjectionSnapshot: async (businessId, expectedSlug) => {
      const id = db.normalizeId('businesses', businessId)
      if (id === null) return null
      const now = Date.now()
      const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, id, now)
      const projection = await readLiveBusinessSupplyProjection({ db, businessId: id, support, now })
      if (projection === null) return null
      if (expectedSlug !== undefined && projection.business.slug !== expectedSlug) return null
      return { status: 'current', projection }
    },
  }
}


export async function readOfferingSupplyForBusiness(
  port: OfferingSupplyReadPort,
  business: OfferingSupplyBusiness,
): Promise<OfferingSupplyDto | undefined> {
  if (business.publicStatus !== 'published') return undefined
  const snapshot = await port.readBusinessSupplyProjectionSnapshot(business._id, business.slug)
  if (snapshot === null) return undefined
  const projection = snapshot.projection
  if (String(projection.business.businessId) !== String(business._id) || projection.business.slug !== business.slug) return undefined
  const projected = projectBusinessSupplyToPublicApi(projection, Date.now())
  if (projected.offerings.length === 0) return undefined
  return snapshot.status === 'projection_pending' ? { ...projected, disposition: 'stale' } : projected
}

export async function readOfferingSupplyPage(db: DatabaseReader, paginationOpts: NativePaginationOpts): Promise<OfferingPage> {
  const page = await db.query('businesses').withIndex('by_publicStatus_slug', (query) => query.eq('publicStatus', 'published')).paginate(paginationOpts)
  const offeringSupplyReadPort = createOfferingSupplyReadPort(db)
  const items = (await Promise.all(page.page.map((business) => readOfferingSupplyForBusiness(offeringSupplyReadPort, business)))).filter((item): item is OfferingSupplyDto => item !== undefined)
  return { items, isDone: page.isDone, continueCursor: page.continueCursor }
}

export async function listPublicBusinessOfferingSupplyHandler(ctx: QueryCtx, args: { paginationOpts: NativePaginationOpts }): Promise<Infer<typeof listPublicBusinessOfferingSupplyResult>> {
  return nativeOfferingPageResultValue(await readOfferingSupplyPage(ctx.db, args.paginationOpts))
}

export async function getPublicBusinessOfferingSupplyBySlugHandler(ctx: QueryCtx, args: { slug: string }): Promise<Infer<typeof getPublicBusinessOfferingSupplyBySlugResult>> {
  const business = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', normalizeSlug(args.slug))).unique()
  if (business === null || business.publicStatus !== 'published') return { kind: 'not_found', code: 'business_not_found', reason: 'No public business catalog exists for this slug.' }
  const item = await readOfferingSupplyForBusiness(createOfferingSupplyReadPort(ctx.db), business)
  return item === undefined
    ? { kind: 'not_found', code: 'business_not_found', reason: 'No current public Offering projection exists for this business.' }
    : { kind: 'found', schemaVersion: 'public-business-catalog-api:v2', business: toConvexOfferingBusiness(item) }
}

import type { GenericDatabaseReader } from 'convex/server'
import { v } from 'convex/values'

import type { QueryCtx } from './_generated/server'
import type { DataModel, Id } from './_generated/dataModel'

import { literalUnion } from '../src/modules/common/convex-literals'
import { resolveBusinessActor } from './authz'
import { loadOfferingSourceState } from './catalogOfferingMutations'
import { readBusinessSupplyProjectionSnapshot } from './businessSupplyProjectionSnapshot'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  readLiveBusinessSupplyProjection,
} from './capabilitySupplyProjection'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import {
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from '../src/modules/catalog/public'
import { businessContext as businessContextArg } from '../src/modules/business/public'
import { projectBusinessSupplyToPublicApi } from '../src/modules/registry/public'

const exactAmountArg = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

/** Mirrors `businessOfferingRevisions.price` exactly; optional and additive. */
export const offeringPriceArg = v.union(
  v.object({
    kind: v.literal('quote_only'),
    currency: v.string(),
    unit: v.optional(literalUnion(OfferingPriceUnitValues)),
    taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
  }),
  v.object({
    kind: v.union(v.literal('fixed'), v.literal('from')),
    amount: exactAmountArg,
    unit: v.optional(literalUnion(OfferingPriceUnitValues)),
    taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
  }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountArg,
    maximum: exactAmountArg,
    unit: v.optional(literalUnion(OfferingPriceUnitValues)),
    taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
  }),
)

export const humanAccessPathArg = v.object({
  kind: v.literal('human_request'),
  channel: v.union(v.literal('phone'), v.literal('website')),
  disclosure: v.string(),
  url: v.optional(v.string()),
})
export const externalAccessPathArg = v.object({
  kind: v.literal('external_operation'), name: v.string(), summary: v.string(), url: v.string(), method: v.optional(v.string()),
  documentationUrl: v.optional(v.string()), interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
  authenticationSummary: v.optional(v.string()), pricingSummary: v.optional(v.string()),
  provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
})

const publicOfferingAccessPathResult = v.union(
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('external_operation'),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
    authenticationSummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
  }),
)

const publicOfferingResult = v.object({
  offeringRef: v.string(),
  revision: v.number(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceAreaSummary: v.optional(v.string()),
  availabilitySummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  price: v.optional(offeringPriceArg),
  accessPaths: v.array(publicOfferingAccessPathResult),
  support: v.object({
    integrated: v.boolean(),
    aeSupportedAction: v.boolean(),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  }),
})

export const publicCatalogV2Result = v.object({
  schemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.string(),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  businessContext: businessContextArg,
  publicUrl: v.string(),
  trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  responseTimeMinutes: v.optional(v.number()),
  photos: v.array(v.object({ url: v.string(), alt: v.string() })),
  observedAt: v.number(),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  offerings: v.array(publicOfferingResult),
  accessSummary: v.object({
    humanRequest: v.boolean(),
    externalOperation: v.boolean(),
    aeSupportedAction: v.boolean(),
  }),
})

export const publicCatalogReadbackResult = v.union(
  v.object({
    kind: v.literal('available'),
    catalog: publicCatalogV2Result,
  }),
  v.object({
    kind: v.literal('not_found'),
    reason: v.union(v.literal('not_public'), v.literal('no_such_business')),
  }),
)

function catalogReadNotFound(reason: 'not_public' | 'no_such_business' = 'not_public') {
  return { kind: 'not_found' as const, reason }
}

const catalogOfferingPriceValue = offeringPriceArg
const catalogAccessPathDescriptorValue = v.union(
  humanAccessPathArg,
  externalAccessPathArg,
)

export const catalogOwnerSupplyResult = v.union(
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    business: v.object({
      name: v.string(),
      slug: v.string(),
      publicStatus: v.union(v.literal('unpublished'), v.literal('published'), v.literal('suppressed')),
      businessContext: businessContextArg,
    }),
    offerings: v.array(v.object({
      offeringRef: v.string(),
      businessId: v.string(),
      currentRevision: v.number(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      createdAt: v.number(),
      updatedAt: v.number(),
      revision: v.optional(v.object({
        offeringRef: v.string(),
        businessId: v.string(),
        revision: v.number(),
        name: v.string(),
        category: v.string(),
        summary: v.string(),
        serviceAreaSummary: v.optional(v.string()),
        availabilitySummary: v.optional(v.string()),
        pricingSummary: v.optional(v.string()),
        price: v.optional(catalogOfferingPriceValue),
        sourceHash: v.string(),
        createdAt: v.number(),
      })),
      accessPaths: v.array(v.object({
        accessPathRef: v.string(),
        businessId: v.string(),
        offeringRef: v.string(),
        offeringRevision: v.number(),
        offeringSourceHash: v.string(),
        status: v.union(v.literal('draft'), v.literal('published'), v.literal('withdrawn')),
        descriptor: catalogAccessPathDescriptorValue,
        sourceHash: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
      })),
    })),
    projection: v.union(
      v.object({ status: v.literal('projection_pending') }),
      v.object({
        status: v.union(v.literal('current'), v.literal('projection_pending')),
        observedAt: v.number(),
        disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
        lastErrorCode: v.optional(v.string()),
      }),
    ),
  }),
)

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

  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (query) => query.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc')
    .take(20)
  const published = businesses.find((row) => row.publicStatus === 'published')
  if (published === undefined) {
    return catalogReadNotFound()
  }
  const catalog = await publicCatalogForBusiness(ctx.db, published._id, now)
  return catalog === undefined ? catalogReadNotFound() : { kind: 'available' as const, catalog }
}

/** Authenticated source read for the protected owner Offering editor. */
export async function getCurrentOwnerOfferingSupplyHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
  const business = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (query) => query.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc')
    .first()
  if (business === null) return { kind: 'not_found' as const }
  const state = await loadOfferingSourceState(ctx.db, business._id)
  const now = Date.now()
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, business._id, now)
  const live = await readLiveBusinessSupplyProjection({ db: ctx.db, businessId: business._id, support, now })
  const projection = live === null
    ? { status: 'projection_pending' as const }
    : (() => {
        try {
          const decoded = readBusinessSupplyProjectionSnapshot(
            live,
            'catalog',
            String(business._id),
            business.slug,
            {
              businessId: String(business._id),
              sourceRevision: live.sourceRevision,
              sourceDigest: live.sourceDigest,
              observedAt: live.observedAt,
              disposition: live.disposition,
            },
          )
          return {
            status: 'current' as const,
            observedAt: decoded.observedAt,
            disposition: decoded.disposition,
          }
        } catch {
          return { status: 'projection_pending' as const }
        }
      })()
  const offerings = state.offerings.map((offering) => {
    const revision = state.revisions.find((candidate) => candidate.offeringRef === offering.offeringRef && candidate.revision === offering.currentRevision)
    return {
      ...offering,
      ...(revision === undefined ? {} : { revision }),
      accessPaths: state.accessPaths.filter((path) => path.offeringRef === offering.offeringRef),
    }
  })
  return {
    kind: 'available' as const,
    businessId: business._id,
    business: {
      name: business.name,
      slug: business.slug,
      publicStatus: business.publicStatus,
      businessContext: business.businessContext,
    },
    offerings,
    projection,
  }
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

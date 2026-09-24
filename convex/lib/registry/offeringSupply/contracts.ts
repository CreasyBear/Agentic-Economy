import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { businessContext as businessContextDto } from '../../../../src/modules/business/public'
import type { PublicBusinessCatalogApiV2Dto } from '../../../../src/modules/registry/public'

export type OfferingSupplyDto = PublicBusinessCatalogApiV2Dto
export type OfferingPage = { items: OfferingSupplyDto[]; isDone: boolean; continueCursor: string }

export const exactAmountDto = v.object({
  currency: v.string(), units: v.string(), exponent: v.number(),
})
const offeringPriceDto = v.union(
  v.object({
    kind: v.union(v.literal('fixed'), v.literal('from')), amount: exactAmountDto,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.literal('range'), minimum: exactAmountDto, maximum: exactAmountDto,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.literal('quote_only'), currency: v.string(),
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
)
const offeringAccessPathDto = v.union(
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
const offeringDto = v.object({
  offeringRef: v.string(), revision: v.number(), name: v.string(), category: v.string(), summary: v.string(),
  serviceAreaSummary: v.optional(v.string()), availabilitySummary: v.optional(v.string()), pricingSummary: v.optional(v.string()), price: v.optional(offeringPriceDto),
  accessPaths: v.array(offeringAccessPathDto), support: v.object({ integrated: v.boolean(), aeSupportedAction: v.boolean(), observedAt: v.optional(v.number()), validUntil: v.optional(v.number()) }),
})
export const offeringBusinessDto = v.object({
  schemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.string(),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  businessContext: businessContextDto,
  publicUrl: v.string(),
  trustTier: v.union(v.literal('claimed'), v.literal('contact_confirmed'), v.literal('listed'), v.literal('registry_verified')),
  responseTimeMinutes: v.optional(v.number()),
  photos: v.array(v.object({ url: v.string(), alt: v.string() })),
  observedAt: v.number(),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  offerings: v.array(offeringDto),
  accessSummary: v.object({ humanRequest: v.boolean(), externalOperation: v.boolean(), aeSupportedAction: v.boolean() }),
})

export const searchPublicBusinessOfferingSupplyResult = v.object({
  kind: v.literal('ok'), schemaVersion: v.literal('public-business-catalog-api:v2'), query: v.optional(v.string()), items: v.array(offeringBusinessDto),
  pagination: v.object({ cursor: v.optional(v.string()), nextCursor: v.optional(v.string()), limit: v.number(), total: v.number(), hasMore: v.boolean() }),
})
export const listPublicBusinessOfferingSupplyResult = v.object({ kind: v.literal('ok'), schemaVersion: v.literal('public-business-catalog-api:v2'), page: v.array(offeringBusinessDto), isDone: v.boolean(), continueCursor: v.string() })
export const getPublicBusinessOfferingSupplyBySlugResult = v.union(
  v.object({ kind: v.literal('found'), schemaVersion: v.literal('public-business-catalog-api:v2'), business: offeringBusinessDto }),
  v.object({ kind: v.literal('not_found'), code: v.literal('business_not_found'), reason: v.string() }),
)
export const listPublicBusinessOfferingSupplyArgs = { paginationOpts: paginationOptsValidator }
export const searchPublicBusinessOfferingSupplyArgs = {
  query: v.string(), mode: v.optional(v.union(v.literal('near_me'), v.literal('whole_catalogue'))), location: v.optional(v.string()),
  maxPrice: v.optional(exactAmountDto), hasPrice: v.optional(v.boolean()), cursor: v.optional(v.string()), limit: v.optional(v.number()),
}
export const getPublicBusinessOfferingSupplyBySlugArgs = { slug: v.string() }

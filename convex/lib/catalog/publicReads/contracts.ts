import { v } from 'convex/values'

import { literalUnion } from '../../../../src/modules/common/convex-literals'
import { OfferingPriceTaxTreatmentValues, OfferingPriceUnitValues } from '../../../../src/modules/catalog/public'
import { businessContext as businessContextArg } from '../../../../src/modules/business/public'

const exactAmountArg = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

/** Mirrors `businessOfferingRevisions.price` exactly; optional and additive. */
const offeringPriceArg = v.union(
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

const publicCatalogV2Result = v.object({
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

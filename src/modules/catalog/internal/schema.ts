import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { offeringComparisonEnvelope } from '@/modules/catalog/convex'

import { literalUnion } from '@/modules/common/convex-literals'
import { TrustTierValues } from '@/modules/business/public'
import {
  BusinessOfferingStatusValues,
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  OfferingAccessPathStatusValues,
  PublicSupportReasonValues,
} from '@/modules/catalog/public'

import {
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
} from './offering-price'

/** Additive and optional: existing revisions stay valid without a price. */
const offeringPrice = v.object({
  kind: literalUnion(OfferingPriceKindValues),
  currency: v.string(),
  amountMinor: v.optional(v.number()),
  maximumAmountMinor: v.optional(v.number()),
  unit: v.optional(literalUnion(OfferingPriceUnitValues)),
  taxTreatment: literalUnion(OfferingPriceTaxTreatmentValues),
})

const humanRequestAccessPath = v.object({
  kind: v.literal('human_request'),
  channel: literalUnion(HumanRequestChannelValues),
  disclosure: v.string(),
  url: v.optional(v.string()),
})

const externalOperationAccessPath = v.object({
  kind: v.literal('external_operation'),
  name: v.string(),
  summary: v.string(),
  url: v.string(),
  method: v.optional(v.string()),
  documentationUrl: v.optional(v.string()),
  interfaceDescription: v.optional(v.object({
    format: v.string(),
    url: v.optional(v.string()),
  })),
  authenticationSummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  provenance: literalUnion(ExternalOperationProvenanceValues),
})
const publicAccessPath = v.object({
  accessPathRef: v.string(),
  descriptor: v.union(humanRequestAccessPath, externalOperationAccessPath),
})

const offeringSupportProjection = v.object({
  integrated: v.boolean(),
  routeable: v.boolean(),
  reasons: v.array(literalUnion(PublicSupportReasonValues)),
  observedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
})

const businessOfferingProjection = v.object({
  offeringRef: v.string(),
  revision: v.number(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceAreaSummary: v.optional(v.string()),
  availabilitySummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  price: v.optional(offeringPrice),
})

const publicOfferingSupplyProjection = v.object({
  offering: businessOfferingProjection,
  accessPaths: v.array(publicAccessPath),
  support: offeringSupportProjection,
})

const publicBusinessProfile = v.object({
  businessId: v.id('businesses'),
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  suburb: v.string(),
  stateTerritory: v.string(),
  publishedPhone: v.optional(v.string()),
  postcode: v.optional(v.string()),
  publicUrl: v.string(),
  trustTier: literalUnion(TrustTierValues),
  responseTimeMinutes: v.optional(v.number()),
  photos: v.optional(v.array(v.object({ url: v.string(), alt: v.string() }))),
})

export const businessSupplyProjection = v.object({
  business: publicBusinessProfile,
  offerings: v.array(publicOfferingSupplyProjection),
  sourceRevision: v.number(),
  sourceDigest: v.string(),
  observedAt: v.number(),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
})

const businessSupplyProjectionSnapshotFields = {
  businessId: v.id('businesses'),
  sourceRevision: v.number(),
  sourceDigest: v.string(),
  observedAt: v.number(),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  status: v.union(v.literal('current'), v.literal('projection_pending')),
  lastErrorCode: v.optional(v.string()),
  updatedAt: v.number(),
}

const currentBusinessSupplyProjectionSnapshot = v.object({
  ...businessSupplyProjectionSnapshotFields,
  projection: businessSupplyProjection,
})

const legacyBusinessSupplyProjectionSnapshot = v.object({
  ...businessSupplyProjectionSnapshotFields,
  projectionJson: v.string(),
})

export const catalogTables = {
  businessOfferings: defineTable({
    offeringRef: v.string(),
    businessId: v.id('businesses'),
    currentRevision: v.number(),
    status: literalUnion(BusinessOfferingStatusValues),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_offeringRef', ['offeringRef'])
    .index('by_businessId_and_status', ['businessId', 'status']),

  businessOfferingRevisions: defineTable({
    offeringRef: v.string(),
    businessId: v.id('businesses'),
    revision: v.number(),
    name: v.string(),
    category: v.string(),
    summary: v.string(),
    serviceAreaSummary: v.optional(v.string()),
    availabilitySummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    price: v.optional(offeringPrice),
    comparison: v.optional(offeringComparisonEnvelope),
    sourceHash: v.string(),
    createdAt: v.number(),
  })
    .index('by_offeringRef_and_revision', ['offeringRef', 'revision'])
    .index('by_businessId_and_createdAt', ['businessId', 'createdAt']),

  offeringAccessPaths: defineTable({
    accessPathRef: v.string(),
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    offeringSourceHash: v.string(),
    status: literalUnion(OfferingAccessPathStatusValues),
    descriptor: v.union(humanRequestAccessPath, externalOperationAccessPath),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_accessPathRef', ['accessPathRef'])
    .index('by_offeringRef_and_status', ['offeringRef', 'status'])
    .index('by_offeringRef_and_offeringRevision', ['offeringRef', 'offeringRevision'])
    .index('by_businessId_and_status', ['businessId', 'status']),
  businessSupplyProjectionSnapshots: defineTable(
    v.union(currentBusinessSupplyProjectionSnapshot, legacyBusinessSupplyProjectionSnapshot),
  ).index('by_businessId', ['businessId']),



} as const

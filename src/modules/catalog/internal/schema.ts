import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  BusinessOfferingStatusValues,
  BusinessServiceStatusValues,
  CapabilityKindValues,
  ExternalOperationProvenanceValues,
  FirstRequestModeValues,
  HumanRequestChannelValues,
  OfferingAccessPathStatusValues,
  PublicFirstRequestChannelValues,
  ServiceCapabilityStatusValues,
} from '@/modules/catalog/public'


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

  legacyOfferingCrosswalks: defineTable({
    businessId: v.id('businesses'),
    serviceId: v.id('businessServices'),
    serviceSourceHash: v.string(),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    offeringSourceHash: v.string(),
    accessPathRefs: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_serviceId', ['serviceId'])
    .index('by_businessId_and_offeringRef', ['businessId', 'offeringRef']),

  catalogSupplyCutovers: defineTable({
    businessId: v.id('businesses'),
    mode: v.union(v.literal('legacy'), v.literal('compare'), v.literal('offering')),
    expectedProjectionDigest: v.optional(v.string()),
    latestProjectionDigest: v.optional(v.string()),
    lastCheckStatus: v.union(v.literal('not_run'), v.literal('matched'), v.literal('mismatch')),
    postCutoverNativeChanges: v.boolean(),
    updatedAt: v.number(),
  }).index('by_businessId', ['businessId']),

  catalogProjectionChecks: defineTable({
    businessId: v.id('businesses'),
    checkRef: v.string(),
    mode: v.union(v.literal('legacy'), v.literal('compare'), v.literal('offering')),
    expectedDigest: v.string(),
    observedDigest: v.string(),
    status: v.union(v.literal('matched'), v.literal('mismatch')),
    errorCode: v.optional(v.string()),
    observedAt: v.number(),
  })
    .index('by_checkRef', ['checkRef'])
    .index('by_businessId_and_observedAt', ['businessId', 'observedAt']),

  businessSupplyProjectionSnapshots: defineTable({
    businessId: v.id('businesses'),
    sourceRevision: v.number(),
    sourceDigest: v.string(),
    observedAt: v.number(),
    disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
    projectionJson: v.string(),
    status: v.union(v.literal('current'), v.literal('projection_pending')),
    lastErrorCode: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_businessId', ['businessId']),

  businessServices: defineTable({
    businessId: v.id('businesses'),
    serviceSlug: v.string(),
    name: v.string(),
    category: v.string(),
    summary: v.string(),
    serviceArea: v.string(),
    hoursOrUnknown: v.string(),
    status: literalUnion(BusinessServiceStatusValues),
    sortOrder: v.number(),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_business_status', ['businessId', 'status'])
    .index('by_slug_serviceSlug', ['serviceSlug', 'businessId']),

  serviceCapabilities: defineTable({
    businessId: v.id('businesses'),
    serviceId: v.id('businessServices'),
    kind: literalUnion(CapabilityKindValues),
    status: literalUnion(ServiceCapabilityStatusValues),
    firstRequestMode: literalUnion(FirstRequestModeValues),
    publicDisclosure: v.string(),
    publicChannel: literalUnion(PublicFirstRequestChannelValues),
    noContactReason: v.optional(v.string()),
    callable: v.literal(false),
    paymentRequired: v.literal(false),
    reason: v.optional(v.string()),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_business_service_status', ['businessId', 'serviceId', 'status'])
    .index('by_business_service_kind', ['businessId', 'serviceId', 'kind']),
} as const

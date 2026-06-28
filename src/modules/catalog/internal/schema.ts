import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  BusinessServiceStatusValues,
  CapabilityKindValues,
  FirstRequestModeValues,
  PublicFirstRequestChannelValues,
  ServiceCapabilityStatusValues,
} from '@/modules/catalog/public'

export const catalogTables = {
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
  }).index('by_business_service_status', ['businessId', 'serviceId', 'status']),
} as const

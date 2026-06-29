import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import {
  InquiryMessageSenderValues,
  InquiryNotificationStatusValues,
  InquiryThreadStatusValues,
} from './schema'

const redactedJson = v.object({
  json: v.string(),
  payloadHash: v.string(),
})

export const inquiryTables = {
  inquiryThreads: defineTable({
    threadId: v.string(),
    businessId: v.id('businesses'),
    ownerId: v.id('owners'),
    serviceId: v.id('businessServices'),
    capabilityKind: v.string(),
    status: literalUnion(InquiryThreadStatusValues),
    firstMessageId: v.string(),
    sourceHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    version: v.number(),
    readAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
  })
    .index('by_threadId', ['threadId'])
    .index('by_business_status', ['businessId', 'status'])
    .index('by_owner_updatedAt', ['ownerId', 'updatedAt'])
    .index('by_service_status', ['serviceId', 'status']),

  inquiryMessages: defineTable({
    messageId: v.string(),
    threadId: v.string(),
    sender: literalUnion(InquiryMessageSenderValues),
    body: v.string(),
    bodyHash: v.string(),
    contactHash: v.optional(v.string()),
    redactedContact: v.optional(redactedJson),
    privateDeletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_messageId', ['messageId'])
    .index('by_thread_createdAt', ['threadId', 'createdAt']),

  inquiryNotifications: defineTable({
    notificationId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    recipientRole: v.union(v.literal('owner'), v.literal('customer')),
    status: literalUnion(InquiryNotificationStatusValues),
    redactedPayload: redactedJson,
    failureCode: v.optional(v.string()),
    dispatchBindingsJson: v.optional(v.string()),
    dispatchIds: v.optional(v.array(v.string())),
    providerFamilies: v.optional(v.array(v.string())),
    dispatchStatuses: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_notificationId', ['notificationId'])
    .index('by_thread_status', ['threadId', 'status'])
    .index('by_message_recipient', ['messageId', 'recipientRole']),

  inquiryReadStates: defineTable({
    threadId: v.string(),
    ownerId: v.id('owners'),
    readAt: v.number(),
    operationKey: v.string(),
    correlationId: v.string(),
  }).index('by_owner_thread', ['ownerId', 'threadId']),

  inquiryAbuseBuckets: defineTable({
    key: v.string(),
    window: v.string(),
    count: v.number(),
    state: v.union(v.literal('open'), v.literal('limited')),
    resetAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_key_window', ['key', 'window'])
    .index('by_state_resetAt', ['state', 'resetAt']),

  inquiryPrivacyTombstones: defineTable({
    threadId: v.string(),
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    status: v.union(v.literal('requested'), v.literal('applied'), v.literal('held')),
    operationKey: v.string(),
    correlationId: v.string(),
    createdAt: v.number(),
    appliedAt: v.optional(v.number()),
  })
    .index('by_thread_status', ['threadId', 'status'])
    .index('by_business_createdAt', ['businessId', 'createdAt']),
} as const

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
  capabilityLaunchSupportRecords: defineTable({
    supportRecordId: v.string(), businessId: v.id('businesses'), capability: v.literal('human_inquiry_owner_inbox'),
    status: v.string(), reason: v.string(), evidenceRefs: v.array(v.string()),
    primaryOwnerRef: v.string(), primaryAdminOperatorRef: v.string(), backupOwnerRef: v.string(), backupAdminOperatorRef: v.string(),
    supportedStage: v.union(v.literal('manual_support'), v.literal('internal_alpha'), v.literal('public_alpha')),
    supportedChannels: v.array(v.string()), capacityThresholdJson: v.string(), backlogAgeThresholdMs: v.number(),
    phaseIncidentCountsJson: v.string(), supportEscalationPath: v.string(), claimDisablePath: v.string(),
    perChannelKillRulesJson: v.string(), sourceHash: v.string(), correlationId: v.string(), lastReviewedAt: v.number(),
    operatorNextAction: v.string(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_supportRecordId', ['supportRecordId']),

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
    customerReplyEmail: v.optional(v.string()),
    readAt: v.optional(v.number()),
    repliedAt: v.optional(v.number()),
    closedAt: v.optional(v.number()),
    originKind: v.optional(v.literal('answer_thread')),
    originThreadId: v.optional(v.string()),
  })
    .index('by_threadId', ['threadId'])
    .index('by_business_status', ['businessId', 'status'])
    .index('by_owner_updatedAt', ['ownerId', 'updatedAt'])
    .index('by_service_status', ['serviceId', 'status']),

  inquiryCustomerAccessGrants: defineTable({
    accessId: v.string(),
    threadId: v.string(),
    scope: v.literal('customer_record'),
    version: v.literal('inquiry-customer-access:v1'),
    verifier: v.string(),
    keyId: v.string(),
    status: v.union(v.literal('active'), v.literal('revoked')),
    createdAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_accessId', ['accessId'])
    .index('by_thread_status', ['threadId', 'status']),

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
    receiptErasureCount: v.number(),
    erasureEventIds: v.array(v.string()),
  })
    .index('by_thread_status', ['threadId', 'status'])
    .index('by_thread_operationKey', ['threadId', 'operationKey'])
    .index('by_business_createdAt', ['businessId', 'createdAt']),

  governedSendReceipts: defineTable({
    envelopeVersion: v.literal('inquiry-receipt-envelope:v1'),
    keyRef: v.string(),
    ciphertextBase64: v.string(),
    contentIvBase64: v.string(),
    digest: v.string(),
    algorithm: v.literal('sha256'),
    schemaVersion: v.number(),
    createdAt: v.number(),
    operationKey: v.string(),
    threadId: v.string(),
    admissionProof: v.object({
      version: v.literal('r1-target-admitted:v1'),
      admitted: v.literal(true),
      proof: v.object({
        kind: v.literal('claimed_owner'),
        claimRef: v.string(),
        recipientRef: v.string(),
        destinationVerifiedAt: v.optional(v.number()),
      }),
    }),
    recipientRef: v.string(),
  })
    .index('by_operationKey', ['operationKey'])
    .index('by_threadId_and_createdAt', ['threadId', 'createdAt']),

  governedSendIntegrityCommitments: defineTable({
    version: v.literal('governed-send-integrity:v1'),
    receiptRef: v.string(),
    operationKey: v.string(),
    threadId: v.string(),
    digest: v.string(),
    keyId: v.string(),
    targetBinding: v.object({
      businessId: v.id('businesses'),
      ownerId: v.id('owners'),
      serviceId: v.id('businessServices'),
      capabilityKind: v.string(),
      claimRef: v.string(),
      recipientRef: v.string(),
    }),
    signature: v.string(),
    createdAt: v.number(),
  })
    .index('by_operationKey', ['operationKey'])
    .index('by_threadId', ['threadId'])
    .index('by_receiptRef', ['receiptRef']),

  governedSendReceiptKeys: defineTable({
    keyRef: v.string(),
    receiptOperationKey: v.string(),
    wrappedKeyBase64: v.string(),
    wrapIvBase64: v.string(),
    kekKeyId: v.string(),
    createdAt: v.number(),
  })
    .index('by_keyRef', ['keyRef'])
    .index('by_receiptOperationKey', ['receiptOperationKey']),

  governedSendErasureLineage: defineTable({
    erasureEventId: v.string(),
    receiptOperationKey: v.string(),
    privacyOperationKey: v.string(),
    threadId: v.string(),
    digest: v.string(),
    keyRef: v.string(),
    reasonCode: v.string(),
    destroyedAt: v.number(),
    priorReceiptCommitment: v.string(),
    lineageHash: v.string(),
  })
    .index('by_erasureEventId', ['erasureEventId'])
    .index('by_receiptOperationKey', ['receiptOperationKey'])
    .index('by_thread_destroyedAt', ['threadId', 'destroyedAt']),
} as const

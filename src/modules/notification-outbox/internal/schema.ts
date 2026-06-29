import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { literalUnion } from '@/modules/common/convex-literals'
import type {
  BusinessId,
  CorrelationId,
  NotificationDispatchAttemptId,
  NotificationDispatchId,
  NotificationWebhookEventId,
  OperationKey,
  SourceHash,
} from '@/modules/common/ids'
import type { RedactedPayload } from '@/modules/observability/public'

export const NotificationProviderFamilyValues = ['resend', 'novu'] as const
export type NotificationProviderFamily = (typeof NotificationProviderFamilyValues)[number]

export const NotificationRecipientRoleValues = ['owner', 'customer'] as const
export type NotificationRecipientRole = (typeof NotificationRecipientRoleValues)[number]

export const NotificationDispatchStatusValues = [
  'queued',
  'triggered',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'delivery_delayed',
  'failed',
  'suppressed',
  'retry_scheduled',
  'retry_attempted',
  'retry_exhausted',
  'no_repair',
  'provider_missing',
  'orchestrator_missing',
] as const
export type NotificationDispatchStatus = (typeof NotificationDispatchStatusValues)[number]

export const NotificationAttemptStatusValues = [
  'pending',
  'triggered',
  'sent',
  'failed',
  'provider_missing',
  'orchestrator_missing',
] as const
export type NotificationAttemptStatus = (typeof NotificationAttemptStatusValues)[number]

export const NotificationWebhookEventStatusValues = [
  'accepted',
  'duplicate',
  'rejected',
  'held_for_operator',
] as const
export type NotificationWebhookEventStatus = (typeof NotificationWebhookEventStatusValues)[number]

export const NotificationSignatureStatusValues = ['verified', 'rejected'] as const
export type NotificationSignatureStatus = (typeof NotificationSignatureStatusValues)[number]

export type NotificationDispatchRecord = {
  dispatchId: NotificationDispatchId
  businessId: BusinessId
  inquiryThreadId: string
  inquiryMessageId: string
  recipientRole: NotificationRecipientRole
  providerFamily: NotificationProviderFamily
  status: NotificationDispatchStatus
  providerIdempotencyKey: string
  redactedPayload: RedactedPayload
  payloadHash: SourceHash
  resendMessageId?: string
  novuTransactionId?: string
  novuWorkflowId?: string
  novuMessageId?: string
  novuSubscriberId?: string
  providerMissing: boolean
  orchestratorMissing: boolean
  retryCount: number
  retryAfter?: number
  lastRedactedError?: string
  operationKey: OperationKey
  correlationId: CorrelationId
  createdAt: number
  updatedAt: number
}

export type NotificationDispatchAttemptRecord = {
  attemptId: NotificationDispatchAttemptId
  dispatchId: NotificationDispatchId
  providerFamily: NotificationProviderFamily
  status: NotificationAttemptStatus
  providerIdempotencyKey: string
  requestPayloadHash: SourceHash
  redactedRequestPayload: RedactedPayload
  providerResponseHash?: SourceHash
  redactedError?: string
  retryAfter?: number
  startedAt: number
  completedAt?: number
}

export type NotificationWebhookEventRecord = {
  webhookEventId: NotificationWebhookEventId
  providerFamily: NotificationProviderFamily
  providerEventId: string
  logicalObjectKey: string
  dispatchId?: NotificationDispatchId
  status: NotificationWebhookEventStatus
  eventType: string
  signatureStatus: NotificationSignatureStatus
  payloadHash: SourceHash
  redactedPayload: RedactedPayload
  reason?: string
  operationKey: OperationKey
  correlationId: CorrelationId
  receivedAt: number
}

export type NotificationOperatorAuthority = {
  role: 'owner_admin' | 'support' | 'reviewer'
  actorRef: string
}

export type NotificationOwnerAuthority = {
  ownerId: string
  businessId: BusinessId
}

export type NotificationOperatorControls = {
  notificationDispatchEnabled: boolean
  notificationWebhooksEnabled: boolean
}

export type NotificationOutboxSourceState = {
  dispatches: NotificationDispatchRecord[]
  attempts: NotificationDispatchAttemptRecord[]
  webhookEvents: NotificationWebhookEventRecord[]
  controls: NotificationOperatorControls
}

export type NotificationDispatchReadback = {
  dispatch: NotificationDispatchRecord
  attempts: readonly NotificationDispatchAttemptRecord[]
  webhookEvents: readonly NotificationWebhookEventRecord[]
  ownerCanRepair: false
  operatorNextAction: 'none' | 'retry_available' | 'operator_review_required' | 'terminal'
}

export const defaultNotificationOperatorControls: NotificationOperatorControls = {
  notificationDispatchEnabled: true,
  notificationWebhooksEnabled: true,
}

const providerRefFields = {
  resendMessageId: v.optional(v.string()),
  novuTransactionId: v.optional(v.string()),
  novuWorkflowId: v.optional(v.string()),
  novuMessageId: v.optional(v.string()),
  novuSubscriberId: v.optional(v.string()),
} as const

export const notificationOutboxTables = {
  notificationDispatches: defineTable({
    dispatchId: v.string(),
    businessId: v.id('businesses'),
    inquiryThreadId: v.string(),
    inquiryMessageId: v.string(),
    recipientRole: literalUnion(NotificationRecipientRoleValues),
    providerFamily: literalUnion(NotificationProviderFamilyValues),
    status: literalUnion(NotificationDispatchStatusValues),
    providerIdempotencyKey: v.string(),
    redactedPayloadJson: v.string(),
    payloadHash: v.string(),
    ...providerRefFields,
    providerMissing: v.boolean(),
    orchestratorMissing: v.boolean(),
    retryCount: v.number(),
    retryAfter: v.optional(v.number()),
    lastRedactedError: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_dispatchId', ['dispatchId'])
    .index('by_business_status', ['businessId', 'status'])
    .index('by_inquiry_thread', ['inquiryThreadId'])
    .index('by_provider_status', ['providerFamily', 'status']),

  notificationDispatchAttempts: defineTable({
    attemptId: v.string(),
    dispatchId: v.string(),
    providerFamily: literalUnion(NotificationProviderFamilyValues),
    status: literalUnion(NotificationAttemptStatusValues),
    providerIdempotencyKey: v.string(),
    requestPayloadHash: v.string(),
    redactedRequestPayloadJson: v.string(),
    providerResponseHash: v.optional(v.string()),
    redactedError: v.optional(v.string()),
    retryAfter: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_dispatch_startedAt', ['dispatchId', 'startedAt'])
    .index('by_provider_status', ['providerFamily', 'status']),

  notificationWebhookEvents: defineTable({
    webhookEventId: v.string(),
    providerFamily: literalUnion(NotificationProviderFamilyValues),
    providerEventId: v.string(),
    logicalObjectKey: v.string(),
    dispatchId: v.optional(v.string()),
    status: literalUnion(NotificationWebhookEventStatusValues),
    eventType: v.string(),
    signatureStatus: literalUnion(NotificationSignatureStatusValues),
    payloadHash: v.string(),
    redactedPayloadJson: v.string(),
    reason: v.optional(v.string()),
    operationKey: v.string(),
    correlationId: v.string(),
    receivedAt: v.number(),
  })
    .index('by_provider_event', ['providerFamily', 'providerEventId'])
    .index('by_dispatch', ['dispatchId'])
    .index('by_status_receivedAt', ['status', 'receivedAt']),
} as const

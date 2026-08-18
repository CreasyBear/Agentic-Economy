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

export const MAX_NOTIFICATION_ATTEMPTS_PER_DISPATCH = 100

export const MAX_NOTIFICATION_THREAD_DISPATCH_READBACK = 100

export const MAX_NOTIFICATION_WEBHOOK_EVENT_READBACK = 100

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

export const notificationOutboxTables = {} as const

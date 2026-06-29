import type { BusinessRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, CapabilityKind, ServiceCapabilityRecord } from '@/modules/catalog/public'
import type {
  Brand,
  BusinessId,
  CorrelationId,
  NotificationDispatchId,
  OperationKey,
  OwnerId,
  ServiceId,
  SourceHash,
} from '@/modules/common/ids'
import type { NotificationAttemptStatus, NotificationSignatureStatus, NotificationWebhookEventStatus } from '@/modules/notification-outbox/public'
import type { AuditEventType, FunnelEventType, RedactedPayload } from '@/modules/observability/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'
import type { AbuseRateLimitBucketRecord } from '@/modules/security/public'

export type InquiryThreadId = Brand<string, 'InquiryThreadId'>
export type InquiryMessageId = Brand<string, 'InquiryMessageId'>
export type InquiryNotificationId = Brand<string, 'InquiryNotificationId'>

export const InquiryThreadStatusValues = ['unread', 'read', 'replied', 'closed'] as const
export type InquiryThreadStatus = (typeof InquiryThreadStatusValues)[number]

export const InquiryMessageSenderValues = ['customer', 'owner'] as const
export type InquiryMessageSender = (typeof InquiryMessageSenderValues)[number]

export const InquiryNotificationStatusValues = ['queued', 'sent', 'failed', 'held'] as const
export type InquiryNotificationStatus = (typeof InquiryNotificationStatusValues)[number]

export const InquiryNotificationDispatchProviderValues = ['resend', 'novu'] as const
export type InquiryNotificationDispatchProvider = (typeof InquiryNotificationDispatchProviderValues)[number]

export const InquiryNotificationDispatchStatusValues = [
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
export type InquiryNotificationDispatchStatus = (typeof InquiryNotificationDispatchStatusValues)[number]

export const OwnerInboxBucketValues = ['unread', 'needs_reply', 'resolved'] as const
export type OwnerInboxBucket = (typeof OwnerInboxBucketValues)[number]

export const InquiryPrivacyTombstoneStatusValues = ['requested', 'applied', 'held'] as const
export type InquiryPrivacyTombstoneStatus = (typeof InquiryPrivacyTombstoneStatusValues)[number]

export const InquiryUnsafeFutureSurfaceFieldValues = [
  'ai',
  'agent',
  'autonomous',
  'booking',
  'schedule',
  'payment',
  'wallet',
  'stripe',
  'connect',
  'x402',
  'protectedAction',
  'action',
  'provider',
  'marketplace',
  'quoteAcceptance',
] as const
export type InquiryUnsafeFutureSurfaceField = (typeof InquiryUnsafeFutureSurfaceFieldValues)[number]

export type InquiryOwnerAuthority = {
  ownerId: OwnerId
}

export type InquiryTargetRef = {
  businessId: BusinessId
  serviceId: ServiceId
  capabilityKind: CapabilityKind
}

export type PublicInquiryContactInput = {
  name?: string
  email?: string
  phone?: string
}

export type InquiryOperatorControls = {
  inquiriesEnabled: boolean
  ownerRepliesEnabled: boolean
  notificationDispatchEnabled: boolean
  notificationReadbackReady: boolean
  ownerHandlingReady: boolean
  maxBodyLength: number
  abuseWindowMs: number
  abuseMaxSubmissionsPerWindow: number
}

export type InquiryCapabilityLaunchStage = 'internal_alpha' | 'manual_support' | 'public_alpha'

export type InquirySupportChannel =
  | 'public_inquiry'
  | 'owner_inbox'
  | 'email_notification'
  | 'provider_readback'
  | 'operator_readback'

export type InquirySupportCapacityThreshold = {
  maxOpenThreads: number
  maxFailedNotifications: number
}

export type InquiryPhaseIncidentCounts = {
  retryExhausted: number
  noRepair: number
  unresolvedDeliveryFailures: number
  abuseBlocked: number
  privacyDeletes: number
}

export type InquirySupportKillRule = {
  channel: InquirySupportChannel | 'public_claim'
  trigger: string
  action: string
}

export type CapabilityLaunchSupportRecord = {
  capability: 'human_inquiry_owner_inbox'
  primaryOwnerRef: string
  primaryAdminOperatorRef: string
  backupOwnerRef: string
  backupAdminOperatorRef: string
  supportedStage: InquiryCapabilityLaunchStage
  supportedChannels: InquirySupportChannel[]
  capacityThreshold: InquirySupportCapacityThreshold
  backlogAgeThresholdMs: number
  phaseIncidentCounts: InquiryPhaseIncidentCounts
  supportEscalationPath: string
  claimDisablePath: string
  perChannelKillRules: InquirySupportKillRule[]
  evidenceRefs: string[]
  sourceHash: SourceHash
  correlationId: CorrelationId
  lastReviewedAt: number
}

export type InquiryThreadRecord = {
  threadId: InquiryThreadId
  businessId: BusinessId
  ownerId: OwnerId
  serviceId: ServiceId
  capabilityKind: CapabilityKind
  status: InquiryThreadStatus
  firstMessageId: InquiryMessageId
  sourceHash: SourceHash
  createdAt: number
  updatedAt: number
  version: number
  readAt?: number
  repliedAt?: number
  closedAt?: number
}

export type InquiryMessageRecord = {
  messageId: InquiryMessageId
  threadId: InquiryThreadId
  sender: InquiryMessageSender
  body: string
  bodyHash: SourceHash
  createdAt: number
  contactHash?: SourceHash
  redactedContact?: RedactedPayload
  privateDeletedAt?: number
}

export type InquiryNotificationRecord = {
  notificationId: InquiryNotificationId
  threadId: InquiryThreadId
  messageId: InquiryMessageId
  recipientRole: 'owner' | 'customer'
  status: InquiryNotificationStatus
  redactedPayload: RedactedPayload
  payloadHash: SourceHash
  createdAt: number
  updatedAt: number
  failureCode?: string
  dispatchBindings: InquiryNotificationDispatchBinding[]
}

export type InquiryNotificationDispatchBinding = {
  dispatchId: NotificationDispatchId
  providerFamily: InquiryNotificationDispatchProvider
  status: InquiryNotificationDispatchStatus
  providerIdempotencyKey: string
  payloadHash: SourceHash
  operatorNextAction: 'none' | 'retry_available' | 'operator_review_required' | 'terminal'
  updatedAt: number
}

export type InquiryAuditRecord = {
  eventType: AuditEventType
  actorKind: 'anonymous' | 'owner' | 'system'
  actorRef: string
  targetType: 'inquiry' | 'notification'
  targetRef: string
  businessId: BusinessId
  operationKey: OperationKey
  correlationId: CorrelationId
  beforeState?: string
  afterState?: string
  redactedPayload: RedactedPayload
  payloadHash: SourceHash
  createdAt: number
}

export type InquiryFunnelRecord = {
  eventType: FunnelEventType
  businessId: BusinessId
  correlationId: CorrelationId
  pseudonymousSessionId: string
  redactedPayload: RedactedPayload
  payloadHash: SourceHash
  createdAt: number
}

export type InquiryOperationRecord = {
  operationKey: OperationKey
  requestHash: SourceHash
  resultCode: string
  threadId?: InquiryThreadId
  messageId?: InquiryMessageId
  notificationId?: InquiryNotificationId
  createdAt: number
}

export type InquiryPrivacyTombstoneRecord = {
  threadId: InquiryThreadId
  businessId: BusinessId
  reasonCode: string
  status: InquiryPrivacyTombstoneStatus
  operationKey: OperationKey
  correlationId: CorrelationId
  createdAt: number
  appliedAt?: number
}

export type InquirySourceState = {
  businesses: BusinessRecord[]
  businessServices: BusinessServiceRecord[]
  serviceCapabilities: ServiceCapabilityRecord[]
  suppressionRules: SuppressionRuleRecord[]
  threads: InquiryThreadRecord[]
  messages: InquiryMessageRecord[]
  notifications: InquiryNotificationRecord[]
  abuseRateLimitBuckets: AbuseRateLimitBucketRecord[]
  auditEvents: InquiryAuditRecord[]
  funnelEvents: InquiryFunnelRecord[]
  operations: InquiryOperationRecord[]
  privacyTombstones: InquiryPrivacyTombstoneRecord[]
  operatorControls: InquiryOperatorControls
  capabilityLaunchSupportRecords: CapabilityLaunchSupportRecord[]
}

export type OwnerInboxDeliveryCounts = Record<InquiryNotificationStatus, number>
export type OwnerInboxBucketCounts = Record<OwnerInboxBucket, number>

export type OwnerInboxInquiryProjection = {
  threadId: InquiryThreadId
  businessId: BusinessId
  serviceId: ServiceId
  capabilityKind: CapabilityKind
  businessName: string
  serviceName: string
  status: InquiryThreadStatus
  bucket: OwnerInboxBucket
  preview: string
  notificationStatus: InquiryNotificationStatus
  notificationLabel: string
  messageCount: number
  version: number
  submittedAt: number
  updatedAt: number
}

export type OwnerInboxMessageProjection = {
  messageId: InquiryMessageId
  sender: InquiryMessageSender
  body: string
  createdAt: number
}

export type OwnerInboxNotificationProjection = {
  notificationId: InquiryNotificationId
  messageId: InquiryMessageId
  recipientRole: 'owner' | 'customer'
  status: InquiryNotificationStatus
  label: string
  updatedAt: number
  failureCode?: string
  dispatchIds: readonly NotificationDispatchId[]
  providerFamilies: readonly InquiryNotificationDispatchProvider[]
  dispatchStatuses: readonly InquiryNotificationDispatchStatus[]
  dispatchBindings: readonly InquiryNotificationDispatchBinding[]
}

export type OwnerInboxReadback = {
  ownerId: OwnerId
  empty: boolean
  buckets: OwnerInboxBucketCounts
  delivery: OwnerInboxDeliveryCounts
  inquiries: readonly OwnerInboxInquiryProjection[]
}

export type OwnerInquiryDetailReadback = {
  inquiry: OwnerInboxInquiryProjection
  messages: readonly OwnerInboxMessageProjection[]
  notifications: readonly OwnerInboxNotificationProjection[]
}

export type InquiryDeliveryReadback = {
  threadId: InquiryThreadId
  notifications: readonly OwnerInboxNotificationProjection[]
}

export type InquiryExportMessageProjection = OwnerInboxMessageProjection & {
  bodyHash: SourceHash
  contactHash?: SourceHash
  privateDeletedAt?: number
}

export type InquiryExportReadback = {
  thread: OwnerInboxInquiryProjection
  messages: readonly InquiryExportMessageProjection[]
  notifications: readonly OwnerInboxNotificationProjection[]
  auditRefs: readonly {
    eventType: AuditEventType
    targetRef: string
    payloadHash: SourceHash
    createdAt: number
  }[]
  tombstones: readonly InquiryPrivacyTombstoneRecord[]
}

export type InquiryOperatorReconstructionFilter = {
  threadId?: InquiryThreadId | string
  correlationId?: CorrelationId | string
  dispatchId?: NotificationDispatchId | string
}

export type InquiryOperatorNextAction = 'none' | 'retry_available' | 'operator_review_required' | 'terminal'

export type InquiryOperatorMessageRef = {
  messageId: InquiryMessageId
  sender: InquiryMessageSender
  bodyHash: SourceHash
  createdAt: number
  contactHash?: SourceHash
  privateDeletedAt?: number
}

export type InquiryOperatorNotificationRef = {
  notificationId: InquiryNotificationId
  messageId: InquiryMessageId
  recipientRole: 'owner' | 'customer'
  status: InquiryNotificationStatus
  payloadHash: SourceHash
  updatedAt: number
  failureCode?: string
  dispatchIds: readonly NotificationDispatchId[]
}

export type InquiryOperatorDispatchAttemptRef = {
  attemptId: string
  providerFamily: InquiryNotificationDispatchProvider
  status: NotificationAttemptStatus
  requestPayloadHash: SourceHash | string
  providerResponseHash?: SourceHash | string
  retryAfter?: number
  startedAt: number
  completedAt?: number
}

export type InquiryOperatorWebhookRef = {
  webhookEventId: string
  providerFamily: InquiryNotificationDispatchProvider
  providerEventId: string
  logicalObjectKey: string
  status: NotificationWebhookEventStatus
  eventType: string
  signatureStatus: NotificationSignatureStatus
  payloadHash: SourceHash | string
  reason?: string
  operationKey: OperationKey | string
  correlationId: CorrelationId | string
  receivedAt: number
}

export type InquiryOperatorDispatchRef = InquiryNotificationDispatchBinding & {
  attemptRefs: readonly InquiryOperatorDispatchAttemptRef[]
  webhookRefs: readonly InquiryOperatorWebhookRef[]
}

export type InquiryOperatorAuditRef = {
  eventType: string
  targetRef: string
  payloadHash: SourceHash | string
  operationKey: OperationKey | string
  correlationId: CorrelationId | string
  createdAt: number
}

export type InquiryOperatorFunnelRef = {
  eventType: string
  businessId: BusinessId | string
  payloadHash: SourceHash | string
  correlationId: CorrelationId | string
  createdAt: number
}

export type InquiryOperatorOperationRef = {
  operationKey: OperationKey | string
  requestHash: SourceHash | string
  resultCode: string
  createdAt: number
  threadId?: InquiryThreadId | string
  messageId?: InquiryMessageId | string
  notificationId?: InquiryNotificationId | string
  dispatchId?: NotificationDispatchId | string
  webhookEventId?: string
}

export type InquiryOperatorReconstructionRow = {
  rowId: string
  threadId: InquiryThreadId
  businessId: BusinessId
  serviceId: ServiceId
  status: InquiryThreadStatus
  sourceHash: SourceHash
  correlationIds: readonly (CorrelationId | string)[]
  operatorNextAction: InquiryOperatorNextAction
  messageRefs: readonly InquiryOperatorMessageRef[]
  notificationRefs: readonly InquiryOperatorNotificationRef[]
  dispatchRefs: readonly InquiryOperatorDispatchRef[]
  auditRefs: readonly InquiryOperatorAuditRef[]
  funnelRefs: readonly InquiryOperatorFunnelRef[]
  operationRefs: readonly InquiryOperatorOperationRef[]
  updatedAt: number
}

export type InquiryOperatorReconstructionSummary = {
  threads: number
  messages: number
  notifications: number
  dispatches: number
  needsRepair: number
  terminal: number
}

export type InquiryOperatorReconstructionAllowedReadback = {
  kind: 'allowed'
  httpStatus: 200
  generatedAt: number
  actorRef: string
  filter: InquiryOperatorReconstructionFilter
  summary: InquiryOperatorReconstructionSummary
  rows: readonly InquiryOperatorReconstructionRow[]
}

export type InquiryOperatorReconstructionDeniedReadback = {
  kind: 'denied'
  httpStatus: 401 | 403
  reason: 'missing_membership' | 'inactive_membership' | 'action_not_allowed'
  generatedAt: number
  publicMessage: string
  filter: InquiryOperatorReconstructionFilter
  rows: readonly []
}

export type InquiryOperatorReconstructionReadback =
  | InquiryOperatorReconstructionAllowedReadback
  | InquiryOperatorReconstructionDeniedReadback

export const defaultInquiryOperatorControls: InquiryOperatorControls = {
  inquiriesEnabled: true,
  ownerRepliesEnabled: true,
  notificationDispatchEnabled: true,
  notificationReadbackReady: true,
  ownerHandlingReady: true,
  maxBodyLength: 2_000,
  abuseWindowMs: 60_000,
  abuseMaxSubmissionsPerWindow: 5,
}

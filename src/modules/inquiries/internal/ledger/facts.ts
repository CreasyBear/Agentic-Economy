import type { BusinessRecord } from '@/modules/business/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  GOVERNED_ACTION_DIGEST_ALGORITHM,
} from '@/modules/governed-action/public'
import type { AdmissionBlocker } from '../admission'
import {
  verifyGovernedSendIntegrityCommitment,
  GOVERNED_SEND_SCHEMA_VERSION,
  type GovernedSendIntegrityCommitmentRecord,
  type GovernedSendIntegrityKeyring,
  type GovernedSendReceiptRecord,
} from '../governed-send'
import { normalizeInquiryWhitespace } from '../normalize-text'
import type {
  InquiryAuditRecord,
  InquiryFunnelRecord,
  InquiryMessageId,
  InquiryNotificationDispatchBinding,
  InquiryNotificationId,
  InquiryNotificationRecord,
  InquiryNotificationStatus,
  InquiryOperationRecord,
  InquiryOwnerAuthority,
  InquirySourceState,
  InquiryTargetRef,
  InquiryThreadId,
  InquiryThreadRecord,
} from '../schema'

export function notificationsForThread(state: InquirySourceState, threadId: InquiryThreadId): InquiryNotificationRecord[] {
  return state.notifications
    .filter((notification) => notification.threadId === threadId)
    .sort((left, right) => left.updatedAt - right.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))
}
export function notificationRecord(input: {
  notificationId: InquiryNotificationId
  threadId: InquiryThreadId
  messageId: InquiryMessageId
  recipientRole: 'owner' | 'customer'
  status: InquiryNotificationStatus
  redactedPayload: StableHashValue
  now: number
  failureCode?: string
}): InquiryNotificationRecord {
  const redactedPayload = input.redactedPayload
  return {
    notificationId: input.notificationId,
    threadId: input.threadId,
    messageId: input.messageId,
    recipientRole: input.recipientRole,
    status: input.status,
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
    dispatchBindings: [],
  }
}

export function notificationStatusFromDispatchBindings(
  fallback: InquiryNotificationStatus,
  dispatchBindings: readonly InquiryNotificationDispatchBinding[]
): InquiryNotificationStatus {
  if (dispatchBindings.length === 0) {
    return fallback
  }
  if (dispatchBindings.some((binding) => binding.status === 'sent' || binding.status === 'delivered' || binding.status === 'triggered')) {
    return 'sent'
  }
  if (
    dispatchBindings.every((binding) =>
      binding.status === 'failed' ||
      binding.status === 'provider_missing' ||
      binding.status === 'orchestrator_missing' ||
      binding.status === 'bounced' ||
      binding.status === 'complained'
    )
  ) {
    return 'failed'
  }
  if (
    dispatchBindings.some((binding) =>
      binding.status === 'queued' || binding.status === 'retry_scheduled' || binding.status === 'retry_attempted'
    )
  ) {
    return 'queued'
  }
  return fallback
}

export function auditRecord(input: {
  eventType: InquiryAuditRecord['eventType']
  actorKind: InquiryAuditRecord['actorKind']
  actorRef: string
  businessId: BusinessId
  operationKey: OperationKey
  correlationId: CorrelationId
  targetRef: string
  beforeState: string
  afterState: string
  redactedPayload: StableHashValue
  now: number
}): InquiryAuditRecord {
  return {
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    targetType: 'inquiry',
    targetRef: input.targetRef,
    businessId: input.businessId,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    redactedPayload: input.redactedPayload,
    payloadHash: canonicalDigest(input.redactedPayload),
    createdAt: input.now,
  }
}

export function funnelRecord(input: {
  eventType: InquiryFunnelRecord['eventType']
  businessId: BusinessId
  correlationId: CorrelationId
  pseudonymousSessionId: string
  redactedPayload: StableHashValue
  now: number
}): InquiryFunnelRecord {
  return {
    eventType: input.eventType,
    businessId: input.businessId,
    correlationId: input.correlationId,
    pseudonymousSessionId: input.pseudonymousSessionId,
    redactedPayload: input.redactedPayload,
    payloadHash: canonicalDigest(input.redactedPayload),
    createdAt: input.now,
  }
}

export function operationRecord(
  operationKey: OperationKey,
  requestHash: SourceHash,
  resultCode: string,
  createdAt: number,
  refs: { threadId?: InquiryThreadId; messageId?: InquiryMessageId; notificationId?: InquiryNotificationId } = {}
): InquiryOperationRecord {
  return {
    operationKey,
    requestHash,
    resultCode,
    createdAt,
    ...refs,
  }
}

export function replaceThread(
  state: InquirySourceState,
  thread: InquiryThreadRecord,
  auditEvents: readonly InquiryAuditRecord[],
  funnelEvents: readonly InquiryFunnelRecord[],
  operation: InquiryOperationRecord
): InquirySourceState {
  return {
    ...state,
    threads: state.threads.map((candidate) => (candidate.threadId === thread.threadId ? thread : candidate)),
    auditEvents: [...state.auditEvents, ...auditEvents],
    funnelEvents: [...state.funnelEvents, ...funnelEvents],
    operations: [...state.operations, operation],
  }
}
export function findOwnedThread(
  state: InquirySourceState,
  authority: InquiryOwnerAuthority,
  threadId: InquiryThreadId
): InquiryThreadRecord | undefined {
  const thread = findThread(state, threadId)
  if (thread === undefined) {
    return undefined
  }

  const business = state.businesses.find((candidate) => candidate.businessId === thread.businessId)
  return business?.ownerId === authority.ownerId ? thread : undefined
}

export function findThread(state: InquirySourceState, threadId: InquiryThreadId): InquiryThreadRecord | undefined {
  return state.threads.find((candidate) => candidate.threadId === threadId)
}

export function findOperation(state: InquirySourceState, operationKey: OperationKey): InquiryOperationRecord | undefined {
  return state.operations.find((operation) => operation.operationKey === operationKey)
}
export function validatedGovernedSendBusiness(
  state: InquirySourceState,
  receipt: GovernedSendReceiptRecord,
  commitment: GovernedSendIntegrityCommitmentRecord,
  keyring: GovernedSendIntegrityKeyring,
): BusinessRecord | undefined {
  if (
    receipt.algorithm !== GOVERNED_ACTION_DIGEST_ALGORITHM ||
    receipt.schemaVersion !== GOVERNED_SEND_SCHEMA_VERSION ||
    receipt.recipientRef !== receipt.admissionProof.proof.recipientRef ||
    !verifyGovernedSendIntegrityCommitment({ receipt, commitment, keyring })
  ) return undefined

  const binding = commitment.targetBinding
  const operations = state.operations.filter(
    (candidate) => candidate.operationKey === receipt.operationKey &&
      candidate.threadId === receipt.threadId &&
      candidate.resultCode === 'inquiry_submitted',
  )
  const threads = state.threads.filter((candidate) => candidate.threadId === receipt.threadId)
  const businesses = state.businesses.filter((candidate) => candidate.businessId === binding.businessId)
  const claims = state.claims.filter((candidate) => String(candidate.claimId) === binding.claimRef)
  const offerings = state.businessOfferings.filter(
    (candidate) => candidate.offeringRef === binding.offeringRef && candidate.businessId === binding.businessId,
  )
  if (
    operations.length !== 1 ||
    threads.length !== 1 ||
    businesses.length !== 1 ||
    claims.length !== 1 ||
    offerings.length !== 1
  ) return undefined

  const thread = threads[0]
  const business = businesses[0]
  const claim = claims[0]
  const offering = offerings[0]
  if (thread === undefined || business === undefined || claim === undefined || offering === undefined) return undefined
  if (
    receipt.admissionProof.proof.claimRef !== binding.claimRef ||
    receipt.recipientRef !== binding.recipientRef ||
    thread.businessId !== binding.businessId ||
    thread.ownerId !== binding.ownerId ||
    thread.offeringRef !== binding.offeringRef ||
    business.ownerId !== binding.ownerId ||
    claim.businessId !== binding.businessId ||
    claim.ownerId !== binding.ownerId ||
    offering.businessId !== binding.businessId ||
    offering.offeringRef !== binding.offeringRef
  ) return undefined

  return business
}
export function latestNotification(state: InquirySourceState, threadId: InquiryThreadId): InquiryNotificationRecord | undefined {
  return state.notifications
    .filter((notification) => notification.threadId === threadId)
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))[0]
}
export function preview(value: string): string {
  const normalized = normalizeInquiryWhitespace(value)
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93)}...`
}


export function isBlank(value: string): boolean {
  return value.trim().length === 0
}

export function requestTarget(target: InquiryTargetRef): StableHashValue {
  return {
    businessId: target.businessId,
    offeringRef: target.offeringRef,
  }
}

export function inquiryThreadId(value: StableHashValue): InquiryThreadId {
  return brandNonEmpty(`inquiry_thread:${canonicalDigest(value)}`, 'InquiryThreadId')
}

export function inquiryMessageId(value: StableHashValue): InquiryMessageId {
  return brandNonEmpty(`inquiry_message:${canonicalDigest(value)}`, 'InquiryMessageId')
}

export function inquiryNotificationId(value: StableHashValue): InquiryNotificationId {
  return brandNonEmpty(`inquiry_notification:${canonicalDigest(value)}`, 'InquiryNotificationId')
}

export function admissionError(
  code: 'inquiry_target_not_admitted' | 'inquiry_target_admission_conflict',
  blockers: readonly AdmissionBlocker[],
) {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason: code === 'inquiry_target_admission_conflict'
      ? 'This business can no longer receive this inquiry.'
      : 'This business cannot receive inquiries yet.',
    blockers,
  }
}

export function error<Code extends string>(code: Code, reason: string, field?: string) {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason,
    ...(field === undefined ? {} : { field }),
  }
}

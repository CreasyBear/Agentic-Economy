import type { BusinessRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, ServiceCapabilityRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import { stableHash, stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import type { ModuleResult } from '@/modules/common/result'
import {
  GOVERNED_ACTION_DIGEST_ALGORITHM,
  GOVERNED_ACTION_WIRE_FORMAT,
  encodeGovernedAction,
  verifyGovernedActionBytes,
} from '@/modules/governed-action/public'
import { rateLimitClaim } from '@/modules/security/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'
import { evaluateR1TargetAdmission, type AdmissionBlocker, type R1TargetAdmissionState } from './admission'
import {
  accessIdFromInquiryCustomerAccessKey,
  issueInquiryCustomerAccess,
  mintInquiryCustomerAccessKey,
  verifyInquiryCustomerAccess,
  type InquiryCustomerAccessKeyring,
} from './customer-access'
import {
  defaultInquiryOperatorControls,
  InquiryUnsafeFutureSurfaceFieldValues,
  type CapabilityLaunchSupportRecord,
  type InquiryAuditRecord,
  type InquiryCustomerRecordReadback,
  type InquiryDeliveryReadback,
  type InquiryExportMessageProjection,
  type InquiryExportReadback,
  type InquiryFunnelRecord,
  type InquiryMessageId,
  type InquiryMessageRecord,
  type InquiryNotificationDispatchBinding,
  type InquiryNotificationId,
  type InquiryNotificationRecord,
  type InquiryNotificationStatus,
  type InquiryOperatorDispatchRef,
  type InquiryOperatorFunnelRef,
  type InquiryOperatorNextAction,
  type InquiryOperatorNotificationRef,
  type InquiryOperatorOperationRef,
  type InquiryOperatorReconstructionAllowedReadback,
  type InquiryOperatorReconstructionFilter,
  type InquiryOperatorReconstructionRow,
  type InquiryOperationRecord,
  type InquiryOwnerAuthority,
  type InquiryPrivacyTombstoneRecord,
  type InquirySourceState,
  type InquiryTargetRef,
  type InquiryThreadId,
  type InquiryThreadRecord,
  type OwnerInboxBucket,
  type OwnerInboxDeliveryCounts,
  type OwnerInboxInquiryProjection,
  type OwnerInboxOriginProjection,
  type OwnerInboxMessageProjection,
  type OwnerInboxNotificationProjection,
  type OwnerInboxReadback,
  type OwnerInquiryDetailReadback,
  type PublicInquiryContactInput,
} from './schema'
import {
  createGovernedSendIntegrityCommitment,
  buildGovernedSendIntent,
  GOVERNED_SEND_CANONICAL_FIELDS,
  GOVERNED_SEND_SCHEMA_VERSION,
  GOVERNED_SEND_ACTION_CLASS,
  verifyGovernedSendIntegrityCommitment,
  type GovernedSendCanonicalFieldKey,
  type GovernedSendErasureLineageRecord,
  type GovernedSendIntegrityCommitmentRecord,
  type GovernedSendIntegrityKeyring,
  type GovernedSendReceiptRecord,
} from './governed-send'
import { inquiryReceiptKeyRef } from './receipt-envelope'
import { findUnsafeInquiryActionIntent } from './policy'

export type SubmitInquiryCommand = {
  target: InquiryTargetRef
  body: string
  contact: PublicInquiryContactInput
  operationKey: OperationKey
  correlationId: CorrelationId
  pseudonymousSessionId: string
  abuseBucketKey: string
  now: number
  expectedDigest: string
  origin?: InquiryThreadRecord['origin']
  notificationStatus?: InquiryNotificationStatus
  notificationFailureCode?: string
  customerAccessKeyring: InquiryCustomerAccessKeyring
  governedSendIntegrityKeyring: GovernedSendIntegrityKeyring
  unsafeClientFields?: Record<string, unknown>
}

export type SubmitInquiryErrorCode =
  | 'inquiry_target_not_admitted'
  | 'inquiry_target_admission_conflict'
  | 'inquiry_invalid_input'
  | 'inquiry_digest_mismatch'
  | 'inquiry_integrity_conflict'
  | 'inquiry_duplicate_conflict'
  | 'inquiry_rate_limited'
  | 'inquiry_unsafe_action_intent'
  | 'inquiry_unsafe_future_surface_field'

export type SubmitInquiryResult = ModuleResult<
  'inquiry_submitted' | 'inquiry_replayed',
  SubmitInquiryErrorCode,
  {
    state: InquirySourceState
    thread: InquiryThreadRecord
    message: InquiryMessageRecord
    notification: InquiryNotificationRecord
    customerAccessKey: string
  },
  { reason: string; blockers?: readonly AdmissionBlocker[]; field?: string; retryAfter?: number; state?: InquirySourceState }
>

export type BindInquiryNotificationDispatchesCommand = {
  notificationId: InquiryNotificationId
  dispatchBindings: readonly InquiryNotificationDispatchBinding[]
  now: number
}

export type BindInquiryNotificationDispatchesResult = ModuleResult<
  'inquiry_notification_dispatches_bound',
  'inquiry_not_found',
  { state: InquirySourceState; notification: InquiryNotificationRecord },
  { reason: string }
>

export type OwnerInquiryCommandBase = {
  authority: InquiryOwnerAuthority
  threadId: InquiryThreadId
  operationKey: OperationKey
  correlationId: CorrelationId
  expectedVersion: number
  now: number
}

export type MarkInquiryReadCommand = OwnerInquiryCommandBase

export type ReplyToInquiryCommand = OwnerInquiryCommandBase & {
  body: string
  notificationStatus?: InquiryNotificationStatus
  notificationFailureCode?: string
}

export type CloseInquiryCommand = OwnerInquiryCommandBase

export type OwnerInquiryErrorCode =
  | 'inquiry_not_found'
  | 'inquiry_terminal'
  | 'inquiry_stale_version'
  | 'inquiry_invalid_input'
  | 'inquiry_duplicate_conflict'
  | 'inquiry_owner_replies_disabled'

export type MarkInquiryReadResult = ModuleResult<
  'inquiry_read_marked' | 'inquiry_read_replayed',
  OwnerInquiryErrorCode,
  { state: InquirySourceState; thread: InquiryThreadRecord },
  { reason: string }
>

export type ReplyToInquiryResult = ModuleResult<
  'inquiry_replied' | 'inquiry_reply_replayed',
  OwnerInquiryErrorCode,
  { state: InquirySourceState; thread: InquiryThreadRecord; message: InquiryMessageRecord; notification: InquiryNotificationRecord },
  { reason: string }
>

export type CloseInquiryResult = ModuleResult<
  'inquiry_closed' | 'inquiry_close_replayed',
  OwnerInquiryErrorCode,
  { state: InquirySourceState; thread: InquiryThreadRecord },
  { reason: string }
>

export type ReadOwnerInquiryResult = ModuleResult<
  'inquiry_read',
  'inquiry_not_found',
  { readback: OwnerInquiryDetailReadback },
  { reason: string }
>

export type ReadInquiryDeliveryResult = ModuleResult<
  'inquiry_delivery_read',
  'inquiry_not_found',
  { readback: InquiryDeliveryReadback },
  { reason: string }
>


export type ReadCustomerRecordResult = ModuleResult<
  'inquiry_customer_record_read',
  'inquiry_not_found' | 'inquiry_access_denied',
  { record: InquiryCustomerRecordReadback },
  { reason: string }
>

export type InquiryPrivacyErrorCode = 'inquiry_not_found' | 'inquiry_duplicate_conflict'

export type InquiryLaunchSupportReadiness =
  | {
      kind: 'ready'
      record: CapabilityLaunchSupportRecord
      openThreads: number
      failedNotifications: number
      oldestOpenThreadAgeMs: number
    }
  | {
      kind: 'blocked'
      reason: string
    }

export type RequestInquiryExportResult = ModuleResult<
  'inquiry_export_read',
  'inquiry_not_found',
  { exportData: InquiryExportReadback },
  { reason: string }
>

export type DeleteInquiryPrivateContentCommand = {
  authority: InquiryOwnerAuthority
  threadId: InquiryThreadId
  reasonCode: string
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type DeleteInquiryPrivateContentResult = ModuleResult<
  'inquiry_private_content_deleted' | 'inquiry_private_content_delete_replayed',
  InquiryPrivacyErrorCode,
  { state: InquirySourceState; tombstone: InquiryPrivacyTombstoneRecord },
  { reason: string }
>

export type ReadInquiryPrivacyTombstoneResult = ModuleResult<
  'inquiry_privacy_tombstone_read',
  'inquiry_not_found',
  { tombstones: readonly InquiryPrivacyTombstoneRecord[] },
  { reason: string }
>

export function createEmptyInquirySourceState(input: Partial<InquirySourceState> = {}): InquirySourceState {
  return {
    businesses: [],
    businessServices: [],
    serviceCapabilities: [],
    suppressionRules: [],
    owners: [],
    claims: [],
    resolvableOwnerRecipients: [],
    threads: [],
    messages: [],
    notifications: [],
    customerAccessGrants: [],
    abuseRateLimitBuckets: [],
    auditEvents: [],
    funnelEvents: [],
    governedSendReceipts: [],
    governedSendIntegrityCommitments: [],
    governedSendErasureLineage: [],
    operations: [],
    privacyTombstones: [],
    operatorControls: defaultInquiryOperatorControls,
    capabilityLaunchSupportRecords: [],
    ...input,
  }
}

export function evaluateInquiryLaunchSupportReadiness(state: InquirySourceState): InquiryLaunchSupportReadiness {
  const record = state.capabilityLaunchSupportRecords.find((candidate) => candidate.capability === 'human_inquiry_owner_inbox')
  if (record === undefined) {
    return { kind: 'blocked', reason: 'Support launch record is not ready for human inquiry.' }
  }

  if (
    isBlank(record.primaryOwnerRef) ||
    isBlank(record.primaryAdminOperatorRef) ||
    isBlank(record.backupOwnerRef) ||
    isBlank(record.backupAdminOperatorRef) ||
    isBlank(record.supportEscalationPath) ||
    isBlank(record.claimDisablePath) ||
    isBlank(record.sourceHash) ||
    isBlank(record.correlationId) ||
    record.supportedChannels.length === 0 ||
    record.perChannelKillRules.length === 0 ||
    record.evidenceRefs.length === 0 ||
    record.capacityThreshold.maxOpenThreads < 1 ||
    record.capacityThreshold.maxFailedNotifications < 0 ||
    record.backlogAgeThresholdMs < 1 ||
    record.lastReviewedAt < 1
  ) {
    return { kind: 'blocked', reason: 'Support launch record is incomplete for human inquiry.' }
  }

  const openThreads = state.threads.filter((thread) => thread.status !== 'closed')
  const failedNotifications = state.notifications.filter((notification) => notification.status === 'failed').length
  const oldestOpenThreadAgeMs =
    openThreads.length === 0 ? 0 : Math.max(0, record.lastReviewedAt - Math.min(...openThreads.map((thread) => thread.updatedAt)))

  if (openThreads.length >= record.capacityThreshold.maxOpenThreads) {
    return { kind: 'blocked', reason: 'Inquiry support capacity threshold is exceeded.' }
  }

  if (failedNotifications > record.capacityThreshold.maxFailedNotifications) {
    return { kind: 'blocked', reason: 'Inquiry delivery support threshold is exceeded.' }
  }

  if (oldestOpenThreadAgeMs > record.backlogAgeThresholdMs) {
    return { kind: 'blocked', reason: 'Inquiry support backlog age threshold is exceeded.' }
  }

  if (record.phaseIncidentCounts.retryExhausted > 0 || record.phaseIncidentCounts.noRepair > 0) {
    return { kind: 'blocked', reason: 'Inquiry support incidents must be reviewed before public claims continue.' }
  }

  return {
    kind: 'ready',
    record,
    openThreads: openThreads.length,
    failedNotifications,
    oldestOpenThreadAgeMs,
  }
}

export function submitInquiry(
  state: InquirySourceState,
  command: SubmitInquiryCommand,
  commitAdmissionState: R1TargetAdmissionState = state,
): SubmitInquiryResult {
  const unsafeField = findUnsafeFutureSurfaceField(command.unsafeClientFields)
  if (unsafeField !== undefined) {
    return error('inquiry_unsafe_future_surface_field', 'Public inquiry input cannot carry future-surface fields.', unsafeField)
  }

  const body = normalizeText(command.body)
  if (body.length === 0 || body.length > state.operatorControls.maxBodyLength) {
    return error('inquiry_invalid_input', 'Inquiry body must be non-empty and within the source-owned length cap.')
  }
  if (findUnsafeInquiryActionIntent(body) !== undefined) {
    return error(
      'inquiry_unsafe_action_intent',
      'Inquiry messages must ask for owner follow-up, not booking, payment, dispatch, or job acceptance.',
      'body'
    )
  }

  const contact = normalizeContact(command.contact)
  if (contact.kind === 'invalid') {
    return error('inquiry_invalid_input', contact.reason)
  }
  const governedEncoding = encodeGovernedAction(buildGovernedSendIntent({
    target: command.target,
    body,
    contact: command.contact,
    ...(command.origin === undefined ? {} : { origin: command.origin }),
  }))
  if (governedEncoding.kind === 'refused') {
    return error(
      'inquiry_invalid_input',
      `Canonical governed send refused: ${governedEncoding.code} at ${governedEncoding.path}.`,
    )
  }
  if (command.expectedDigest === undefined || command.expectedDigest !== governedEncoding.digest) {
    return error('inquiry_digest_mismatch', 'The reviewed request no longer matches the request being sent.')
  }


  const requestHash = stableHash({
    target: requestTarget(command.target),
    body,
    contact: contact.hashInput,
    abuseBucketKey: command.abuseBucketKey,
    ...(command.origin === undefined ? {} : { origin: command.origin }),
  })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    const existingReceipts = state.governedSendReceipts.filter(
      (receipt) => receipt.operationKey === command.operationKey,
    )
    if (existingReceipts.length === 1 && existingReceipts[0]?.digest !== governedEncoding.digest) {
      return error('inquiry_digest_mismatch', 'The operation key was already used for a different reviewed request.')
    }
    if (existingOperation.resultCode === 'inquiry_submitted') {
      const existingCommitments = state.governedSendIntegrityCommitments.filter(
        (commitment) => commitment.operationKey === command.operationKey,
      )
      const existingReceipt = existingReceipts[0]
      const existingCommitment = existingCommitments[0]
      const canonicalBytesMatch = existingReceipt?.retention === 'erased' ||
        existingReceipt?.canonicalBytesBase64 === governedEncoding.canonicalBytesBase64
      if (
        existingReceipts.length !== 1 ||
        existingCommitments.length !== 1 ||
        existingReceipt === undefined ||
        existingCommitment === undefined ||
        !canonicalBytesMatch ||
        validatedGovernedSendBusiness(state, existingReceipt, existingCommitment, command.governedSendIntegrityKeyring) === undefined
      ) {
        return error('inquiry_integrity_conflict', 'The stored evidence for this inquiry operation failed integrity verification.')
      }
    } else if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different inquiry body.')
    }

    const replay = replaySubmit(state, existingOperation)
    if (replay !== undefined) {
      const existingGrant = state.customerAccessGrants.find((grant) => grant.threadId === replay.thread.threadId)
      const issued = existingGrant === undefined
        ? issueInquiryCustomerAccess({ threadId: replay.thread.threadId, now: command.now, keyring: command.customerAccessKeyring })
        : { grant: existingGrant, accessKey: mintInquiryCustomerAccessKey(existingGrant, command.customerAccessKeyring) }
      const replayState = existingGrant === undefined
        ? { ...state, customerAccessGrants: [...state.customerAccessGrants, issued.grant] }
        : state
      return { kind: 'ok', code: 'inquiry_replayed', ...replay, state: replayState, customerAccessKey: issued.accessKey }
    }
  }

  const target = resolveInquiryTarget(state, command.target)
  if (target.kind !== 'ready') {
    return admissionError('inquiry_target_not_admitted', target.blockers)
  }

  const abuseRateLimitBuckets = state.abuseRateLimitBuckets.map((bucket) => ({ ...bucket }))
  const rateLimitDecision = rateLimitClaim(abuseRateLimitBuckets, {
    scope: 'inquiry_submit',
    key: command.abuseBucketKey,
    now: command.now,
    limit: state.operatorControls.abuseMaxSubmissionsPerWindow,
    windowMs: state.operatorControls.abuseWindowMs,
  })
  if (rateLimitDecision.kind === 'limited') {
    return {
      kind: 'error',
      code: 'inquiry_rate_limited',
      retryable: true,
      reason: `Retry after ${rateLimitDecision.retryAfter}.`,
      retryAfter: rateLimitDecision.retryAfter,
      state: { ...state, abuseRateLimitBuckets },
    }
  }

  const bodyHash = stableHash(body)
  const contactHash = stableHash(contact.hashInput)
  const threadId = inquiryThreadId({
    businessId: target.business.businessId,
    serviceId: target.service.serviceId,
    capabilityKind: target.capability.kind,
    bodyHash,
    contactHash,
    operationKey: command.operationKey,
  })
  const messageId = inquiryMessageId({ threadId, sender: 'customer', operationKey: command.operationKey })
  const notificationId = inquiryNotificationId({ messageId, recipientRole: 'owner' })
  const notificationStatus = command.notificationStatus ?? (state.operatorControls.notificationDispatchEnabled ? 'queued' : 'held')
  const thread: InquiryThreadRecord = {
    threadId,
    businessId: target.business.businessId,
    ownerId: target.business.ownerId,
    serviceId: target.service.serviceId,
    capabilityKind: target.capability.kind,
    status: 'unread',
    firstMessageId: messageId,
    sourceHash: stableHash({
      threadId,
      bodyHash,
      contactHash,
      ...(command.origin === undefined ? {} : { origin: command.origin }),
    }),
    createdAt: command.now,
    updatedAt: command.now,
    version: 1,

    ...(contact.replyEmail === undefined ? {} : { customerReplyEmail: contact.replyEmail }),
    ...(command.origin === undefined ? {} : { origin: { ...command.origin } }),
  }
  const message: InquiryMessageRecord = {
    messageId,
    threadId,
    sender: 'customer',
    body,
    bodyHash,
    createdAt: command.now,
    contactHash,
    redactedContact: contact.redacted,
  }
  const redactedPayload = {
    businessId: target.business.businessId,
    serviceId: target.service.serviceId,
    capabilityKind: target.capability.kind,
    bodyHash,
    contactHash,
  }
  const notification = notificationRecord({
    notificationId,
    threadId,
    messageId,
    recipientRole: 'owner',
    status: notificationStatus,
    redactedPayload,
    now: command.now,
    ...(command.notificationFailureCode === undefined ? {} : { failureCode: command.notificationFailureCode }),
  })
  const auditEvent = auditRecord({
    eventType: 'inquiry.submitted',
    actorKind: 'anonymous',
    actorRef: `session:${command.pseudonymousSessionId}`,
    businessId: target.business.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    targetRef: threadId,
    beforeState: 'none',
    afterState: 'unread',
    redactedPayload: {
      ...redactedPayload,
      notificationStatus,
      ...(command.origin === undefined ? {} : { originKind: command.origin.kind }),
    },
    now: command.now,
  })
  const funnelEvent = funnelRecord({
    eventType: 'inquiry_submitted',
    businessId: target.business.businessId,
    correlationId: command.correlationId,
    pseudonymousSessionId: command.pseudonymousSessionId,
    redactedPayload: {
      threadId,
      serviceId: target.service.serviceId,
      notificationStatus,
      ...(command.origin === undefined ? {} : { originKind: command.origin.kind }),
    },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_submitted', command.now, {
    threadId,
    messageId,
    notificationId,
  })
  const commitAdmission = evaluateR1TargetAdmission(commitAdmissionState, command.target)
  if (!commitAdmission.admitted) {
    return admissionError('inquiry_target_admission_conflict', commitAdmission.blockers)
  }
  const issuedCustomerAccess = issueInquiryCustomerAccess({
    threadId,
    now: command.now,
    keyring: command.customerAccessKeyring,
  })
  const governedSendReceipt: GovernedSendReceiptRecord = {
    retention: 'recoverable',
    canonicalBytesBase64: governedEncoding.canonicalBytesBase64,
    digest: governedEncoding.digest,
    algorithm: GOVERNED_ACTION_DIGEST_ALGORITHM,
    schemaVersion: GOVERNED_SEND_SCHEMA_VERSION,
    createdAt: command.now,
    operationKey: command.operationKey,
    threadId,
    admissionProof: commitAdmission,
    recipientRef: commitAdmission.proof.recipientRef,
  }
  const governedSendIntegrityCommitment = createGovernedSendIntegrityCommitment({
    receipt: governedSendReceipt,
    targetBinding: {
      businessId: target.business.businessId,
      ownerId: target.business.ownerId,
      serviceId: target.service.serviceId,
      capabilityKind: target.capability.kind,
      claimRef: commitAdmission.proof.claimRef,
      recipientRef: commitAdmission.proof.recipientRef,
    },
    keyring: command.governedSendIntegrityKeyring,
  })
  const admittedSendEvent = funnelRecord({
    eventType: 'admitted_r1_send',
    businessId: target.business.businessId,
    correlationId: command.correlationId,
    pseudonymousSessionId: command.pseudonymousSessionId,
    redactedPayload: { threadId, serviceId: target.service.serviceId },
    now: command.now,
  })
  const nextState: InquirySourceState = {
    ...state,
    threads: [...state.threads, thread],
    messages: [...state.messages, message],
    notifications: [...state.notifications, notification],
    customerAccessGrants: [...state.customerAccessGrants, issuedCustomerAccess.grant],
    abuseRateLimitBuckets,
    auditEvents: [...state.auditEvents, auditEvent],
    funnelEvents: [...state.funnelEvents, funnelEvent, admittedSendEvent],
    governedSendReceipts: [...state.governedSendReceipts, governedSendReceipt],
    governedSendIntegrityCommitments: [...state.governedSendIntegrityCommitments, governedSendIntegrityCommitment],
    operations: [...state.operations, operation],
  }

  return {
    kind: 'ok',
    code: 'inquiry_submitted',
    state: nextState,
    thread,
    message,
    notification,
    customerAccessKey: issuedCustomerAccess.accessKey,
  }
}

export function listOwnerInbox(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; businessId?: BusinessId }
): OwnerInboxReadback {
  const ownedBusinessIds = new Set<BusinessId>()
  for (const business of state.businesses) {
    if (business.ownerId !== input.authority.ownerId) {
      continue
    }
    if (input.businessId !== undefined && business.businessId !== input.businessId) {
      continue
    }
    ownedBusinessIds.add(business.businessId)
  }
  const inquiries: OwnerInboxInquiryProjection[] = []
  for (const thread of state.threads) {
    if (ownedBusinessIds.has(thread.businessId)) {
      inquiries.push(projectInquiry(state, thread))
    }
  }
  inquiries.sort((left, right) => right.updatedAt - left.updatedAt || String(left.threadId).localeCompare(String(right.threadId)))
  const buckets = { unread: 0, needs_reply: 0, resolved: 0 }
  const delivery: OwnerInboxDeliveryCounts = { queued: 0, sent: 0, failed: 0, held: 0 }

  for (const inquiry of inquiries) {
    buckets[inquiry.bucket] += 1
    delivery[inquiry.notificationStatus] += 1
  }

  return {
    ownerId: input.authority.ownerId,
    empty: inquiries.length === 0,
    buckets,
    delivery,
    inquiries,
  }
}

export function readOwnerInquiry(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): ReadOwnerInquiryResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_read',
    readback: detailReadback(state, thread),
  }
}


export function readCustomerRecord(
  state: InquirySourceState,
  input: {
    threadId: InquiryThreadId
    accessKey: string
    keyring: InquiryCustomerAccessKeyring
    governedSendIntegrityKeyring: GovernedSendIntegrityKeyring
    now: number
  },
): ReadCustomerRecordResult {
  const thread = findThread(state, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry record was not found for this key.')
  }

  const accessId = accessIdFromInquiryCustomerAccessKey(input.accessKey)
  const grant = accessId === undefined
    ? undefined
    : state.customerAccessGrants.find((candidate) => candidate.accessId === accessId)
  if (!verifyInquiryCustomerAccess({
    grant,
    accessKey: input.accessKey,
    requestedThreadId: input.threadId,
    now: input.now,
    keyring: input.keyring,
  })) {
    return error('inquiry_access_denied', 'Inquiry record was not found for this key.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_customer_record_read',
    record: customerRecordReadback(state, thread, input.governedSendIntegrityKeyring),
  }
}

export function readInquiryOperatorReconstruction(
  state: InquirySourceState,
  filter: InquiryOperatorReconstructionFilter = {}
): InquiryOperatorReconstructionAllowedReadback {
  const rows = state.threads
    .filter((thread) => operatorThreadMatches(state, thread, filter))
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.threadId).localeCompare(String(right.threadId)))
    .map((thread) => operatorReconstructionRow(state, thread))

  return {
    kind: 'allowed',
    httpStatus: 200,
    generatedAt: Date.now(),
    actorRef: 'source:inquiry-operator-reconstruction',
    filter,
    summary: {
      threads: rows.length,
      messages: rows.reduce((count, row) => count + row.messageRefs.length, 0),
      notifications: rows.reduce((count, row) => count + row.notificationRefs.length, 0),
      dispatches: rows.reduce((count, row) => count + row.dispatchRefs.length, 0),
      needsRepair: rows.filter((row) => row.operatorNextAction === 'retry_available' || row.operatorNextAction === 'operator_review_required').length,
      terminal: rows.filter((row) => row.operatorNextAction === 'terminal').length,
    },
    rows,
  }
}

export function bindInquiryNotificationDispatches(
  state: InquirySourceState,
  command: BindInquiryNotificationDispatchesCommand
): BindInquiryNotificationDispatchesResult {
  const notification = state.notifications.find((candidate) => candidate.notificationId === command.notificationId)
  if (notification === undefined) {
    return error('inquiry_not_found', 'Inquiry notification was not found.')
  }

  const existingIds = new Set(notification.dispatchBindings.map((binding) => binding.dispatchId))
  const dispatchBindings = [
    ...notification.dispatchBindings,
    ...command.dispatchBindings.filter((binding) => !existingIds.has(binding.dispatchId)),
  ].sort((left, right) => String(left.dispatchId).localeCompare(String(right.dispatchId)))
  const nextNotification: InquiryNotificationRecord = {
    ...notification,
    status: notificationStatusFromDispatchBindings(notification.status, dispatchBindings),
    dispatchBindings,
    updatedAt: command.now,
  }

  return {
    kind: 'ok',
    code: 'inquiry_notification_dispatches_bound',
    state: {
      ...state,
      notifications: state.notifications.map((candidate) =>
        candidate.notificationId === nextNotification.notificationId ? nextNotification : candidate
      ),
    },
    notification: nextNotification,
  }
}

export function markInquiryRead(state: InquirySourceState, command: MarkInquiryReadCommand): MarkInquiryReadResult {
  const thread = findOwnedThread(state, command.authority, command.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  const requestHash = stableHash({ action: 'mark_read', threadId: command.threadId, ownerId: command.authority.ownerId })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different owner inquiry change.')
    }

    const replayThread = findThread(state, command.threadId)
    return replayThread === undefined
      ? error('inquiry_not_found', 'Inquiry was not found for this owner.')
      : { kind: 'ok', code: 'inquiry_read_replayed', state, thread: replayThread }
  }

  if (thread.status === 'closed') {
    return error('inquiry_terminal', 'Closed inquiries cannot be marked read again.')
  }
  if (thread.version !== command.expectedVersion) {
    return error('inquiry_stale_version', 'Inquiry version is stale.')
  }

  const nextThread: InquiryThreadRecord = {
    ...thread,
    status: thread.status === 'unread' ? 'read' : thread.status,
    readAt: thread.readAt ?? command.now,
    updatedAt: command.now,
    version: thread.version + 1,
  }
  const auditEvent = auditRecord({
    eventType: 'inquiry.read_marked',
    actorKind: 'owner',
    actorRef: command.authority.ownerId,
    businessId: thread.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    targetRef: thread.threadId,
    beforeState: thread.status,
    afterState: nextThread.status,
    redactedPayload: { threadId: thread.threadId, version: nextThread.version },
    now: command.now,
  })
  const funnelEvent = funnelRecord({
    eventType: 'owner_inquiry_read',
    businessId: thread.businessId,
    correlationId: command.correlationId,
    pseudonymousSessionId: `owner:${command.authority.ownerId}`,
    redactedPayload: { threadId: thread.threadId },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_read_marked', command.now, {
    threadId: thread.threadId,
  })
  const nextState = replaceThread(state, nextThread, [auditEvent], [funnelEvent], operation)

  return { kind: 'ok', code: 'inquiry_read_marked', state: nextState, thread: nextThread }
}

export function replyToInquiry(state: InquirySourceState, command: ReplyToInquiryCommand): ReplyToInquiryResult {
  const thread = findOwnedThread(state, command.authority, command.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  const body = normalizeText(command.body)
  if (body.length === 0 || body.length > state.operatorControls.maxBodyLength) {
    return error('inquiry_invalid_input', 'Reply body must be non-empty and within the source-owned length cap.')
  }

  const requestHash = stableHash({ action: 'reply', threadId: command.threadId, ownerId: command.authority.ownerId, body })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different owner reply.')
    }

    const replay = replayReply(state, existingOperation)
    if (replay !== undefined) {
      return { kind: 'ok', code: 'inquiry_reply_replayed', ...replay }
    }
  }

  if (!state.operatorControls.ownerRepliesEnabled) {
    return error('inquiry_owner_replies_disabled', 'Owner replies are disabled by source-owned controls.')
  }
  if (thread.status === 'closed') {
    return error('inquiry_terminal', 'Closed inquiries cannot receive replies.')
  }
  if (thread.version !== command.expectedVersion) {
    return error('inquiry_stale_version', 'Inquiry version is stale.')
  }

  const bodyHash = stableHash(body)
  const messageId = inquiryMessageId({ threadId: thread.threadId, sender: 'owner', bodyHash, operationKey: command.operationKey })
  const notificationId = inquiryNotificationId({ messageId, recipientRole: 'customer' })
  const nextThread: InquiryThreadRecord = {
    ...thread,
    status: 'replied',
    readAt: thread.readAt ?? command.now,
    repliedAt: command.now,
    updatedAt: command.now,
    version: thread.version + 1,
  }
  const message: InquiryMessageRecord = {
    messageId,
    threadId: thread.threadId,
    sender: 'owner',
    body,
    bodyHash,
    createdAt: command.now,
  }
  const notificationStatus = command.notificationStatus ?? (state.operatorControls.notificationDispatchEnabled ? 'queued' : 'held')
  const notification = notificationRecord({
    notificationId,
    threadId: thread.threadId,
    messageId,
    recipientRole: 'customer',
    status: notificationStatus,
    redactedPayload: { threadId: thread.threadId, bodyHash },
    now: command.now,
    ...(command.notificationFailureCode === undefined ? {} : { failureCode: command.notificationFailureCode }),
  })
  const auditEvent = auditRecord({
    eventType: 'inquiry.replied',
    actorKind: 'owner',
    actorRef: command.authority.ownerId,
    businessId: thread.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    targetRef: thread.threadId,
    beforeState: thread.status,
    afterState: nextThread.status,
    redactedPayload: { threadId: thread.threadId, messageId, bodyHash, notificationStatus },
    now: command.now,
  })
  const funnelEvent = funnelRecord({
    eventType: 'owner_inquiry_replied',
    businessId: thread.businessId,
    correlationId: command.correlationId,
    pseudonymousSessionId: `owner:${command.authority.ownerId}`,
    redactedPayload: { threadId: thread.threadId, notificationStatus },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_replied', command.now, {
    threadId: thread.threadId,
    messageId,
    notificationId,
  })
  const nextState: InquirySourceState = {
    ...replaceThread(state, nextThread, [auditEvent], [funnelEvent], operation),
    messages: [...state.messages, message],
    notifications: [...state.notifications, notification],
  }

  return { kind: 'ok', code: 'inquiry_replied', state: nextState, thread: nextThread, message, notification }
}

export function closeInquiry(state: InquirySourceState, command: CloseInquiryCommand): CloseInquiryResult {
  const thread = findOwnedThread(state, command.authority, command.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  const requestHash = stableHash({ action: 'close', threadId: command.threadId, ownerId: command.authority.ownerId })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different owner inquiry change.')
    }

    const replayThread = findThread(state, command.threadId)
    return replayThread === undefined
      ? error('inquiry_not_found', 'Inquiry was not found for this owner.')
      : { kind: 'ok', code: 'inquiry_close_replayed', state, thread: replayThread }
  }

  if (thread.status === 'closed') {
    return error('inquiry_terminal', 'Inquiry is already closed.')
  }
  if (thread.version !== command.expectedVersion) {
    return error('inquiry_stale_version', 'Inquiry version is stale.')
  }

  const nextThread: InquiryThreadRecord = {
    ...thread,
    status: 'closed',
    closedAt: command.now,
    updatedAt: command.now,
    version: thread.version + 1,
  }
  const auditEvent = auditRecord({
    eventType: 'inquiry.closed',
    actorKind: 'owner',
    actorRef: command.authority.ownerId,
    businessId: thread.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    targetRef: thread.threadId,
    beforeState: thread.status,
    afterState: nextThread.status,
    redactedPayload: { threadId: thread.threadId, version: nextThread.version },
    now: command.now,
  })
  const funnelEvent = funnelRecord({
    eventType: 'inquiry_closed',
    businessId: thread.businessId,
    correlationId: command.correlationId,
    pseudonymousSessionId: `owner:${command.authority.ownerId}`,
    redactedPayload: { threadId: thread.threadId },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_closed', command.now, {
    threadId: thread.threadId,
  })
  const nextState = replaceThread(state, nextThread, [auditEvent], [funnelEvent], operation)

  return { kind: 'ok', code: 'inquiry_closed', state: nextState, thread: nextThread }
}

export function readInquiryDeliveryReadback(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): ReadInquiryDeliveryResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_delivery_read',
    readback: {
      threadId: thread.threadId,
      notifications: notificationProjections(state, thread.threadId),
    },
  }
}

export function requestInquiryExport(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): RequestInquiryExportResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_export_read',
    exportData: exportReadback(state, thread),
  }
}

export function deleteInquiryPrivateContent(
  state: InquirySourceState,
  command: DeleteInquiryPrivateContentCommand
): DeleteInquiryPrivateContentResult {
  const thread = findOwnedThread(state, command.authority, command.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  const reasonCode = normalizeReasonCode(command.reasonCode)
  const requestHash = stableHash({
    action: 'delete_private_content',
    threadId: command.threadId,
    ownerId: command.authority.ownerId,
    reasonCode,
  })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different privacy delete request.')
    }

    const replayTombstone = findPrivacyTombstone(state, command.threadId, command.operationKey)
    return replayTombstone === undefined
      ? error('inquiry_not_found', 'Inquiry privacy tombstone was not found for this owner.')
      : { kind: 'ok', code: 'inquiry_private_content_delete_replayed', state, tombstone: replayTombstone }
  }

  const redactedThread = removeCustomerReplyEmail(thread)
  const receiptErasureLineage: GovernedSendErasureLineageRecord[] = state.governedSendReceipts
    .filter((receipt) => receipt.threadId === thread.threadId && receipt.retention === 'recoverable')
    .map((receipt) => {
      const keyRef = inquiryReceiptKeyRef(receipt)
      const erasureEventId = `governed-send-erasure:${stableHash({
        receiptOperationKey: String(receipt.operationKey),
        privacyOperationKey: String(command.operationKey),
        keyRef,
      })}`
      const priorReceiptCommitment = stableHash({
        operationKey: String(receipt.operationKey),
        threadId: String(receipt.threadId),
        digest: receipt.digest,
        schemaVersion: receipt.schemaVersion,
        recipientRef: receipt.recipientRef,
        keyRef,
      })
      const lineage = {
        erasureEventId,
        receiptOperationKey: receipt.operationKey,
        privacyOperationKey: command.operationKey,
        threadId: receipt.threadId,
        digest: receipt.digest,
        keyRef,
        reasonCode,
        destroyedAt: command.now,
        priorReceiptCommitment,
      }
      return { ...lineage, lineageHash: stableHash(lineage) }
    })
  const erasureEventIds = receiptErasureLineage.map((lineage) => lineage.erasureEventId)
  const tombstone: InquiryPrivacyTombstoneRecord = {
    threadId: thread.threadId,
    businessId: thread.businessId,
    reasonCode,
    status: 'applied',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    createdAt: command.now,
    appliedAt: command.now,
    receiptErasureCount: receiptErasureLineage.length,
    erasureEventIds,
  }
  const redactedMessages = state.messages.map((message) =>
    message.threadId === thread.threadId ? redactPrivateMessage(message, command.now) : message
  )
  const messageHashes: SourceHash[] = []
  for (const message of state.messages) {
    if (message.threadId === thread.threadId) {
      messageHashes.push(message.bodyHash)
    }
  }

  const auditEvent = auditRecord({
    eventType: 'inquiry.private_content_deleted',
    actorKind: 'owner',
    actorRef: command.authority.ownerId,
    businessId: thread.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    targetRef: thread.threadId,
    beforeState: 'private_content_present',
    afterState: 'private_content_deleted',
    redactedPayload: {
      threadId: thread.threadId,
      reasonCode,
      messageHashes,
    },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_private_content_deleted', command.now, {
    threadId: thread.threadId,
  })
  const nextState: InquirySourceState = {
    ...state,
    threads: state.threads.map((candidate) => (candidate.threadId === redactedThread.threadId ? redactedThread : candidate)),
    messages: redactedMessages,
    auditEvents: [...state.auditEvents, auditEvent],
    operations: [...state.operations, operation],
    privacyTombstones: [...state.privacyTombstones, tombstone],
    governedSendReceipts: state.governedSendReceipts.map((receipt) => {
      const lineage = receiptErasureLineage.find((candidate) => candidate.receiptOperationKey === receipt.operationKey)
      if (lineage === undefined || receipt.retention === 'erased') return receipt
      const { canonicalBytesBase64: _discardedCanonicalBytes, ...receiptMetadata } = receipt
      return {
        ...receiptMetadata,
        retention: 'erased' as const,
        erasedAt: command.now,
        erasureEventId: lineage.erasureEventId,
      }
    }),
    governedSendErasureLineage: [...state.governedSendErasureLineage, ...receiptErasureLineage],
  }

  return { kind: 'ok', code: 'inquiry_private_content_deleted', state: nextState, tombstone }
}

export function readInquiryPrivacyTombstone(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; threadId: InquiryThreadId }
): ReadInquiryPrivacyTombstoneResult {
  const thread = findOwnedThread(state, input.authority, input.threadId)
  if (thread === undefined) {
    return error('inquiry_not_found', 'Inquiry was not found for this owner.')
  }

  return {
    kind: 'ok',
    code: 'inquiry_privacy_tombstone_read',
    tombstones: state.privacyTombstones.filter((tombstone) => tombstone.threadId === thread.threadId),
  }
}

function resolveInquiryTarget(
  state: InquirySourceState,
  target: InquiryTargetRef
):
  | { kind: 'ready'; business: BusinessRecord; service: BusinessServiceRecord; capability: ServiceCapabilityRecord }
  | { kind: 'blocked'; blockers: readonly AdmissionBlocker[] } {
  const admission = evaluateR1TargetAdmission(state, target)
  if (!admission.admitted) {
    return { kind: 'blocked', blockers: admission.blockers }
  }

  const business = state.businesses.find((candidate) => candidate.businessId === target.businessId)
  const service = state.businessServices.find(
    (candidate) => candidate.businessId === target.businessId && candidate.serviceId === target.serviceId
  )
  const capability = state.serviceCapabilities.find(
    (candidate) =>
      candidate.businessId === target.businessId &&
      candidate.serviceId === target.serviceId &&
      candidate.kind === target.capabilityKind
  )
  if (business === undefined || service === undefined || capability === undefined) {
    return {
      kind: 'blocked',
      blockers: [{ kind: 'not_ready', ownerLabel: 'Finish inquiry setup' }],
    }
  }

  return { kind: 'ready', business, service, capability }
}

function normalizeContact(input: PublicInquiryContactInput):
  | { kind: 'valid'; hashInput: StableHashValue; redacted: { name: string; email: string; phone: string }; replyEmail?: string }
  | { kind: 'invalid'; reason: string } {
  const name = normalizeText(input.name ?? '')
  const email = normalizeText(input.email ?? '').toLowerCase()
  const phone = normalizeText(input.phone ?? '')

  if (email.length === 0 && phone.length === 0) {
    return { kind: 'invalid', reason: 'Inquiry contact requires an email or phone value.' }
  }
  if (email.length > 0 && (!email.includes('@') || email.includes(' '))) {
    return { kind: 'invalid', reason: 'Inquiry email contact is malformed.' }
  }
  if (phone.length > 0 && phone.replace(/\D/g, '').length < 6) {
    return { kind: 'invalid', reason: 'Inquiry phone contact is malformed.' }
  }

  return {
    kind: 'valid',
    hashInput: { name, email, phone },
    redacted: {
      name: name.length === 0 ? 'not supplied' : '[redacted]',
      email: email.length === 0 ? 'not supplied' : '[redacted]',
      phone: phone.length === 0 ? 'not supplied' : '[redacted]',
    },
    ...(email.length === 0 ? {} : { replyEmail: email }),
  }
}

function findUnsafeFutureSurfaceField(fields: Record<string, unknown> | undefined): string | undefined {
  if (fields === undefined) {
    return undefined
  }

  return Object.keys(fields).find((field) =>
    InquiryUnsafeFutureSurfaceFieldValues.some((unsafe) => field.toLowerCase().includes(unsafe.toLowerCase()))
  )
}

function replaySubmit(
  state: InquirySourceState,
  operation: InquiryOperationRecord
): { state: InquirySourceState; thread: InquiryThreadRecord; message: InquiryMessageRecord; notification: InquiryNotificationRecord } | undefined {
  if (operation.threadId === undefined || operation.messageId === undefined || operation.notificationId === undefined) {
    return undefined
  }

  const thread = findThread(state, operation.threadId)
  const message = state.messages.find((candidate) => candidate.messageId === operation.messageId)
  const notification = state.notifications.find((candidate) => candidate.notificationId === operation.notificationId)
  return thread === undefined || message === undefined || notification === undefined
    ? undefined
    : { state, thread, message, notification }
}

function replayReply(
  state: InquirySourceState,
  operation: InquiryOperationRecord
): { state: InquirySourceState; thread: InquiryThreadRecord; message: InquiryMessageRecord; notification: InquiryNotificationRecord } | undefined {
  return replaySubmit(state, operation)
}

function detailReadback(state: InquirySourceState, thread: InquiryThreadRecord): OwnerInquiryDetailReadback {
  return {
    inquiry: projectInquiry(state, thread),
    messages: state.messages
      .filter((message) => message.threadId === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.messageId).localeCompare(String(right.messageId)))
      .map(ownerMessageProjection),
    notifications: notificationProjections(state, thread.threadId),
  }
}

function operatorThreadMatches(
  state: InquirySourceState,
  thread: InquiryThreadRecord,
  filter: InquiryOperatorReconstructionFilter
): boolean {
  if (filter.threadId !== undefined && String(thread.threadId) !== String(filter.threadId)) {
    return false
  }

  const notifications = notificationsForThread(state, thread.threadId)
  if (
    filter.dispatchId !== undefined &&
    !notifications.some((notification) =>
      notification.dispatchBindings.some((binding) => String(binding.dispatchId) === String(filter.dispatchId))
    )
  ) {
    return false
  }

  if (filter.correlationId !== undefined && !threadHasCorrelation(state, thread, String(filter.correlationId))) {
    return false
  }

  return true
}

function threadHasCorrelation(state: InquirySourceState, thread: InquiryThreadRecord, correlationId: string): boolean {
  return (
    state.auditEvents.some((event) => event.targetRef === thread.threadId && String(event.correlationId) === correlationId) ||
    state.funnelEvents.some(
      (event) => event.businessId === thread.businessId && String(event.correlationId) === correlationId && funnelTargetsThread(event, thread.threadId)
    )
  )
}

function operatorReconstructionRow(state: InquirySourceState, thread: InquiryThreadRecord): InquiryOperatorReconstructionRow {
  const notifications = notificationsForThread(state, thread.threadId)
  const notificationIds = new Set(notifications.map((notification) => String(notification.notificationId)))
  const dispatchRefs = notifications.flatMap((notification) => operatorDispatchRefs(notification.dispatchBindings))
  const auditRefs = state.auditEvents
    .filter((event) => event.targetRef === thread.threadId || notificationIds.has(event.targetRef))
    .sort((left, right) => left.createdAt - right.createdAt || String(left.eventType).localeCompare(String(right.eventType)))
    .map((event) => ({
      eventType: event.eventType,
      targetRef: event.targetRef,
      payloadHash: event.payloadHash,
      operationKey: event.operationKey,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    }))
  const funnelRefs = state.funnelEvents
    .filter((event) => event.businessId === thread.businessId && funnelTargetsThread(event, thread.threadId))
    .sort((left, right) => left.createdAt - right.createdAt || String(left.eventType).localeCompare(String(right.eventType)))
    .map((event): InquiryOperatorFunnelRef => ({
      eventType: event.eventType,
      businessId: event.businessId,
      payloadHash: event.payloadHash,
      correlationId: event.correlationId,
      createdAt: event.createdAt,
    }))
  const operationRefs = state.operations
    .filter(
      (operation) =>
        operation.threadId === thread.threadId ||
        (operation.notificationId !== undefined && notificationIds.has(String(operation.notificationId)))
    )
    .sort((left, right) => left.createdAt - right.createdAt || String(left.operationKey).localeCompare(String(right.operationKey)))
    .map((operation): InquiryOperatorOperationRef => ({
      operationKey: operation.operationKey,
      requestHash: operation.requestHash,
      resultCode: operation.resultCode,
      createdAt: operation.createdAt,
      ...(operation.threadId === undefined ? {} : { threadId: operation.threadId }),
      ...(operation.messageId === undefined ? {} : { messageId: operation.messageId }),
      ...(operation.notificationId === undefined ? {} : { notificationId: operation.notificationId }),
    }))

  return {
    rowId: `inquiry-operator:${thread.threadId}`,
    threadId: thread.threadId,
    businessId: thread.businessId,
    serviceId: thread.serviceId,
    status: thread.status,
    sourceHash: thread.sourceHash,
    correlationIds: uniqueStrings([
      ...auditRefs.map((ref) => ref.correlationId),
      ...funnelRefs.map((ref) => ref.correlationId),
      ...supportCorrelationIdsForBusiness(state, thread.businessId),
    ]),
    operatorNextAction: operatorNextActionForThread(thread, notifications),
    messageRefs: state.messages
      .filter((message) => message.threadId === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.messageId).localeCompare(String(right.messageId)))
      .map((message) => ({
        messageId: message.messageId,
        sender: message.sender,
        bodyHash: message.bodyHash,
        createdAt: message.createdAt,
        ...(message.contactHash === undefined ? {} : { contactHash: message.contactHash }),
        ...(message.privateDeletedAt === undefined ? {} : { privateDeletedAt: message.privateDeletedAt }),
      })),
    notificationRefs: notifications.map(operatorNotificationRef),
    dispatchRefs,
    auditRefs,
    funnelRefs,
    operationRefs,
    updatedAt: thread.updatedAt,
  }
}

function notificationsForThread(state: InquirySourceState, threadId: InquiryThreadId): InquiryNotificationRecord[] {
  return state.notifications
    .filter((notification) => notification.threadId === threadId)
    .sort((left, right) => left.updatedAt - right.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))
}

function operatorNotificationRef(notification: InquiryNotificationRecord): InquiryOperatorNotificationRef {
  return {
    notificationId: notification.notificationId,
    messageId: notification.messageId,
    recipientRole: notification.recipientRole,
    status: notification.status,
    payloadHash: notification.payloadHash,
    updatedAt: notification.updatedAt,
    ...(notification.failureCode === undefined ? {} : { failureCode: notification.failureCode }),
    dispatchIds: notification.dispatchBindings.map((binding) => binding.dispatchId),
  }
}

function operatorDispatchRefs(bindings: readonly InquiryNotificationDispatchBinding[]): InquiryOperatorDispatchRef[] {
  return bindings.map((binding) => ({
    ...binding,
    attemptRefs: [],
    webhookRefs: [],
  }))
}

function operatorNextActionForThread(
  thread: InquiryThreadRecord,
  notifications: readonly InquiryNotificationRecord[]
): InquiryOperatorNextAction {
  const actions = notifications.flatMap((notification) => notification.dispatchBindings.map((binding) => binding.operatorNextAction))
  if (actions.includes('retry_available')) {
    return 'retry_available'
  }
  if (actions.includes('operator_review_required')) {
    return 'operator_review_required'
  }
  if (notifications.some((notification) => notification.status === 'failed' || notification.status === 'held')) {
    return 'operator_review_required'
  }
  if (actions.length > 0 && actions.every((action) => action === 'terminal')) {
    return 'terminal'
  }
  return thread.status === 'closed' ? 'terminal' : 'none'
}

function funnelTargetsThread(event: InquiryFunnelRecord, threadId: InquiryThreadId): boolean {
  return redactedPayloadHasValue(event.redactedPayload, String(threadId))
}

function supportCorrelationIdsForBusiness(state: InquirySourceState, businessId: BusinessId): string[] {
  const correlationIds: string[] = []
  for (const record of state.capabilityLaunchSupportRecords) {
    if (state.businesses.some((business) => business.businessId === businessId && business.ownerId === record.primaryOwnerRef)) {
      correlationIds.push(record.correlationId)
    }
  }
  return correlationIds
}

function redactedPayloadHasValue(value: StableHashValue, needle: string): boolean {
  if (value === needle) {
    return true
  }
  if (Array.isArray(value)) {
    return value.some((item) => redactedPayloadHasValue(item, needle))
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some((item) => redactedPayloadHasValue(item, needle))
  }
  return false
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => value !== undefined && value.length > 0))).sort()
}


type GovernedSendRecordProjection =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{
      kind: 'verified'
      business: BusinessRecord
      governedSend: NonNullable<InquiryCustomerRecordReadback['governedSend']>
    }>

const absentGovernedSendProjection = { kind: 'absent' } as const
const invalidGovernedSendProjection = { kind: 'invalid' } as const

function customerRecordReadback(
  state: InquirySourceState,
  thread: InquiryThreadRecord,
  keyring: GovernedSendIntegrityKeyring,
): InquiryCustomerRecordReadback {
  const governedSendProjection = governedSendRecordProjection(state, thread.threadId, keyring)
  const business = governedSendProjection.kind === 'verified'
    ? governedSendProjection.business
    : governedSendProjection.kind === 'absent'
      ? state.businesses.find((candidate) => candidate.businessId === thread.businessId)
      : undefined
  const firstMessage = state.messages.find((message) => message.messageId === thread.firstMessageId)
  const reply = state.messages
    .filter((message) => message.threadId === thread.threadId && message.sender === 'owner')
    .sort((left, right) => right.createdAt - left.createdAt || String(left.messageId).localeCompare(String(right.messageId)))[0]
  const deliveryNotification = state.notifications
    .filter((notification) => notification.threadId === thread.threadId && notification.recipientRole === 'owner')
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))[0]
  const deliveryState = deliveryNotification?.status ?? 'held'
  const deliveryUpdatedAt = deliveryNotification?.updatedAt ?? thread.updatedAt

  return {
    schemaVersion: 'inquiry-customer-record:v1',
    threadId: thread.threadId,
    business: {
      name: business?.name ?? 'Business unavailable',
      slug: business?.slug ?? '',
    },
    submitted: {
      messageSummary: preview(firstMessage?.body ?? ''),
      submittedAt: thread.createdAt,
    },
    ...(governedSendProjection.kind === 'verified'
      ? { governedSend: governedSendProjection.governedSend }
      : {}),
    delivery: {
      state: deliveryState,
      label: customerDeliveryLabel(deliveryState),
      updatedAt: deliveryUpdatedAt,
    },
    timeline: customerTimeline(thread, deliveryState, deliveryUpdatedAt, reply),
    ...(reply === undefined ? {} : { reply: { body: messageBodyForProjection(reply), createdAt: reply.createdAt } }),
    ...(thread.closedAt === undefined ? {} : { closedAt: thread.closedAt }),
    updatedAt: thread.updatedAt,
  }
}

function governedSendRecordProjection(
  state: InquirySourceState,
  threadId: InquiryThreadId,
  keyring: GovernedSendIntegrityKeyring,
): GovernedSendRecordProjection {
  const receipts = state.governedSendReceipts.filter((candidate) => candidate.threadId === threadId)
  const commitments = state.governedSendIntegrityCommitments.filter((candidate) => candidate.threadId === threadId)
  if (receipts.length === 0 && commitments.length === 0) return absentGovernedSendProjection
  if (receipts.length !== 1 || commitments.length !== 1) return invalidGovernedSendProjection

  const receipt = receipts[0]
  const commitment = commitments[0]
  if (receipt === undefined || commitment === undefined) return invalidGovernedSendProjection
  const business = validatedGovernedSendBusiness(state, receipt, commitment, keyring)
  if (business === undefined) return invalidGovernedSendProjection

  if (receipt.retention === 'erased') {
    const lineages = state.governedSendErasureLineage.filter(
      (candidate) => candidate.receiptOperationKey === receipt.operationKey &&
        candidate.threadId === threadId,
    )
    if (lineages.length !== 1) return invalidGovernedSendProjection
    const lineage = lineages[0]!
    const tombstone = state.privacyTombstones.find(
      (candidate) => candidate.threadId === threadId &&
        candidate.operationKey === lineage.privacyOperationKey &&
        candidate.status === 'applied',
    )
    const keyRef = inquiryReceiptKeyRef(receipt)
    const expectedMaterial = tombstone?.appliedAt === undefined
      ? undefined
      : {
          erasureEventId: `governed-send-erasure:${stableHash({ receiptOperationKey: String(receipt.operationKey), privacyOperationKey: String(tombstone.operationKey), keyRef })}`,
          receiptOperationKey: receipt.operationKey,
          privacyOperationKey: tombstone.operationKey,
          threadId: receipt.threadId,
          digest: receipt.digest,
          keyRef,
          reasonCode: tombstone.reasonCode,
          destroyedAt: tombstone.appliedAt,
          priorReceiptCommitment: stableHash({ operationKey: String(receipt.operationKey), threadId: String(receipt.threadId), digest: receipt.digest, schemaVersion: receipt.schemaVersion, recipientRef: receipt.recipientRef, keyRef }),
        }
    const expectedLineage = expectedMaterial === undefined
      ? undefined
      : { ...expectedMaterial, lineageHash: stableHash(expectedMaterial) }
    const uniqueErasureEventIds = new Set(tombstone?.erasureEventIds ?? [])
    if (
      expectedLineage === undefined ||
      stableStringify(expectedLineage) !== stableStringify(lineage) ||
      !tombstone!.erasureEventIds.includes(lineage.erasureEventId) ||
      tombstone!.receiptErasureCount !== tombstone!.erasureEventIds.length ||
      uniqueErasureEventIds.size !== tombstone!.erasureEventIds.length
    ) return invalidGovernedSendProjection
    return {
      kind: 'verified',
      business,
      governedSend: {
        posture: 'erased',
        digest: receipt.digest,
        erasedAt: receipt.erasedAt,
        erasureEventId: receipt.erasureEventId,
      },
    }
  }
  const appliedTombstone = state.privacyTombstones.some(
    (tombstone) => tombstone.threadId === threadId && tombstone.status === 'applied',
  )
  if (appliedTombstone) return invalidGovernedSendProjection

  try {
    const binary = atob(receipt.canonicalBytesBase64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (!verifyGovernedActionBytes(bytes, receipt.digest)) return invalidGovernedSendProjection
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const envelope: unknown = JSON.parse(decoded)
    if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
      return invalidGovernedSendProjection
    }

    const envelopeRecord = envelope as Record<string, unknown>
    const envelopeKeys = Object.keys(envelopeRecord).sort()
    const declaredEnvelopeKeys = ['actionClass', 'payload', 'schemaVersion', 'wireFormat']
    if (
      envelopeKeys.length !== declaredEnvelopeKeys.length ||
      envelopeKeys.some((key, index) => key !== declaredEnvelopeKeys[index])
    ) return invalidGovernedSendProjection
    if (
      envelopeRecord.wireFormat !== GOVERNED_ACTION_WIRE_FORMAT ||
      envelopeRecord.schemaVersion !== GOVERNED_SEND_SCHEMA_VERSION ||
      envelopeRecord.actionClass !== GOVERNED_SEND_ACTION_CLASS
    ) return invalidGovernedSendProjection

    const payload = envelopeRecord.payload
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return invalidGovernedSendProjection
    }
    const payloadRecord = payload as Record<string, unknown>
    const payloadKeys = Object.keys(payloadRecord).sort()
    const declaredKeys = GOVERNED_SEND_CANONICAL_FIELDS.map((field) => field.key).sort()
    if (payloadKeys.length !== declaredKeys.length || payloadKeys.some((key, index) => key !== declaredKeys[index])) {
      return invalidGovernedSendProjection
    }
    if (
      payloadRecord.businessId !== String(commitment.targetBinding.businessId) ||
      payloadRecord.serviceId !== String(commitment.targetBinding.serviceId) ||
      payloadRecord.capabilityKind !== commitment.targetBinding.capabilityKind
    ) return invalidGovernedSendProjection

    const fields: { key: GovernedSendCanonicalFieldKey; label: string; value: string | null }[] = []
    for (const field of GOVERNED_SEND_CANONICAL_FIELDS) {
      const value = payloadRecord[field.key]
      if (value !== null && typeof value !== 'string') return invalidGovernedSendProjection
      fields.push({ key: field.key, label: field.label, value })
    }
    return {
      kind: 'verified',
      business,
      governedSend: { posture: 'verified', digest: receipt.digest, fields },
    }
  } catch {
    return invalidGovernedSendProjection
  }
}

function validatedGovernedSendBusiness(
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
  const services = state.businessServices.filter((candidate) => candidate.serviceId === binding.serviceId)
  if (
    operations.length !== 1 ||
    threads.length !== 1 ||
    businesses.length !== 1 ||
    claims.length !== 1 ||
    services.length !== 1
  ) return undefined

  const thread = threads[0]
  const business = businesses[0]
  const claim = claims[0]
  const service = services[0]
  if (thread === undefined || business === undefined || claim === undefined || service === undefined) return undefined
  if (
    receipt.admissionProof.proof.claimRef !== binding.claimRef ||
    receipt.recipientRef !== binding.recipientRef ||
    thread.businessId !== binding.businessId ||
    thread.ownerId !== binding.ownerId ||
    thread.serviceId !== binding.serviceId ||
    thread.capabilityKind !== binding.capabilityKind ||
    business.ownerId !== binding.ownerId ||
    claim.businessId !== binding.businessId ||
    claim.ownerId !== binding.ownerId ||
    service.businessId !== binding.businessId
  ) return undefined

  return business
}

function customerTimeline(
  thread: InquiryThreadRecord,
  deliveryState: InquiryNotificationStatus,
  deliveryUpdatedAt: number,
  reply: InquiryMessageRecord | undefined
): InquiryCustomerRecordReadback['timeline'] {
  const sentComplete = deliveryState === 'sent'
  const deliveryCurrent = sentComplete === false && reply === undefined
  const replied = reply !== undefined || thread.repliedAt !== undefined || thread.status === 'replied' || thread.status === 'closed'
  const closed = thread.status === 'closed' && thread.closedAt !== undefined

  return [
    {
      key: 'received',
      label: 'Inquiry received',
      detail: 'Your ask is saved as a written record.',
      status: 'complete',
      timestamp: thread.createdAt,
    },
    {
      key: 'sent_to_business',
      label: 'Sent to business',
      detail: customerDeliveryDetail(deliveryState),
      status: sentComplete ? 'complete' : deliveryCurrent ? 'current' : 'complete',
      timestamp: deliveryUpdatedAt,
    },
    {
      key: 'business_replied',
      label: 'Business replied',
      detail: replied ? 'Their reply is saved on this record.' : 'Their reply will appear here when it arrives.',
      status: replied ? 'complete' : sentComplete ? 'current' : 'pending',
      ...(reply?.createdAt === undefined ? thread.repliedAt === undefined ? {} : { timestamp: thread.repliedAt } : { timestamp: reply.createdAt }),
    },
    {
      key: 'closed',
      label: 'Record closed',
      detail: closed ? 'This record is closed and kept for reference.' : 'The record stays open while the business follow-up is active.',
      status: closed ? 'complete' : replied ? 'current' : 'pending',
      ...(thread.closedAt === undefined ? {} : { timestamp: thread.closedAt }),
    },
  ]
}

function customerDeliveryLabel(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued for business delivery'
    case 'sent':
      return 'Delivery recorded'
    case 'failed':
      return 'Delivery needs review'
    case 'held':
      return 'Delivery held for review'
  }
}

function customerDeliveryDetail(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'The written inquiry is queued for business delivery.'
    case 'sent':
      return 'The written inquiry has a delivery record.'
    case 'failed':
      return 'The written inquiry is saved; delivery needs review.'
    case 'held':
      return 'The written inquiry is saved and held for review.'
  }
}

function removeCustomerReplyEmail(thread: InquiryThreadRecord): InquiryThreadRecord {
  const { customerReplyEmail: _customerReplyEmail, ...rest } = thread
  return rest
}

function exportReadback(state: InquirySourceState, thread: InquiryThreadRecord): InquiryExportReadback {
  return {
    thread: projectInquiry(state, thread),
    messages: state.messages
      .filter((message) => message.threadId === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.messageId).localeCompare(String(right.messageId)))
      .map(exportMessageProjection),
    notifications: notificationProjections(state, thread.threadId),
    auditRefs: state.auditEvents
      .filter((event) => event.targetRef === thread.threadId)
      .sort((left, right) => left.createdAt - right.createdAt || String(left.eventType).localeCompare(String(right.eventType)))
      .map((event) => ({
        eventType: event.eventType,
        targetRef: event.targetRef,
        payloadHash: event.payloadHash,
        createdAt: event.createdAt,
      })),
    tombstones: state.privacyTombstones.filter((tombstone) => tombstone.threadId === thread.threadId),
  }
}

function ownerMessageProjection(message: InquiryMessageRecord): OwnerInboxMessageProjection {
  return {
    messageId: message.messageId,
    sender: message.sender,
    body: messageBodyForProjection(message),
    createdAt: message.createdAt,
  }
}

function exportMessageProjection(message: InquiryMessageRecord): InquiryExportMessageProjection {
  return {
    ...ownerMessageProjection(message),
    bodyHash: message.bodyHash,
    ...(message.contactHash === undefined ? {} : { contactHash: message.contactHash }),
    ...(message.privateDeletedAt === undefined ? {} : { privateDeletedAt: message.privateDeletedAt }),
  }
}

function messageBodyForProjection(message: InquiryMessageRecord): string {
  return message.privateDeletedAt === undefined ? message.body : '[private content deleted]'
}

function projectInquiry(state: InquirySourceState, thread: InquiryThreadRecord): OwnerInboxInquiryProjection {
  const business = state.businesses.find((candidate) => candidate.businessId === thread.businessId)
  const service = state.businessServices.find((candidate) => candidate.serviceId === thread.serviceId)
  const firstMessage = state.messages.find((message) => message.messageId === thread.firstMessageId)
  const notificationStatus = latestNotification(state, thread.threadId)?.status ?? 'held'

  return {
    threadId: thread.threadId,
    businessId: thread.businessId,
    serviceId: thread.serviceId,
    capabilityKind: thread.capabilityKind,
    businessName: business?.name ?? 'Business unavailable',
    serviceName: service?.name ?? 'Service unavailable',
    status: thread.status,
    bucket: bucketForThread(thread),
    preview: preview(firstMessage?.body ?? ''),
    notificationStatus,
    notificationLabel: notificationLabel(notificationStatus),
    messageCount: state.messages.filter((message) => message.threadId === thread.threadId).length,
    version: thread.version,
    submittedAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    ...(thread.origin === undefined ? {} : { origin: ownerOriginProjection(thread.origin) }),
  }
}

function ownerOriginProjection(origin: NonNullable<InquiryThreadRecord['origin']>): OwnerInboxOriginProjection {
  switch (origin.kind) {
    case 'answer_thread':
      return {
        kind: origin.kind,
        label: 'From answer',
        href: `/t/${encodeURIComponent(origin.threadId)}`,
      }
  }
}

function notificationProjections(state: InquirySourceState, threadId: InquiryThreadId): OwnerInboxNotificationProjection[] {
  return state.notifications
    .filter((notification) => notification.threadId === threadId)
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))
    .map((notification) => ({
      notificationId: notification.notificationId,
      messageId: notification.messageId,
      recipientRole: notification.recipientRole,
      status: notification.status,
      label: notificationLabel(notification.status),
      updatedAt: notification.updatedAt,
      ...(notification.failureCode === undefined ? {} : { failureCode: notification.failureCode }),
      dispatchIds: notification.dispatchBindings.map((binding) => binding.dispatchId),
      providerFamilies: notification.dispatchBindings.map((binding) => binding.providerFamily),
      dispatchStatuses: notification.dispatchBindings.map((binding) => binding.status),
      dispatchBindings: notification.dispatchBindings.map((binding) => ({ ...binding })),
    }))
}

function notificationRecord(input: {
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
    payloadHash: stableHash(redactedPayload),
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
    dispatchBindings: [],
  }
}

function notificationStatusFromDispatchBindings(
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

function auditRecord(input: {
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
    payloadHash: stableHash(input.redactedPayload),
    createdAt: input.now,
  }
}

function funnelRecord(input: {
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
    payloadHash: stableHash(input.redactedPayload),
    createdAt: input.now,
  }
}

function operationRecord(
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

function replaceThread(
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

function findOwnedThread(
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

function findThread(state: InquirySourceState, threadId: InquiryThreadId): InquiryThreadRecord | undefined {
  return state.threads.find((candidate) => candidate.threadId === threadId)
}

function findOperation(state: InquirySourceState, operationKey: OperationKey): InquiryOperationRecord | undefined {
  return state.operations.find((operation) => operation.operationKey === operationKey)
}

function findPrivacyTombstone(
  state: InquirySourceState,
  threadId: InquiryThreadId,
  operationKey: OperationKey
): InquiryPrivacyTombstoneRecord | undefined {
  return state.privacyTombstones.find((tombstone) => tombstone.threadId === threadId && tombstone.operationKey === operationKey)
}

function redactPrivateMessage(message: InquiryMessageRecord, deletedAt: number): InquiryMessageRecord {
  return {
    ...message,
    body: '[private content deleted]',
    privateDeletedAt: message.privateDeletedAt ?? deletedAt,
    ...(message.redactedContact === undefined ? {} : { redactedContact: { deleted: true } }),
  }
}

function normalizeReasonCode(value: string): string {
  const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9:_-]+/g, '_')
  return normalized.length === 0 ? 'privacy_delete_requested' : normalized.slice(0, 96)
}

function isSuppressed(
  rules: readonly SuppressionRuleRecord[],
  targetType: SuppressionRuleRecord['targetType'],
  targetRef: string
): boolean {
  return rules.some((rule) => rule.targetType === targetType && rule.targetRef === targetRef && rule.status === 'active')
}

function bucketForThread(thread: InquiryThreadRecord): OwnerInboxBucket {
  if (thread.status === 'closed') {
    return 'resolved'
  }
  if (thread.status === 'unread') {
    return 'unread'
  }

  return 'needs_reply'
}

function latestNotification(state: InquirySourceState, threadId: InquiryThreadId): InquiryNotificationRecord | undefined {
  return state.notifications
    .filter((notification) => notification.threadId === threadId)
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.notificationId).localeCompare(String(right.notificationId)))[0]
}

function notificationLabel(status: InquiryNotificationStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'sent':
      return 'Sent'
    case 'failed':
      return 'Failed'
    case 'held':
      return 'Held'
  }
}

function preview(value: string): string {
  const normalized = normalizeText(value)
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93)}...`
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function isBlank(value: string): boolean {
  return value.trim().length === 0
}

function requestTarget(target: InquiryTargetRef): StableHashValue {
  return {
    businessId: target.businessId,
    serviceId: target.serviceId,
    capabilityKind: target.capabilityKind,
  }
}

function inquiryThreadId(value: StableHashValue): InquiryThreadId {
  return brandNonEmpty(`inquiry_thread:${stableHash(value)}`, 'InquiryThreadId')
}

function inquiryMessageId(value: StableHashValue): InquiryMessageId {
  return brandNonEmpty(`inquiry_message:${stableHash(value)}`, 'InquiryMessageId')
}

function inquiryNotificationId(value: StableHashValue): InquiryNotificationId {
  return brandNonEmpty(`inquiry_notification:${stableHash(value)}`, 'InquiryNotificationId')
}

function admissionError(
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

function error<Code extends string>(code: Code, reason: string, field?: string) {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason,
    ...(field === undefined ? {} : { field }),
  }
}

import type { BusinessRecord } from '@/modules/business/public'
import type { BusinessOfferingRecord } from '@/modules/catalog/public'
import type { CorrelationId, OperationKey } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ModuleResult } from '@/modules/common/result'
import {
  GOVERNED_ACTION_DIGEST_ALGORITHM,
  encodeGovernedAction,
} from '@/modules/governed-action/public'
import { evaluateR1TargetAdmission, type AdmissionBlocker, type R1TargetAdmissionState } from '../admission'
import {
  issueInquiryCustomerAccess,
  mintInquiryCustomerAccessKey,
  type InquiryCustomerAccessKeyring,
} from '../customer-access'
import {
  InquiryUnsafeFutureSurfaceFieldValues,
  type InquiryMessageId,
  type InquiryMessageRecord,
  type InquiryNotificationDispatchBinding,
  type InquiryNotificationId,
  type InquiryNotificationRecord,
  type InquiryNotificationStatus,
  type InquiryOperationRecord,
  type InquiryOwnerAuthority,
  type InquirySourceState,
  type InquiryTargetRef,
  type InquiryThreadId,
  type InquiryThreadRecord,
  type PublicInquiryContactInput,
} from '../schema'
import {
  createGovernedSendIntegrityCommitment,
  buildGovernedSendIntent,
  GOVERNED_SEND_SCHEMA_VERSION,
  type GovernedSendIntegrityKeyring,
  type GovernedSendReceiptRecord,
} from '../governed-send'
import { findUnsafeInquiryActionIntent } from '../policy'
import { normalizeInquiryWhitespace } from '../normalize-text'
import {
  admissionError,
  auditRecord,
  error,
  findOperation,
  findOwnedThread,
  findThread,
  funnelRecord,
  inquiryMessageId,
  inquiryNotificationId,
  inquiryThreadId,
  notificationRecord,
  notificationStatusFromDispatchBindings,
  operationRecord,
  replaceThread,
  requestTarget,
  validatedGovernedSendBusiness,
} from './facts'

export type SubmitInquiryCommand = {
  target: InquiryTargetRef
  body: string
  contact: PublicInquiryContactInput
  operationKey: OperationKey
  correlationId: CorrelationId
  pseudonymousSessionId: string
  abuseBucketKey?: string
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
  {
    reason: string
    blockers?: readonly AdmissionBlocker[]
    field?: string
    retryAfter?: number
    state?: InquirySourceState
  }
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

export function submitInquiry(
  state: InquirySourceState,
  command: SubmitInquiryCommand,
  commitAdmissionState: R1TargetAdmissionState = state,
): SubmitInquiryResult {
  const unsafeField = findUnsafeFutureSurfaceField(command.unsafeClientFields)
  if (unsafeField !== undefined) {
    return error('inquiry_unsafe_future_surface_field', 'Public inquiry input cannot carry future-surface fields.', unsafeField)
  }

  const body = normalizeInquiryWhitespace(command.body)
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


  const requestHash = canonicalDigest({
    target: requestTarget(command.target),
    body,
    contact: contact.hashInput,
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



  const bodyHash = canonicalDigest(body)
  const contactHash = canonicalDigest(contact.hashInput)
  const threadId = inquiryThreadId({
    businessId: target.business.businessId,
    offeringRef: target.offering.offeringRef,
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
    offeringRef: target.offering.offeringRef,
    status: 'unread',
    firstMessageId: messageId,
    sourceHash: canonicalDigest({
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
    offeringRef: target.offering.offeringRef,
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
      offeringRef: target.offering.offeringRef,
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
      offeringRef: target.offering.offeringRef,
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
    redactedPayload: { threadId, offeringRef: target.offering.offeringRef },
    now: command.now,
  })
  const nextState: InquirySourceState = {
    ...state,
    threads: [...state.threads, thread],
    messages: [...state.messages, message],
    notifications: [...state.notifications, notification],
    customerAccessGrants: [...state.customerAccessGrants, issuedCustomerAccess.grant],
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

  const requestHash = canonicalDigest({ action: 'mark_read', threadId: command.threadId, ownerId: command.authority.ownerId })
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

  const body = normalizeInquiryWhitespace(command.body)
  if (body.length === 0 || body.length > state.operatorControls.maxBodyLength) {
    return error('inquiry_invalid_input', 'Reply body must be non-empty and within the source-owned length cap.')
  }

  const requestHash = canonicalDigest({ action: 'reply', threadId: command.threadId, ownerId: command.authority.ownerId, body })
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

  const bodyHash = canonicalDigest(body)
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

  const requestHash = canonicalDigest({ action: 'close', threadId: command.threadId, ownerId: command.authority.ownerId })
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

function resolveInquiryTarget(
  state: InquirySourceState,
  target: InquiryTargetRef
):
  | { kind: 'ready'; business: BusinessRecord; offering: BusinessOfferingRecord }
  | { kind: 'blocked'; blockers: readonly AdmissionBlocker[] } {
  const admission = evaluateR1TargetAdmission(state, target)
  if (!admission.admitted) {
    return { kind: 'blocked', blockers: admission.blockers }
  }

  const business = state.businesses.find((candidate) => candidate.businessId === target.businessId)
  const offering = state.businessOfferings.find(
    (candidate) => candidate.businessId === target.businessId && candidate.offeringRef === target.offeringRef
  )
  if (business === undefined || offering === undefined) {
    return {
      kind: 'blocked',
      blockers: [{ kind: 'not_ready', ownerLabel: 'Finish inquiry setup' }],
    }
  }

  return { kind: 'ready', business, offering }
}

function normalizeContact(input: PublicInquiryContactInput):
  | { kind: 'valid'; hashInput: StableHashValue; redacted: { name: string; email: string; phone: string }; replyEmail?: string }
  | { kind: 'invalid'; reason: string } {
  const name = normalizeInquiryWhitespace(input.name ?? '')
  const email = normalizeInquiryWhitespace(input.email ?? '').toLowerCase()
  const phone = normalizeInquiryWhitespace(input.phone ?? '')

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

import type { BusinessRecord } from '@/modules/business/public'
import type { BusinessServiceRecord, ServiceCapabilityRecord } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import type { ModuleResult } from '@/modules/common/result'
import { rateLimitClaim } from '@/modules/security/public'
import type { SuppressionRuleRecord } from '@/modules/security/public'
import {
  defaultInquiryOperatorControls,
  InquiryUnsafeFutureSurfaceFieldValues,
  type CapabilityLaunchSupportRecord,
  type InquiryAuditRecord,
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
  type OwnerInboxMessageProjection,
  type OwnerInboxNotificationProjection,
  type OwnerInboxReadback,
  type OwnerInquiryDetailReadback,
  type PublicInquiryContactInput,
} from './schema'

export type SubmitInquiryCommand = {
  target: InquiryTargetRef
  body: string
  contact: PublicInquiryContactInput
  operationKey: OperationKey
  correlationId: CorrelationId
  pseudonymousSessionId: string
  abuseBucketKey: string
  now: number
  notificationStatus?: InquiryNotificationStatus
  notificationFailureCode?: string
  unsafeClientFields?: Record<string, unknown>
}

export type SubmitInquiryErrorCode =
  | 'inquiry_target_unavailable'
  | 'inquiry_target_suppressed'
  | 'inquiry_target_not_ready'
  | 'inquiry_invalid_input'
  | 'inquiry_duplicate_conflict'
  | 'inquiry_rate_limited'
  | 'inquiry_unsafe_future_surface_field'

export type SubmitInquiryResult = ModuleResult<
  'inquiry_submitted' | 'inquiry_replayed',
  SubmitInquiryErrorCode,
  {
    state: InquirySourceState
    thread: InquiryThreadRecord
    message: InquiryMessageRecord
    notification: InquiryNotificationRecord
  },
  { reason: string; field?: string; retryAfter?: number; state?: InquirySourceState }
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
    threads: [],
    messages: [],
    notifications: [],
    abuseRateLimitBuckets: [],
    auditEvents: [],
    funnelEvents: [],
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

export function submitInquiry(state: InquirySourceState, command: SubmitInquiryCommand): SubmitInquiryResult {
  const unsafeField = findUnsafeFutureSurfaceField(command.unsafeClientFields)
  if (unsafeField !== undefined) {
    return error('inquiry_unsafe_future_surface_field', 'Public inquiry input cannot carry future-surface fields.', unsafeField)
  }

  const body = normalizeText(command.body)
  if (body.length === 0 || body.length > state.operatorControls.maxBodyLength) {
    return error('inquiry_invalid_input', 'Inquiry body must be non-empty and within the source-owned length cap.')
  }

  const contact = normalizeContact(command.contact)
  if (contact.kind === 'invalid') {
    return error('inquiry_invalid_input', contact.reason)
  }

  const requestHash = stableHash({
    target: requestTarget(command.target),
    body,
    contact: contact.hashInput,
    abuseBucketKey: command.abuseBucketKey,
  })
  const existingOperation = findOperation(state, command.operationKey)
  if (existingOperation !== undefined) {
    if (existingOperation.requestHash !== requestHash) {
      return error('inquiry_duplicate_conflict', 'The operation key was already used for a different inquiry body.')
    }

    const replay = replaySubmit(state, existingOperation)
    if (replay !== undefined) {
      return { kind: 'ok', code: 'inquiry_replayed', ...replay }
    }
  }

  const target = resolveInquiryTarget(state, command.target)
  if (target.kind !== 'ready') {
    return error(target.code, target.reason)
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
    sourceHash: stableHash({ threadId, bodyHash, contactHash }),
    createdAt: command.now,
    updatedAt: command.now,
    version: 1,
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
    redactedPayload: { ...redactedPayload, notificationStatus },
    now: command.now,
  })
  const funnelEvent = funnelRecord({
    eventType: 'inquiry_submitted',
    businessId: target.business.businessId,
    correlationId: command.correlationId,
    pseudonymousSessionId: command.pseudonymousSessionId,
    redactedPayload: { threadId, serviceId: target.service.serviceId, notificationStatus },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_submitted', command.now, {
    threadId,
    messageId,
    notificationId,
  })
  const nextState: InquirySourceState = {
    ...state,
    threads: [...state.threads, thread],
    messages: [...state.messages, message],
    notifications: [...state.notifications, notification],
    abuseRateLimitBuckets,
    auditEvents: [...state.auditEvents, auditEvent],
    funnelEvents: [...state.funnelEvents, funnelEvent],
    operations: [...state.operations, operation],
  }

  return { kind: 'ok', code: 'inquiry_submitted', state: nextState, thread, message, notification }
}

export function listOwnerInbox(
  state: InquirySourceState,
  input: { authority: InquiryOwnerAuthority; businessId?: BusinessId }
): OwnerInboxReadback {
  const ownedBusinessIds = new Set(
    state.businesses
      .filter((business) => business.ownerId === input.authority.ownerId)
      .filter((business) => input.businessId === undefined || business.businessId === input.businessId)
      .map((business) => business.businessId)
  )
  const inquiries = state.threads
    .filter((thread) => ownedBusinessIds.has(thread.businessId))
    .map((thread) => projectInquiry(state, thread))
    .sort((left, right) => right.updatedAt - left.updatedAt || String(left.threadId).localeCompare(String(right.threadId)))
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

  const tombstone: InquiryPrivacyTombstoneRecord = {
    threadId: thread.threadId,
    businessId: thread.businessId,
    reasonCode,
    status: 'applied',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    createdAt: command.now,
    appliedAt: command.now,
  }
  const redactedMessages = state.messages.map((message) =>
    message.threadId === thread.threadId ? redactPrivateMessage(message, command.now) : message
  )
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
      messageHashes: state.messages.filter((message) => message.threadId === thread.threadId).map((message) => message.bodyHash),
    },
    now: command.now,
  })
  const operation = operationRecord(command.operationKey, requestHash, 'inquiry_private_content_deleted', command.now, {
    threadId: thread.threadId,
  })
  const nextState: InquirySourceState = {
    ...state,
    messages: redactedMessages,
    auditEvents: [...state.auditEvents, auditEvent],
    operations: [...state.operations, operation],
    privacyTombstones: [...state.privacyTombstones, tombstone],
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
  | { kind: 'blocked'; code: SubmitInquiryErrorCode; reason: string } {
  if (!state.operatorControls.inquiriesEnabled || !state.operatorControls.ownerHandlingReady || !state.operatorControls.notificationReadbackReady) {
    return { kind: 'blocked', code: 'inquiry_target_not_ready', reason: 'Inquiry handling is not ready for this target.' }
  }
  const supportReadiness = evaluateInquiryLaunchSupportReadiness(state)
  if (supportReadiness.kind !== 'ready') {
    return { kind: 'blocked', code: 'inquiry_target_not_ready', reason: supportReadiness.reason }
  }

  const business = state.businesses.find((candidate) => candidate.businessId === target.businessId)
  if (business === undefined) {
    return { kind: 'blocked', code: 'inquiry_target_unavailable', reason: 'Business is unavailable.' }
  }
  if (business.publicStatus === 'suppressed' || isSuppressed(state.suppressionRules, 'business', business.businessId)) {
    return { kind: 'blocked', code: 'inquiry_target_suppressed', reason: 'Business is suppressed.' }
  }
  if (business.publicStatus !== 'published') {
    return { kind: 'blocked', code: 'inquiry_target_unavailable', reason: 'Business is not published.' }
  }

  const service = state.businessServices.find(
    (candidate) => candidate.businessId === business.businessId && candidate.serviceId === target.serviceId
  )
  if (service === undefined) {
    return { kind: 'blocked', code: 'inquiry_target_unavailable', reason: 'Service is unavailable.' }
  }
  if (service.status === 'suppressed' || isSuppressed(state.suppressionRules, 'service', service.serviceId)) {
    return { kind: 'blocked', code: 'inquiry_target_suppressed', reason: 'Service is suppressed.' }
  }
  if (service.status !== 'published') {
    return { kind: 'blocked', code: 'inquiry_target_unavailable', reason: 'Service is not published.' }
  }

  const capability = state.serviceCapabilities.find(
    (candidate) =>
      candidate.businessId === business.businessId &&
      candidate.serviceId === service.serviceId &&
      candidate.kind === target.capabilityKind
  )
  if (capability === undefined) {
    return { kind: 'blocked', code: 'inquiry_target_not_ready', reason: 'Capability is not ready for inquiry.' }
  }
  if (isSuppressed(state.suppressionRules, 'capability', `${service.serviceId}:${capability.kind}`)) {
    return { kind: 'blocked', code: 'inquiry_target_suppressed', reason: 'Capability is suppressed.' }
  }
  if (capability.status !== 'available' || capability.firstRequest.mode !== 'inquiry_available') {
    return { kind: 'blocked', code: 'inquiry_target_not_ready', reason: 'Capability is not ready for inquiry.' }
  }

  return { kind: 'ready', business, service, capability }
}

function normalizeContact(input: PublicInquiryContactInput):
  | { kind: 'valid'; hashInput: StableHashValue; redacted: { name: string; email: string; phone: string } }
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
  return state.capabilityLaunchSupportRecords
    .filter((record) => state.businesses.some((business) => business.businessId === businessId && business.ownerId === record.primaryOwnerRef))
    .map((record) => record.correlationId)
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

function error<Code extends string>(code: Code, reason: string, field?: string) {
  return {
    kind: 'error' as const,
    code,
    retryable: false,
    reason,
    ...(field === undefined ? {} : { field }),
  }
}

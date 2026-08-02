import type { BusinessId } from '@/modules/common/ids'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { notificationsForThread } from '../ledger/facts'
import type {
  InquiryFunnelRecord,
  InquiryNotificationDispatchBinding,
  InquiryNotificationRecord,
  InquiryOperatorDispatchRef,
  InquiryOperatorFunnelRef,
  InquiryOperatorNextAction,
  InquiryOperatorNotificationRef,
  InquiryOperatorOperationRef,
  InquiryOperatorReconstructionAllowedReadback,
  InquiryOperatorReconstructionFilter,
  InquiryOperatorReconstructionRow,
  InquirySourceState,
  InquiryThreadId,
  InquiryThreadRecord,
} from '../schema'

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
    offeringRef: thread.offeringRef,
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

function uniqueStrings(values: readonly (string | undefined)[]): readonly string[] {
  return uniqueSorted(values.filter((value): value is string => value !== undefined && value.length > 0))
}

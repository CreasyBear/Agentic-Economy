import { brandNonEmpty } from '../src/modules/common/ids'
import { stableHash } from '../src/modules/common/stable-hash'
import {
  NotificationDispatchStatusValues,
} from '../src/modules/notification-outbox/public'
import type {
  NotificationDispatchRecord,
  NotificationDispatchStatus,
  NotificationProviderFamily,
} from '../src/modules/notification-outbox/public'
import type { RedactedPayload } from '../src/modules/observability/public'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import {
  booleanField,
  isRecord,
  numberField,
  optionalNumberField,
  optionalStringField,
  stringField,
  upsertByFields,
} from './inquiryRuntimeDbHelpers'

export function toDispatchRecord(row: RuntimeDocument): NotificationDispatchRecord {
  return {
    dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    inquiryThreadId: stringField(row, 'inquiryThreadId'),
    inquiryMessageId: stringField(row, 'inquiryMessageId'),
    recipientRole: recipientRole(row),
    providerFamily: notificationProviderFamily(row),
    status: notificationDispatchStatus(row),
    providerIdempotencyKey: stringField(row, 'providerIdempotencyKey'),
    redactedPayload: parseRedactedPayload(stringField(row, 'redactedPayloadJson')),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    ...(optionalStringField(row, 'resendMessageId') === undefined ? {} : { resendMessageId: stringField(row, 'resendMessageId') }),
    ...(optionalStringField(row, 'novuTransactionId') === undefined ? {} : { novuTransactionId: stringField(row, 'novuTransactionId') }),
    ...(optionalStringField(row, 'novuWorkflowId') === undefined ? {} : { novuWorkflowId: stringField(row, 'novuWorkflowId') }),
    ...(optionalStringField(row, 'novuMessageId') === undefined ? {} : { novuMessageId: stringField(row, 'novuMessageId') }),
    ...(optionalStringField(row, 'novuSubscriberId') === undefined ? {} : { novuSubscriberId: stringField(row, 'novuSubscriberId') }),
    providerMissing: booleanField(row, 'providerMissing'),
    orchestratorMissing: booleanField(row, 'orchestratorMissing'),
    retryCount: numberField(row, 'retryCount'),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    ...(optionalStringField(row, 'lastRedactedError') === undefined ? {} : { lastRedactedError: stringField(row, 'lastRedactedError') }),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

export async function upsertNotificationDispatch(
  db: RuntimeDb,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  await upsertByFields(db, 'notificationDispatches', ['dispatchId'], {
    dispatchId: dispatch.dispatchId,
    businessId: dispatch.businessId,
    inquiryThreadId: dispatch.inquiryThreadId,
    inquiryMessageId: dispatch.inquiryMessageId,
    recipientRole: dispatch.recipientRole,
    providerFamily: dispatch.providerFamily,
    status: dispatch.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
    redactedPayloadJson: JSON.stringify(dispatch.redactedPayload),
    payloadHash: dispatch.payloadHash,
    ...(dispatch.resendMessageId === undefined ? {} : { resendMessageId: dispatch.resendMessageId }),
    ...(dispatch.novuTransactionId === undefined ? {} : { novuTransactionId: dispatch.novuTransactionId }),
    ...(dispatch.novuWorkflowId === undefined ? {} : { novuWorkflowId: dispatch.novuWorkflowId }),
    ...(dispatch.novuMessageId === undefined ? {} : { novuMessageId: dispatch.novuMessageId }),
    ...(dispatch.novuSubscriberId === undefined ? {} : { novuSubscriberId: dispatch.novuSubscriberId }),
    providerMissing: dispatch.providerMissing,
    orchestratorMissing: dispatch.orchestratorMissing,
    retryCount: dispatch.retryCount,
    ...(dispatch.retryAfter === undefined ? {} : { retryAfter: dispatch.retryAfter }),
    ...(dispatch.lastRedactedError === undefined ? {} : { lastRedactedError: dispatch.lastRedactedError }),
    operationKey: dispatch.operationKey,
    correlationId: dispatch.correlationId,
    createdAt: dispatch.createdAt,
    updatedAt: dispatch.updatedAt,
  })
}

/** Enqueue-path reconstruction used by the inquiry notification bridge. */
export async function upsertNotificationDispatchEnqueueReconstruction(
  db: RuntimeDb,
  dispatch: NotificationDispatchRecord,
): Promise<void> {
  await Promise.all([
    upsertByFields(db, 'operationKeys', ['scope', 'key'], {
      scope: 'notification',
      actorKind: 'system',
      actorRef: 'system:notification-outbox',
      operationName: 'enqueueInquiryNotification',
      key: dispatch.operationKey,
      requestHash: dispatch.payloadHash,
      sourceHash: dispatch.dispatchId,
      status: 'succeeded',
      resultHash: stableHash({ code: 'notification_queued', dispatchId: dispatch.dispatchId }),
      effectRefs: [
        'result:notification_queued',
        `dispatch:${dispatch.dispatchId}`,
        `inquiryThread:${dispatch.inquiryThreadId}`,
        `inquiryMessage:${dispatch.inquiryMessageId}`,
      ],
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
    }),
    upsertByFields(db, 'auditEvents', ['eventId'], {
      eventId: `audit:${stableHash({
        eventType: 'notification.queued',
        operationKey: dispatch.operationKey,
        targetRef: dispatch.dispatchId,
      })}`,
      eventType: 'notification.queued',
      actorKind: 'system',
      actorRef: 'system:notification-outbox',
      businessId: dispatch.businessId,
      targetType: 'notification',
      targetRef: dispatch.dispatchId,
      beforeState: 'none',
      afterState: dispatch.status,
      idempotencyKey: dispatch.operationKey,
      correlationId: dispatch.correlationId,
      evidenceRefs: [],
      redactedPayloadJson: JSON.stringify({
        dispatchId: dispatch.dispatchId,
        providerFamily: dispatch.providerFamily,
        inquiryThreadId: dispatch.inquiryThreadId,
        inquiryMessageId: dispatch.inquiryMessageId,
        payloadHash: dispatch.payloadHash,
      }),
      payloadHash: stableHash({
        dispatchId: dispatch.dispatchId,
        providerFamily: dispatch.providerFamily,
        inquiryThreadId: dispatch.inquiryThreadId,
        inquiryMessageId: dispatch.inquiryMessageId,
        payloadHash: dispatch.payloadHash,
      }),
      createdAt: dispatch.createdAt,
    }),
    upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
      eventType: 'notification_queued',
      source: 'notification-outbox',
      stage: 'published',
      pseudonymousSessionId: `notification:${dispatch.recipientRole}`,
      businessId: dispatch.businessId,
      redactedPayloadJson: JSON.stringify({
        dispatchId: dispatch.dispatchId,
        providerFamily: dispatch.providerFamily,
        status: dispatch.status,
      }),
      consentFlag: true,
      correlationId: dispatch.correlationId,
      createdAt: dispatch.createdAt,
    }),
  ])
}

function recipientRole(row: RuntimeDocument) {
  return stringField(row, 'recipientRole') === 'customer' ? 'customer' : 'owner'
}

function notificationProviderFamily(row: RuntimeDocument): NotificationProviderFamily {
  return stringField(row, 'providerFamily') === 'novu' ? 'novu' : 'resend'
}

function notificationDispatchStatus(row: RuntimeDocument): NotificationDispatchStatus {
  const value = stringField(row, 'status')
  return NotificationDispatchStatusValues.find((candidate) => candidate === value) ?? 'queued'
}

function parseRedactedPayload(value: string): RedactedPayload {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRedactedPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRedactedPayload(value: unknown): value is RedactedPayload {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isRedactedPayload)
  }
  if (!isRecord(value)) {
    return false
  }
  return Object.values(value).every(isRedactedPayload)
}

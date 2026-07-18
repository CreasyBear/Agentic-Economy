import {
  createEmptyNotificationOutboxSourceState,
  NotificationAttemptStatusValues,
  NotificationWebhookEventStatusValues,
  type NotificationDispatchAttemptRecord,
  type NotificationOutboxSourceState,
  type NotificationWebhookEventRecord,
} from '../src/modules/notification-outbox/public'
import { brandNonEmpty } from '../src/modules/common/ids'
import type { RedactedPayload } from '../src/modules/observability/public'
import type { RuntimeDb, RuntimeDocument } from './source_state'
import {
  collect,
  isRecord,
  numberField,
  optionalNumberField,
  optionalStringField,
  stringField,
  upsertByFields,
} from './inquiryRuntimeDbHelpers'
import {
  toDispatchRecord,
  upsertNotificationDispatch,
} from './notificationOutboxPersistence'

export async function loadNotificationOutboxSourceState(db: RuntimeDb): Promise<NotificationOutboxSourceState> {
  const [dispatches, attempts, webhookEvents, operatorControls] = await Promise.all([
    collect(db, 'notificationDispatches'),
    collect(db, 'notificationDispatchAttempts'),
    collect(db, 'notificationWebhookEvents'),
    collect(db, 'operatorControls'),
  ])

  return createEmptyNotificationOutboxSourceState({
    dispatches: dispatches.map(toDispatchRecord),
    attempts: attempts.map(toAttemptRecord),
    webhookEvents: webhookEvents.map(toWebhookEventRecord),
    controls: {
      notificationDispatchEnabled: operatorControlEnabled(operatorControls, 'notification_dispatch_enabled'),
      notificationWebhooksEnabled: operatorControlEnabled(operatorControls, 'notification_webhooks_enabled'),
    },
  })
}

export async function persistNotificationOutboxSourceState(
  db: RuntimeDb,
  state: NotificationOutboxSourceState,
): Promise<void> {
  for (const dispatch of state.dispatches) {
    await upsertNotificationDispatch(db, dispatch)
  }

  for (const attempt of state.attempts) {
    await upsertByFields(db, 'notificationDispatchAttempts', ['attemptId'], {
      attemptId: attempt.attemptId,
      dispatchId: attempt.dispatchId,
      providerFamily: attempt.providerFamily,
      status: attempt.status,
      providerIdempotencyKey: attempt.providerIdempotencyKey,
      requestPayloadHash: attempt.requestPayloadHash,
      redactedRequestPayloadJson: JSON.stringify(attempt.redactedRequestPayload),
      ...(attempt.providerResponseHash === undefined ? {} : { providerResponseHash: attempt.providerResponseHash }),
      ...(attempt.redactedError === undefined ? {} : { redactedError: attempt.redactedError }),
      ...(attempt.retryAfter === undefined ? {} : { retryAfter: attempt.retryAfter }),
      startedAt: attempt.startedAt,
      ...(attempt.completedAt === undefined ? {} : { completedAt: attempt.completedAt }),
    })
  }

  for (const webhookEvent of state.webhookEvents) {
    await upsertByFields(db, 'notificationWebhookEvents', ['webhookEventId'], {
      webhookEventId: webhookEvent.webhookEventId,
      providerFamily: webhookEvent.providerFamily,
      providerEventId: webhookEvent.providerEventId,
      logicalObjectKey: webhookEvent.logicalObjectKey,
      ...(webhookEvent.dispatchId === undefined ? {} : { dispatchId: webhookEvent.dispatchId }),
      status: webhookEvent.status,
      eventType: webhookEvent.eventType,
      signatureStatus: webhookEvent.signatureStatus,
      payloadHash: webhookEvent.payloadHash,
      redactedPayloadJson: JSON.stringify(webhookEvent.redactedPayload),
      ...(webhookEvent.reason === undefined ? {} : { reason: webhookEvent.reason }),
      operationKey: webhookEvent.operationKey,
      correlationId: webhookEvent.correlationId,
      receivedAt: webhookEvent.receivedAt,
    })
  }
}

function toAttemptRecord(row: RuntimeDocument): NotificationDispatchAttemptRecord {
  return {
    attemptId: brandNonEmpty(stringField(row, 'attemptId'), 'NotificationDispatchAttemptId'),
    dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId'),
    providerFamily: providerFamily(row),
    status: attemptStatus(row),
    providerIdempotencyKey: stringField(row, 'providerIdempotencyKey'),
    requestPayloadHash: brandNonEmpty(stringField(row, 'requestPayloadHash'), 'SourceHash'),
    redactedRequestPayload: parseRedactedPayload(stringField(row, 'redactedRequestPayloadJson')),
    ...(optionalStringField(row, 'providerResponseHash') === undefined
      ? {}
      : { providerResponseHash: brandNonEmpty(stringField(row, 'providerResponseHash'), 'SourceHash') }),
    ...(optionalStringField(row, 'redactedError') === undefined ? {} : { redactedError: stringField(row, 'redactedError') }),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    startedAt: numberField(row, 'startedAt'),
    ...(optionalNumberField(row, 'completedAt') === undefined ? {} : { completedAt: numberField(row, 'completedAt') }),
  }
}

function toWebhookEventRecord(row: RuntimeDocument): NotificationWebhookEventRecord {
  return {
    webhookEventId: brandNonEmpty(stringField(row, 'webhookEventId'), 'NotificationWebhookEventId'),
    providerFamily: providerFamily(row),
    providerEventId: stringField(row, 'providerEventId'),
    logicalObjectKey: stringField(row, 'logicalObjectKey'),
    ...(optionalStringField(row, 'dispatchId') === undefined
      ? {}
      : { dispatchId: brandNonEmpty(stringField(row, 'dispatchId'), 'NotificationDispatchId') }),
    status: webhookEventStatus(row),
    eventType: stringField(row, 'eventType'),
    signatureStatus: signatureStatus(row),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    redactedPayload: parseRedactedPayload(stringField(row, 'redactedPayloadJson')),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    operationKey: brandNonEmpty(stringField(row, 'operationKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    receivedAt: numberField(row, 'receivedAt'),
  }
}

function operatorControlEnabled(rows: RuntimeDocument[], key: string): boolean {
  const active = rows.find((row) => stringField(row, 'key') === key && optionalExpiredAt(row) === undefined)
  return active === undefined ? true : booleanTruthy(active, 'enabled')
}

function optionalExpiredAt(row: RuntimeDocument): number | undefined {
  const expiresAt = optionalNumberField(row, 'expiresAt')
  return expiresAt !== undefined && expiresAt <= Date.now() ? expiresAt : undefined
}

function booleanTruthy(row: RuntimeDocument, field: string): boolean {
  return row[field] === true
}

function providerFamily(row: RuntimeDocument) {
  return stringField(row, 'providerFamily') === 'novu' ? 'novu' : 'resend'
}

function attemptStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return NotificationAttemptStatusValues.find((candidate) => candidate === value) ?? 'pending'
}

function webhookEventStatus(row: RuntimeDocument) {
  const value = stringField(row, 'status')
  return NotificationWebhookEventStatusValues.find((candidate) => candidate === value) ?? 'held_for_operator'
}

function signatureStatus(row: RuntimeDocument) {
  return stringField(row, 'signatureStatus') === 'verified' ? 'verified' : 'rejected'
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

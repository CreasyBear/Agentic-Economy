import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import {
  createEmptyNotificationOutboxSourceState,
  MAX_NOTIFICATION_ATTEMPTS_PER_DISPATCH,
  MAX_NOTIFICATION_THREAD_DISPATCH_READBACK,
  MAX_NOTIFICATION_WEBHOOK_EVENT_READBACK,
} from '../src/modules/notification-outbox/public'
import type {
  NotificationDispatchAttemptRecord,
  NotificationOutboxSourceState,
  NotificationWebhookEventRecord,
  NotificationOutboxSourceStateLoadScope,
} from '../src/modules/notification-outbox/public'
type NotificationWebhookLoadScope = Extract<
  NotificationOutboxSourceStateLoadScope,
  { kind: 'webhook' }
>
import { brandNonEmpty } from '../src/modules/common/ids'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import { parseRedactedPayload } from '../src/modules/notification-outbox/operator/parse-payload'
import type { DataModel, Doc } from './_generated/dataModel'
import {
  persistNotificationDispatch,
  persistNotificationDispatchAttempt,
  persistNotificationWebhookEvent,
  toDispatchRecord,
} from './notificationOutboxPersistence'

export async function loadNotificationOutboxSourceStateForThread(
  db: GenericDatabaseReader<DataModel>,
  inquiryThreadId: string,
  operationKeys: readonly string[] = [],
): Promise<NotificationOutboxSourceState> {
  const uniqueOperationKeys = [...new Set(operationKeys)]
  const [dispatchRows, controls] = await Promise.all([
    uniqueOperationKeys.length === 0
      ? db
          .query('notificationDispatches')
          .withIndex('by_inquiry_thread_createdAt', (query) => query.eq('inquiryThreadId', inquiryThreadId))
          .order('desc')
          .take(MAX_NOTIFICATION_THREAD_DISPATCH_READBACK)
      : Promise.all(
          uniqueOperationKeys.map((operationKey) =>
            db
              .query('notificationDispatches')
              .withIndex('by_inquiry_thread_operationKey', (query) =>
                query.eq('inquiryThreadId', inquiryThreadId).eq('operationKey', operationKey)
              )
              .unique()
          )
        ).then((rows) => rows.filter((row): row is Doc<'notificationDispatches'> => row !== null)),
    loadNotificationOperatorControls(db),
  ])
  return createEmptyNotificationOutboxSourceState({
    dispatches: dispatchRows.map(toDispatchRecord).sort(compareDispatchRecords),
    controls,
  })
}

export async function loadNotificationOutboxSourceStateForDispatch(
  db: GenericDatabaseReader<DataModel>,
  dispatchId: string,
): Promise<NotificationOutboxSourceState> {
  const [dispatch, attempts, webhookEvents, controls] = await Promise.all([
    db
      .query('notificationDispatches')
      .withIndex('by_dispatchId', (query) => query.eq('dispatchId', dispatchId))
      .unique(),
    loadNotificationDispatchAttempts(db, dispatchId),
    db
      .query('notificationWebhookEvents')
      .withIndex('by_dispatch_receivedAt', (query) => query.eq('dispatchId', dispatchId))
      .order('desc')
      .take(MAX_NOTIFICATION_WEBHOOK_EVENT_READBACK),
    loadNotificationOperatorControls(db),
  ])
  return createEmptyNotificationOutboxSourceState({
    dispatches: dispatch === null ? [] : [toDispatchRecord(dispatch)],
    attempts: attempts.map(toAttemptRecord),
    webhookEvents: webhookEvents.slice().reverse().map(toWebhookEventRecord),
    controls,
  })
}

export async function loadNotificationOutboxSourceStateForWebhook(
  db: GenericDatabaseReader<DataModel>,
  scope: NotificationWebhookLoadScope,
): Promise<NotificationOutboxSourceState> {
  const dispatchLookups: Promise<Doc<'notificationDispatches'> | null>[] = []
  const references = [...new Set([scope.logicalObjectKey, scope.providerEventId])]
  const dispatchId = scope.dispatchId
  if (dispatchId !== undefined) {
    dispatchLookups.push(
      db
        .query('notificationDispatches')
        .withIndex('by_dispatchId', (query) => query.eq('dispatchId', dispatchId))
        .unique(),
    )
  }
  for (const reference of references) {
    dispatchLookups.push(
      db
        .query('notificationDispatches')
        .withIndex('by_providerIdempotencyKey', (query) => query.eq('providerIdempotencyKey', reference))
        .unique(),
    )
    if (scope.providerFamily === 'resend') {
      dispatchLookups.push(
        db
          .query('notificationDispatches')
          .withIndex('by_resendMessageId', (query) => query.eq('resendMessageId', reference))
          .unique(),
      )
    } else {
      dispatchLookups.push(
        db
          .query('notificationDispatches')
          .withIndex('by_novuTransactionId', (query) => query.eq('novuTransactionId', reference))
          .unique(),
        db
          .query('notificationDispatches')
          .withIndex('by_novuWorkflowId', (query) => query.eq('novuWorkflowId', reference))
          .unique(),
        db
          .query('notificationDispatches')
          .withIndex('by_novuMessageId', (query) => query.eq('novuMessageId', reference))
          .unique(),
        db
          .query('notificationDispatches')
          .withIndex('by_novuSubscriberId', (query) => query.eq('novuSubscriberId', reference))
          .unique(),
      )
    }
  }

  const [webhookEvent, controls, ...dispatchCandidates] = await Promise.all([
    db
      .query('notificationWebhookEvents')
      .withIndex('by_provider_event', (query) =>
        query.eq('providerFamily', scope.providerFamily).eq('providerEventId', scope.providerEventId)
      )
      .unique(),
    loadNotificationOperatorControls(db),
    ...dispatchLookups,
  ])
  const dispatches = new Map<string, Doc<'notificationDispatches'>>()
  for (const candidate of dispatchCandidates) {
    if (candidate !== null) {
      dispatches.set(candidate._id, candidate)
    }
  }

  return createEmptyNotificationOutboxSourceState({
    dispatches: [...dispatches.values()].map(toDispatchRecord),
    webhookEvents: webhookEvent === null ? [] : [toWebhookEventRecord(webhookEvent)],
    controls,
  })
}

export async function persistNotificationOutboxSourceState(
  db: GenericDatabaseWriter<DataModel>,
  before: NotificationOutboxSourceState,
  after: NotificationOutboxSourceState,
): Promise<void> {
  if (before === after) {
    return
  }

  for (const dispatch of after.dispatches) {
    const previous = before.dispatches.find((candidate) => candidate.dispatchId === dispatch.dispatchId)
    if (previous === undefined || !sameRecord(previous, dispatch)) {
      await persistNotificationDispatch(db, dispatch)
    }
  }
  for (const attempt of after.attempts) {
    const previous = before.attempts.find((candidate) => candidate.attemptId === attempt.attemptId)
    if (previous === undefined || !sameRecord(previous, attempt)) {
      await persistNotificationDispatchAttempt(db, attempt)
    }
  }
  for (const webhookEvent of after.webhookEvents) {
    const previous = before.webhookEvents.find((candidate) => candidate.webhookEventId === webhookEvent.webhookEventId)
    if (previous === undefined || !sameRecord(previous, webhookEvent)) {
      await persistNotificationWebhookEvent(db, webhookEvent)
    }
  }
}

async function loadNotificationDispatchAttempts(
  db: GenericDatabaseReader<DataModel>,
  dispatchId: string,
): Promise<Doc<'notificationDispatchAttempts'>[]> {
  const attempts = await db
    .query('notificationDispatchAttempts')
    .withIndex('by_dispatch_startedAt', (query) => query.eq('dispatchId', dispatchId))
    .order('asc')
    .take(MAX_NOTIFICATION_ATTEMPTS_PER_DISPATCH + 1)
  if (attempts.length > MAX_NOTIFICATION_ATTEMPTS_PER_DISPATCH) {
    throw new Error('notification_attempt_capacity_exceeded')
  }
  return attempts
}

function compareDispatchRecords(
  left: NotificationOutboxSourceState['dispatches'][number],
  right: NotificationOutboxSourceState['dispatches'][number],
): number {
  return left.createdAt - right.createdAt || String(left.dispatchId).localeCompare(String(right.dispatchId))
}

async function loadNotificationOperatorControls(db: GenericDatabaseReader<DataModel>) {
  const now = Date.now()
  const [dispatchControl, webhookControl] = await Promise.all([
    db
      .query('operatorControls')
      .withIndex('by_key', (query) => query.eq('key', 'notification_dispatch_enabled'))
      .unique(),
    db
      .query('operatorControls')
      .withIndex('by_key', (query) => query.eq('key', 'notification_webhooks_enabled'))
      .unique(),
  ])
  return {
    notificationDispatchEnabled: controlEnabled(dispatchControl, now),
    notificationWebhooksEnabled: controlEnabled(webhookControl, now),
  }
}

function controlEnabled(row: Doc<'operatorControls'> | null, now: number): boolean {
  if (row === null) {
    return true
  }
  return row.expiresAt !== undefined && row.expiresAt <= now ? true : row.enabled
}

function toAttemptRecord(row: Doc<'notificationDispatchAttempts'>): NotificationDispatchAttemptRecord {
  return {
    attemptId: brandNonEmpty(row.attemptId, 'NotificationDispatchAttemptId'),
    dispatchId: brandNonEmpty(row.dispatchId, 'NotificationDispatchId'),
    providerFamily: row.providerFamily,
    status: row.status,
    providerIdempotencyKey: row.providerIdempotencyKey,
    requestPayloadHash: brandNonEmpty(row.requestPayloadHash, 'SourceHash'),
    redactedRequestPayload: parseRedactedPayload(row.redactedRequestPayloadJson),
    ...(row.providerResponseHash === undefined
      ? {}
      : { providerResponseHash: brandNonEmpty(row.providerResponseHash, 'SourceHash') }),
    ...(row.redactedError === undefined ? {} : { redactedError: row.redactedError }),
    ...(row.retryAfter === undefined ? {} : { retryAfter: row.retryAfter }),
    startedAt: row.startedAt,
    ...(row.completedAt === undefined ? {} : { completedAt: row.completedAt }),
  }
}

function toWebhookEventRecord(row: Doc<'notificationWebhookEvents'>): NotificationWebhookEventRecord {
  return {
    webhookEventId: brandNonEmpty(row.webhookEventId, 'NotificationWebhookEventId'),
    providerFamily: row.providerFamily,
    providerEventId: row.providerEventId,
    logicalObjectKey: row.logicalObjectKey,
    ...(row.dispatchId === undefined ? {} : { dispatchId: brandNonEmpty(row.dispatchId, 'NotificationDispatchId') }),
    status: row.status,
    eventType: row.eventType,
    signatureStatus: row.signatureStatus,
    payloadHash: brandNonEmpty(row.payloadHash, 'SourceHash'),
    redactedPayload: parseRedactedPayload(row.redactedPayloadJson),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    operationKey: brandNonEmpty(row.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(row.correlationId, 'CorrelationId'),
    receivedAt: row.receivedAt,
  }
}

function sameRecord(left: object, right: object): boolean {
  return stableStringify(left as StableHashValue) === stableStringify(right as StableHashValue)
}

import type { GenericDatabaseReader, GenericDatabaseWriter } from 'convex/server'

import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import {
  createEmptyNotificationOutboxSourceState,
} from '../src/modules/notification-outbox/public'
import type {
  NotificationOutboxSourceState,
  NotificationOutboxSourceStateLoadScope,
} from '../src/modules/notification-outbox/public'
import type { DataModel } from './_generated/dataModel'
import {
  persistNotificationDispatch,
  persistNotificationDispatchAttempt,
  persistNotificationWebhookEvent,
} from './notificationOutboxPersistence'

type NotificationWebhookLoadScope = Extract<
  NotificationOutboxSourceStateLoadScope,
  { kind: 'webhook' }
>

export async function loadNotificationOutboxSourceStateForThread(
  _db: GenericDatabaseReader<DataModel>,
  _inquiryThreadId: string,
  _operationKeys: readonly string[] = [],
): Promise<NotificationOutboxSourceState> { return createEmptyNotificationOutboxSourceState() }


export async function loadNotificationOutboxSourceStateForDispatch(
  _db: GenericDatabaseReader<DataModel>,
  _dispatchId: string,
): Promise<NotificationOutboxSourceState> { return createEmptyNotificationOutboxSourceState() }


export async function loadNotificationOutboxSourceStateForWebhook(
  _db: GenericDatabaseReader<DataModel>,
  _scope: NotificationWebhookLoadScope,
): Promise<NotificationOutboxSourceState> { return createEmptyNotificationOutboxSourceState() }


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

function sameRecord(left: object, right: object): boolean {
  return stableStringify(left as StableHashValue) === stableStringify(right as StableHashValue)
}

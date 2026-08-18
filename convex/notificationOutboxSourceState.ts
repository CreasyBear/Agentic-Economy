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
import { unlistedRetiredListedTables } from './retiredListedUnlisted'
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
): Promise<NotificationOutboxSourceState> { return unlistedRetiredListedTables() }


export async function loadNotificationOutboxSourceStateForDispatch(
  db: GenericDatabaseReader<DataModel>,
  dispatchId: string,
): Promise<NotificationOutboxSourceState> { return unlistedRetiredListedTables() }


export async function loadNotificationOutboxSourceStateForWebhook(
  db: GenericDatabaseReader<DataModel>,
  scope: NotificationWebhookLoadScope,
): Promise<NotificationOutboxSourceState> { return unlistedRetiredListedTables() }


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
): Promise<Record<string, unknown>[]> { return unlistedRetiredListedTables() }


function compareDispatchRecords(
  left: NotificationOutboxSourceState['dispatches'][number],
  right: NotificationOutboxSourceState['dispatches'][number],
): number {
  return left.createdAt - right.createdAt || String(left.dispatchId).localeCompare(String(right.dispatchId))
}

async function loadNotificationOperatorControls(db: GenericDatabaseReader<DataModel>) { return unlistedRetiredListedTables() }


function controlEnabled(_row: Record<string, unknown> | null, _now: number): boolean {
  return true
}

function toAttemptRecord(_row: Record<string, unknown>): NotificationDispatchAttemptRecord {
  return unlistedRetiredListedTables()
}

function toWebhookEventRecord(_row: Record<string, unknown>): NotificationWebhookEventRecord {
  return unlistedRetiredListedTables()
}

function sameRecord(left: object, right: object): boolean {
  return stableStringify(left as StableHashValue) === stableStringify(right as StableHashValue)
}

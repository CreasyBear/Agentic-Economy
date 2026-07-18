import type { UserIdentity } from 'convex/server'

import { stableHash } from '../src/modules/common/stable-hash'
import type { RedactedPayload } from '../src/modules/observability/public'
import type {
  NotificationOutboxOperatorPorts,
  NotificationReconstructionInput,
} from '../src/modules/notification-outbox/operator'
import type { NotificationOperatorAuthority } from '../src/modules/notification-outbox/public'
import { readActiveAdminMembership } from './authz'
import { upsertByFields } from './inquiryRuntimeDbHelpers'
import { notificationOutboxSourceStatePorts } from './notificationOutboxSourceStatePorts'
import { runtimeDb, type RuntimeDb } from './source_state'

type OperatorCtx = {
  db: object
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

export function notificationOutboxOperatorPorts(ctx: OperatorCtx): NotificationOutboxOperatorPorts {
  const db = runtimeDb(ctx.db)
  const sourceState = notificationOutboxSourceStatePorts(db)
  return {
    now: () => Date.now(),
    loadSourceState: () => sourceState.load(),
    persistSourceState: (state) => sourceState.persist(state),
    readOperatorAuthority: () => readCurrentOperatorAuthority(ctx),
    recordReconstruction: (input) => recordNotificationOperationReconstruction(db, input),
  }
}

export async function recordNotificationOperationReconstruction(
  db: RuntimeDb,
  input: NotificationReconstructionInput,
): Promise<void> {
  const targetRef = input.webhookEvent?.webhookEventId ?? input.dispatch?.dispatchId ?? 'notification:unknown'
  const businessId = input.dispatch?.businessId
  const requestHash = stableHash({
    code: input.code,
    ...(input.dispatch === undefined ? {} : { dispatchId: input.dispatch.dispatchId }),
    ...(input.attempt === undefined ? {} : { attemptId: input.attempt.attemptId }),
    ...(input.webhookEvent === undefined ? {} : { webhookEventId: input.webhookEvent.webhookEventId }),
  })
  const effectRefs = [
    `result:${input.code}`,
    input.dispatch === undefined ? undefined : `dispatch:${input.dispatch.dispatchId}`,
    input.dispatch === undefined ? undefined : `inquiryThread:${input.dispatch.inquiryThreadId}`,
    input.dispatch === undefined ? undefined : `inquiryMessage:${input.dispatch.inquiryMessageId}`,
    input.attempt === undefined ? undefined : `attempt:${input.attempt.attemptId}`,
    input.webhookEvent === undefined ? undefined : `webhook:${input.webhookEvent.webhookEventId}`,
  ].filter(isString)

  await upsertByFields(db, 'operationKeys', ['scope', 'key'], {
    scope: 'notification',
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    operationName: notificationOperationName(input.code),
    key: input.operationKey,
    requestHash,
    sourceHash: targetRef,
    status: 'succeeded',
    resultHash: stableHash({ code: input.code, targetRef }),
    effectRefs,
    createdAt: notificationReconstructionTime(input),
    updatedAt: notificationReconstructionTime(input),
  })

  const reasonCode = notificationReasonCode(input)
  await upsertNotificationAuditEvent(db, {
    eventType: notificationAuditEventType(input),
    targetType: input.webhookEvent === undefined ? 'notification' : 'notification_provider_event',
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    targetRef,
    ...(businessId === undefined ? {} : { businessId }),
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: notificationBeforeState(input),
    afterState: notificationAfterState(input),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    redactedPayload: notificationReconstructionPayload(input),
    createdAt: notificationReconstructionTime(input),
  })

  await upsertNotificationFunnelEvent(db, input)
}

async function readCurrentOperatorAuthority(
  ctx: OperatorCtx,
): Promise<NotificationOperatorAuthority | undefined> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return undefined
  }

  const membership = await readActiveAdminMembership(runtimeDb(ctx.db), identity)
  if (membership === undefined) {
    return undefined
  }

  return {
    role: membership.role,
    actorRef: `admin:${membership.clerkUserId}`,
  }
}

async function upsertNotificationAuditEvent(
  db: RuntimeDb,
  input: {
    eventType: string
    targetType: 'notification' | 'notification_provider_event'
    actorKind: 'admin' | 'system'
    actorRef: string
    targetRef: string
    businessId?: string
    operationKey: string
    correlationId: string
    beforeState: string
    afterState: string
    reasonCode?: string
    redactedPayload: RedactedPayload
    createdAt: number
  },
): Promise<void> {
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId: `audit:${stableHash({
      eventType: input.eventType,
      operationKey: input.operationKey,
      targetRef: input.targetRef,
    })}`,
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    targetType: input.targetType,
    targetRef: input.targetRef,
    beforeState: input.beforeState,
    afterState: input.afterState,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    evidenceRefs: [],
    redactedPayloadJson: JSON.stringify(input.redactedPayload),
    payloadHash: stableHash(input.redactedPayload),
    createdAt: input.createdAt,
  })
}

async function upsertNotificationFunnelEvent(
  db: RuntimeDb,
  input: NotificationReconstructionInput,
): Promise<void> {
  const eventType = notificationFunnelEventType(input)
  if (eventType === undefined || input.dispatch === undefined) {
    return
  }

  await upsertByFields(db, 'funnelEvents', ['eventType', 'businessId', 'correlationId', 'createdAt'], {
    eventType,
    source: 'notification-outbox',
    stage: 'published',
    pseudonymousSessionId: `notification:${input.dispatch.recipientRole}`,
    businessId: input.dispatch.businessId,
    redactedPayloadJson: JSON.stringify({
      dispatchId: input.dispatch.dispatchId,
      providerFamily: input.dispatch.providerFamily,
      status: input.dispatch.status,
    }),
    consentFlag: true,
    correlationId: input.correlationId,
    createdAt: notificationReconstructionTime(input),
  })
}

function notificationOperationName(code: string): string {
  if (code === 'notification_queued' || code === 'notification_enqueue_replayed') {
    return 'enqueueInquiryNotification'
  }
  if (code.startsWith('notification_webhook_')) {
    return 'ingestNotificationWebhook'
  }
  if (code === 'notification_retry_scheduled') {
    return 'retryNotificationDispatch'
  }
  if (code === 'notification_no_repair_marked') {
    return 'markNotificationNoRepair'
  }
  return 'dispatchNotificationOutbox'
}

function notificationAuditEventType(input: NotificationReconstructionInput): string {
  if (input.code === 'notification_queued' || input.code === 'notification_enqueue_replayed') return 'notification.queued'
  if (input.code === 'notification_sent') return 'notification.sent'
  if (input.code === 'notification_provider_missing' || input.code === 'notification_orchestrator_missing') return 'notification.failed'
  if (input.code === 'notification_dispatch_failed') return 'notification.failed'
  if (input.code === 'notification_retry_scheduled') return 'notification.retry_scheduled'
  if (input.code === 'notification_no_repair_marked') return 'notification.no_repair_marked'
  if (input.code === 'notification_webhook_duplicate') return 'notification.webhook_duplicate'
  if (input.code === 'notification_webhook_rejected') return 'notification.webhook_rejected'
  if (input.code === 'notification_webhook_held') return 'notification.webhook_held'
  if (input.code === 'notification_webhook_received') return 'notification.webhook_received'
  return 'notification.triggered'
}

function notificationBeforeState(input: NotificationReconstructionInput): string {
  if (input.code === 'notification_queued' || input.code === 'notification_enqueue_replayed') return 'none'
  if (input.webhookEvent !== undefined) return 'provider_event_received'
  return 'queued'
}

function notificationAfterState(input: NotificationReconstructionInput): string {
  if (input.webhookEvent !== undefined) return input.webhookEvent.status
  return input.dispatch?.status ?? input.code
}

function notificationReasonCode(input: NotificationReconstructionInput): string | undefined {
  return input.webhookEvent?.reason ?? input.dispatch?.lastRedactedError ?? input.attempt?.redactedError
}

function notificationReconstructionPayload(input: NotificationReconstructionInput): RedactedPayload {
  return {
    code: input.code,
    ...(input.dispatch === undefined
      ? {}
      : {
          dispatchId: input.dispatch.dispatchId,
          providerFamily: input.dispatch.providerFamily,
          status: input.dispatch.status,
          payloadHash: input.dispatch.payloadHash,
          inquiryThreadId: input.dispatch.inquiryThreadId,
          inquiryMessageId: input.dispatch.inquiryMessageId,
        }),
    ...(input.attempt === undefined
      ? {}
      : {
          attemptId: input.attempt.attemptId,
          attemptStatus: input.attempt.status,
          requestPayloadHash: input.attempt.requestPayloadHash,
        }),
    ...(input.webhookEvent === undefined
      ? {}
      : {
          webhookEventId: input.webhookEvent.webhookEventId,
          providerEventId: input.webhookEvent.providerEventId,
          logicalObjectKey: input.webhookEvent.logicalObjectKey,
          status: input.webhookEvent.status,
          signatureStatus: input.webhookEvent.signatureStatus,
          payloadHash: input.webhookEvent.payloadHash,
        }),
  }
}

function notificationReconstructionTime(input: NotificationReconstructionInput): number {
  return input.webhookEvent?.receivedAt
    ?? input.attempt?.completedAt
    ?? input.attempt?.startedAt
    ?? input.dispatch?.updatedAt
    ?? Date.now()
}

function notificationFunnelEventType(
  input: NotificationReconstructionInput,
): 'notification_queued' | 'notification_delivered' | 'notification_failed' | undefined {
  if (input.code === 'notification_queued') {
    return 'notification_queued'
  }
  const status = input.dispatch?.status
  if (status === 'delivered' || status === 'sent') {
    return 'notification_delivered'
  }
  if (
    status === 'failed'
    || status === 'provider_missing'
    || status === 'orchestrator_missing'
    || status === 'bounced'
    || status === 'complained'
    || status === 'suppressed'
  ) {
    return 'notification_failed'
  }
  return undefined
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import type { BusinessId, CorrelationId, NotificationDispatchId, OperationKey, SourceHash } from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import * as notificationOutbox from '@/modules/notification-outbox/public'
import type {
  EnqueueInquiryNotificationCommand,
  IngestNotificationWebhookCommand,
  NotificationOutboxSourceState,
  NotificationProviderAdapter,
  NotificationProviderTriggerResult,
} from '@/modules/notification-outbox/public'
import type { RedactedPayload } from '@/modules/observability/public'

const businessId = brandNonEmpty('business:notification', 'BusinessId')
const operationKey = brandNonEmpty('notification:enqueue:1', 'OperationKey')
const correlationId = brandNonEmpty('correlation:notification:1', 'CorrelationId')
const now = 1_950_000_000_000
const operator = { role: 'owner_admin' as const, actorRef: 'admin:notification' }

describe('notification outbox readback', () => {
  it('queues inquiry notifications idempotently without leaking private body or contact', () => {
    const first = enqueue()
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') throw new Error(first.code)
    expect(first.dispatch).toMatchObject({
      businessId,
      inquiryThreadId: 'inquiry_thread:1',
      inquiryMessageId: 'inquiry_message:1',
      recipientRole: 'owner',
      providerFamily: 'resend',
      status: 'queued',
    })
    expect(JSON.stringify(first.dispatch)).not.toContain('customer@example.test')
    expect(JSON.stringify(first.dispatch)).not.toContain('burst pipe raw body')

    const replay = notificationOutbox.enqueueInquiryNotification(first.state, enqueueCommand())
    expect(replay).toMatchObject({ kind: 'ok', code: 'notification_enqueue_replayed' })
    if (replay.kind !== 'ok') throw new Error(replay.code)
    expect(replay.state.dispatches).toHaveLength(1)

    const conflict = notificationOutbox.enqueueInquiryNotification(first.state, {
      ...enqueueCommand(),
      redactedPayload: { bodyHash: stableHash('changed body') },
    })
    expect(conflict).toMatchObject({ kind: 'error', code: 'notification_duplicate_conflict' })
  })

  it('records provider and orchestrator missing states without making delivery the message truth', () => {
    const queued = requireQueued(enqueue())

    const missingResend = notificationOutbox.dispatchNotificationOutbox(
      queued.state,
      dispatchCommand(queued.dispatch.dispatchId),
      undefined
    )
    expect(missingResend).toMatchObject({
      kind: 'ok',
      code: 'notification_provider_missing',
      dispatch: { status: 'provider_missing', providerMissing: true },
      attempt: { status: 'provider_missing' },
    })
    if (missingResend.kind !== 'ok') throw new Error(missingResend.code)
    expect(missingResend.state.dispatches).toHaveLength(1)
    expect(missingResend.state.attempts).toHaveLength(1)

    const queuedNovu = requireQueued(enqueue(notificationOutbox.createEmptyNotificationOutboxSourceState(), {
      providerFamily: 'novu',
      operationKey: brandNonEmpty('notification:enqueue:novu', 'OperationKey'),
    }))
    const missingNovu = notificationOutbox.dispatchNotificationOutbox(
      queuedNovu.state,
      dispatchCommand(queuedNovu.dispatch.dispatchId, 'novu'),
      undefined
    )
    expect(missingNovu).toMatchObject({
      kind: 'ok',
      code: 'notification_orchestrator_missing',
      dispatch: { status: 'orchestrator_missing', orchestratorMissing: true },
    })
  })

  it('records provider refs on successful Resend and Novu dispatch attempts', () => {
    const queued = requireQueued(enqueue())
    const sent = notificationOutbox.dispatchNotificationOutbox(
      queued.state,
      dispatchCommand(queued.dispatch.dispatchId),
      provider('resend', {
        kind: 'ok',
        status: 'sent',
        resendMessageId: 'resend:message:1',
        providerResponseHash: stableHash({ resend: 'message:1' }),
      })
    )
    expect(sent).toMatchObject({
      kind: 'ok',
      code: 'notification_sent',
      dispatch: { status: 'sent', resendMessageId: 'resend:message:1' },
    })

    const queuedNovu = requireQueued(enqueue(notificationOutbox.createEmptyNotificationOutboxSourceState(), {
      providerFamily: 'novu',
      operationKey: brandNonEmpty('notification:enqueue:novu:success', 'OperationKey'),
    }))
    const triggered = notificationOutbox.dispatchNotificationOutbox(
      queuedNovu.state,
      dispatchCommand(queuedNovu.dispatch.dispatchId, 'novu-success'),
      provider('novu', {
        kind: 'ok',
        status: 'triggered',
        novuTransactionId: 'novu:transaction:1',
        novuWorkflowId: 'workflow:inquiry-owner',
        novuSubscriberId: 'subscriber:owner',
        providerResponseHash: stableHash({ novu: 'transaction:1' }),
      })
    )
    expect(triggered).toMatchObject({
      kind: 'ok',
      code: 'notification_triggered',
      dispatch: {
        status: 'triggered',
        novuTransactionId: 'novu:transaction:1',
        novuWorkflowId: 'workflow:inquiry-owner',
        novuSubscriberId: 'subscriber:owner',
      },
    })
  })

  it('rejects unsigned webhooks, holds unbound signed webhooks, and dedupes signed repeats', () => {
    const queued = requireQueued(enqueue())

    const rejected = notificationOutbox.ingestNotificationWebhook(queued.state, webhookCommand({
      signatureStatus: 'rejected',
      providerEventId: 'svix:bad',
      dispatchId: queued.dispatch.dispatchId,
    }))
    expect(rejected).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_rejected',
      webhookEvent: { status: 'rejected', reason: 'signature_rejected' },
    })
    if (rejected.kind !== 'ok') throw new Error(rejected.code)
    expect(rejected.state.dispatches[0]?.status).toBe('queued')

    const held = notificationOutbox.ingestNotificationWebhook(rejected.state, webhookCommand({
      providerEventId: 'svix:unbound',
      logicalObjectKey: 'resend:missing',
    }))
    expect(held).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_held',
      webhookEvent: { status: 'held_for_operator', reason: 'unbound_provider_event' },
    })
    if (held.kind !== 'ok') throw new Error(held.code)
    expect(held.state.dispatches[0]?.status).toBe('queued')

    const delivered = notificationOutbox.ingestNotificationWebhook(held.state, webhookCommand({
      providerEventId: 'svix:delivered',
      eventType: 'email.delivered',
      dispatchId: queued.dispatch.dispatchId,
    }))
    expect(delivered).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_received',
      dispatch: { status: 'delivered' },
      webhookEvent: { status: 'accepted' },
    })
    if (delivered.kind !== 'ok') throw new Error(delivered.code)

    const duplicate = notificationOutbox.ingestNotificationWebhook(delivered.state, webhookCommand({
      providerEventId: 'svix:delivered',
      eventType: 'email.delivered',
      dispatchId: queued.dispatch.dispatchId,
    }))
    expect(duplicate).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_duplicate',
      webhookEvent: { status: 'duplicate' },
    })

    const conflict = notificationOutbox.ingestNotificationWebhook(delivered.state, webhookCommand({
      providerEventId: 'svix:delivered',
      eventType: 'email.delivered',
      dispatchId: queued.dispatch.dispatchId,
      payloadHash: stableHash({ providerEventId: 'svix:delivered', changed: true }),
    }))
    expect(conflict).toMatchObject({
      kind: 'ok',
      code: 'notification_webhook_held',
      webhookEvent: { status: 'held_for_operator', reason: 'provider_event_payload_conflict' },
    })
  })

  it('keeps retry and no-repair controls operator-only while owners receive read-only repair posture', () => {
    const queued = requireQueued(enqueue())
    const failed = notificationOutbox.dispatchNotificationOutbox(
      queued.state,
      dispatchCommand(queued.dispatch.dispatchId),
      provider('resend', {
        kind: 'error',
        status: 'failed',
        redactedError: 'provider accepted no raw payload <secret>',
        retryAfter: now + 60_000,
      })
    )
    expect(failed.kind).toBe('ok')
    if (failed.kind !== 'ok') throw new Error(failed.code)

    const readback = notificationOutbox.readNotificationDispatchReadback(failed.state, queued.dispatch.dispatchId)
    expect(readback).toMatchObject({
      kind: 'ok',
      readback: {
        ownerCanRepair: false,
        operatorNextAction: 'retry_available',
        dispatch: { status: 'failed' },
      },
    })

    const ownerRetry = notificationOutbox.retryNotificationDispatch(failed.state, {
      dispatchId: queued.dispatch.dispatchId,
      operationKey: brandNonEmpty('notification:retry:owner', 'OperationKey'),
      correlationId,
      retryAfter: now + 60_000,
      now: now + 10,
    })
    expect(ownerRetry).toMatchObject({ kind: 'error', code: 'notification_operator_denied' })

    const retry = notificationOutbox.retryNotificationDispatch(failed.state, {
      authority: operator,
      dispatchId: queued.dispatch.dispatchId,
      operationKey: brandNonEmpty('notification:retry:operator', 'OperationKey'),
      correlationId,
      retryAfter: now + 60_000,
      now: now + 11,
    })
    expect(retry).toMatchObject({
      kind: 'ok',
      code: 'notification_retry_scheduled',
      dispatch: { status: 'retry_scheduled', retryCount: 1 },
    })
    if (retry.kind !== 'ok') throw new Error(retry.code)

    const supportNoRepair = notificationOutbox.markNotificationNoRepair(retry.state, {
      authority: { role: 'support', actorRef: 'support:notification' },
      dispatchId: queued.dispatch.dispatchId,
      operationKey: brandNonEmpty('notification:no-repair:support', 'OperationKey'),
      correlationId,
      reason: 'support cannot terminally close',
      now: now + 12,
    })
    expect(supportNoRepair).toMatchObject({ kind: 'error', code: 'notification_operator_denied' })

    const noRepair = notificationOutbox.markNotificationNoRepair(retry.state, {
      authority: operator,
      dispatchId: queued.dispatch.dispatchId,
      operationKey: brandNonEmpty('notification:no-repair:admin', 'OperationKey'),
      correlationId,
      reason: 'Provider evidence exhausted; keep inquiry message intact.',
      now: now + 13,
    })
    expect(noRepair).toMatchObject({
      kind: 'ok',
      code: 'notification_no_repair_marked',
      dispatch: { status: 'no_repair' },
    })
  })
})

function enqueue(
  state: NotificationOutboxSourceState = notificationOutbox.createEmptyNotificationOutboxSourceState(),
  overrides: Partial<EnqueueInquiryNotificationCommand> = {}
) {
  return notificationOutbox.enqueueInquiryNotification(state, { ...enqueueCommand(), ...overrides })
}

function enqueueCommand(): EnqueueInquiryNotificationCommand {
  return {
    businessId,
    inquiryThreadId: 'inquiry_thread:1',
    inquiryMessageId: 'inquiry_message:1',
    recipientRole: 'owner' as const,
    providerFamily: 'resend' as const,
    redactedPayload: {
      bodyHash: stableHash('burst pipe raw body'),
      contactHash: stableHash('customer@example.test'),
      template: 'inquiry-owner',
    },
    operationKey,
    correlationId,
    now,
  }
}

function dispatchCommand(dispatchId: NotificationDispatchId, suffix = '1') {
  return {
    dispatchId,
    operationKey: brandNonEmpty(`notification:dispatch:${suffix}`, 'OperationKey'),
    correlationId: brandNonEmpty(`correlation:notification:${suffix}`, 'CorrelationId'),
    now: now + 1,
  }
}

function webhookCommand(overrides: Partial<{
  providerFamily: 'resend'
  providerEventId: string
  logicalObjectKey: string
  eventType: string
  signatureStatus: 'verified' | 'rejected'
  payloadHash: SourceHash
  redactedPayload: RedactedPayload
  operationKey: OperationKey
  correlationId: CorrelationId
  receivedAt: number
  dispatchId: NotificationDispatchId
}> = {}) {
  const providerEventId = overrides.providerEventId ?? 'svix:1'
  const payloadHash = overrides.payloadHash ?? stableHash({ providerEventId, eventType: overrides.eventType ?? 'email.delivered' })
  const command: IngestNotificationWebhookCommand = {
    providerFamily: 'resend' as const,
    providerEventId,
    logicalObjectKey: overrides.logicalObjectKey ?? 'resend:message:1',
    eventType: overrides.eventType ?? 'email.delivered',
    signatureStatus: overrides.signatureStatus ?? 'verified',
    payloadHash,
    redactedPayload: overrides.redactedPayload ?? { providerEventId, payloadHash },
    operationKey: overrides.operationKey ?? brandNonEmpty(`notification:webhook:${providerEventId}`, 'OperationKey'),
    correlationId: overrides.correlationId ?? brandNonEmpty(`correlation:notification:webhook:${providerEventId}`, 'CorrelationId'),
    receivedAt: overrides.receivedAt ?? now + 2,
    ...(overrides.dispatchId === undefined ? {} : { dispatchId: overrides.dispatchId }),
  }
  return command
}

function provider(family: 'resend' | 'novu', result: NotificationProviderTriggerResult): NotificationProviderAdapter {
  return {
    family,
    trigger: () => result,
  }
}

function requireQueued(value: ReturnType<typeof enqueue>) {
  expect(value.kind).toBe('ok')
  if (value.kind !== 'ok') throw new Error(value.code)
  return value
}

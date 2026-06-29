import { brandNonEmpty } from '@/modules/common/ids'
import type {
  BusinessId,
  CorrelationId,
  NotificationDispatchAttemptId,
  NotificationDispatchId,
  NotificationWebhookEventId,
  OperationKey,
  SourceHash,
} from '@/modules/common/ids'
import { error, ok, type ModuleResult } from '@/modules/common/result'
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import type { RedactedPayload } from '@/modules/observability/public'
import {
  defaultNotificationOperatorControls,
  type NotificationAttemptStatus,
  type NotificationDispatchAttemptRecord,
  type NotificationDispatchReadback,
  type NotificationDispatchRecord,
  type NotificationDispatchStatus,
  type NotificationOperatorAuthority,
  type NotificationOutboxSourceState,
  type NotificationProviderFamily,
  type NotificationRecipientRole,
  type NotificationSignatureStatus,
  type NotificationWebhookEventRecord,
  type NotificationWebhookEventStatus,
} from './schema'

export type EnqueueInquiryNotificationCommand = {
  businessId: BusinessId
  inquiryThreadId: string
  inquiryMessageId: string
  recipientRole: NotificationRecipientRole
  providerFamily: NotificationProviderFamily
  redactedPayload: RedactedPayload
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
  providerIdempotencyKey?: string
}

export type NotificationProviderTriggerResult =
  | {
      kind: 'ok'
      status: Extract<NotificationDispatchStatus, 'triggered' | 'sent'>
      providerResponseHash: SourceHash
      resendMessageId?: string
      novuTransactionId?: string
      novuWorkflowId?: string
      novuMessageId?: string
      novuSubscriberId?: string
    }
  | {
      kind: 'error'
      status: Extract<NotificationAttemptStatus, 'failed' | 'provider_missing' | 'orchestrator_missing'>
      redactedError: string
      retryAfter?: number
      providerResponseHash?: SourceHash
    }

export type NotificationProviderAdapter = {
  family: NotificationProviderFamily
  trigger: (dispatch: NotificationDispatchRecord) => NotificationProviderTriggerResult
}

export type DispatchNotificationOutboxCommand = {
  dispatchId: NotificationDispatchId
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type IngestNotificationWebhookCommand = {
  providerFamily: NotificationProviderFamily
  providerEventId: string
  logicalObjectKey: string
  eventType: string
  signatureStatus: NotificationSignatureStatus
  payloadHash: SourceHash
  redactedPayload: RedactedPayload
  operationKey: OperationKey
  correlationId: CorrelationId
  receivedAt: number
  dispatchId?: NotificationDispatchId
}

export type RetryNotificationDispatchCommand = {
  authority?: NotificationOperatorAuthority
  dispatchId: NotificationDispatchId
  operationKey: OperationKey
  correlationId: CorrelationId
  retryAfter: number
  now: number
}

export type MarkNotificationNoRepairCommand = {
  authority?: NotificationOperatorAuthority
  dispatchId: NotificationDispatchId
  operationKey: OperationKey
  correlationId: CorrelationId
  reason: string
  now: number
}

export type NotificationOutboxErrorCode =
  | 'notification_not_found'
  | 'notification_duplicate_conflict'
  | 'notification_dispatch_disabled'
  | 'notification_webhooks_disabled'
  | 'notification_operator_denied'
  | 'notification_provider_mismatch'
  | 'notification_terminal'

export type EnqueueInquiryNotificationResult = ModuleResult<
  'notification_queued' | 'notification_enqueue_replayed',
  NotificationOutboxErrorCode,
  { state: NotificationOutboxSourceState; dispatch: NotificationDispatchRecord },
  { reason: string }
>

export type DispatchNotificationOutboxResult = ModuleResult<
  | 'notification_triggered'
  | 'notification_sent'
  | 'notification_provider_missing'
  | 'notification_orchestrator_missing'
  | 'notification_dispatch_failed'
  | 'notification_dispatch_replayed',
  NotificationOutboxErrorCode,
  {
    state: NotificationOutboxSourceState
    dispatch: NotificationDispatchRecord
    attempt: NotificationDispatchAttemptRecord
  },
  { reason: string }
>
type DispatchNotificationOkCode = Extract<DispatchNotificationOutboxResult, { kind: 'ok' }>['code']

export type IngestNotificationWebhookResult = ModuleResult<
  | 'notification_webhook_received'
  | 'notification_webhook_duplicate'
  | 'notification_webhook_rejected'
  | 'notification_webhook_held',
  NotificationOutboxErrorCode,
  {
    state: NotificationOutboxSourceState
    webhookEvent: NotificationWebhookEventRecord
    dispatch?: NotificationDispatchRecord
  },
  { reason: string }
>

export type RetryNotificationDispatchResult = ModuleResult<
  'notification_retry_scheduled',
  NotificationOutboxErrorCode,
  { state: NotificationOutboxSourceState; dispatch: NotificationDispatchRecord },
  { reason: string }
>

export type MarkNotificationNoRepairResult = ModuleResult<
  'notification_no_repair_marked',
  NotificationOutboxErrorCode,
  { state: NotificationOutboxSourceState; dispatch: NotificationDispatchRecord },
  { reason: string }
>

export type ReadNotificationDispatchReadbackResult = ModuleResult<
  'notification_dispatch_read',
  'notification_not_found',
  { readback: NotificationDispatchReadback },
  { reason: string }
>

export function createEmptyNotificationOutboxSourceState(
  input: Partial<NotificationOutboxSourceState> = {}
): NotificationOutboxSourceState {
  return {
    dispatches: [],
    attempts: [],
    webhookEvents: [],
    controls: defaultNotificationOperatorControls,
    ...input,
  }
}

export function enqueueInquiryNotification(
  state: NotificationOutboxSourceState,
  command: EnqueueInquiryNotificationCommand
): EnqueueInquiryNotificationResult {
  const requestHash = stableHash({
    businessId: command.businessId,
    inquiryThreadId: command.inquiryThreadId,
    inquiryMessageId: command.inquiryMessageId,
    recipientRole: command.recipientRole,
    providerFamily: command.providerFamily,
    redactedPayload: command.redactedPayload,
  })
  const existing = state.dispatches.find((dispatch) => dispatch.operationKey === command.operationKey)
  if (existing !== undefined) {
    if (existing.payloadHash !== requestHash) {
      return error('notification_duplicate_conflict', false, { reason: 'operation_key_conflict' })
    }

    return ok('notification_enqueue_replayed', { state, dispatch: existing })
  }

  const dispatchId = notificationDispatchId({ action: 'enqueue', operationKey: command.operationKey, requestHash })
  const dispatch: NotificationDispatchRecord = {
    dispatchId,
    businessId: command.businessId,
    inquiryThreadId: command.inquiryThreadId,
    inquiryMessageId: command.inquiryMessageId,
    recipientRole: command.recipientRole,
    providerFamily: command.providerFamily,
    status: 'queued',
    providerIdempotencyKey: command.providerIdempotencyKey ?? `ae:${dispatchId}`,
    redactedPayload: command.redactedPayload,
    payloadHash: requestHash,
    providerMissing: false,
    orchestratorMissing: false,
    retryCount: 0,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    createdAt: command.now,
    updatedAt: command.now,
  }

  return ok('notification_queued', { state: { ...state, dispatches: [...state.dispatches, dispatch] }, dispatch })
}

export function dispatchNotificationOutbox(
  state: NotificationOutboxSourceState,
  command: DispatchNotificationOutboxCommand,
  provider: NotificationProviderAdapter | undefined
): DispatchNotificationOutboxResult {
  if (!state.controls.notificationDispatchEnabled) {
    return error('notification_dispatch_disabled', false, { reason: 'notification_dispatch_disabled' })
  }

  const dispatch = findDispatch(state, command.dispatchId)
  if (dispatch === undefined) {
    return error('notification_not_found', false, { reason: 'notification_not_found' })
  }

  if (isTerminalDispatch(dispatch.status)) {
    return error('notification_terminal', false, { reason: 'notification_terminal' })
  }

  const previousAttempt = state.attempts.find((attempt) => attempt.dispatchId === command.dispatchId && attempt.providerIdempotencyKey === dispatch.providerIdempotencyKey)
  if (previousAttempt !== undefined && previousAttempt.completedAt !== undefined) {
    return ok(codeForDispatchStatus(dispatch.status), { state, dispatch, attempt: previousAttempt })
  }

  if (provider === undefined) {
    return completeDispatchAttempt(state, dispatch, command, {
      kind: 'error',
      status: dispatch.providerFamily === 'novu' ? 'orchestrator_missing' : 'provider_missing',
      redactedError: `${dispatch.providerFamily}_provider_missing`,
    })
  }

  if (provider.family !== dispatch.providerFamily) {
    return error('notification_provider_mismatch', false, { reason: 'notification_provider_mismatch' })
  }

  return completeDispatchAttempt(state, dispatch, command, provider.trigger(dispatch))
}

export function ingestNotificationWebhook(
  state: NotificationOutboxSourceState,
  command: IngestNotificationWebhookCommand
): IngestNotificationWebhookResult {
  if (!state.controls.notificationWebhooksEnabled && command.signatureStatus === 'verified') {
    return recordWebhookEvent(state, command, 'rejected', 'notification_webhooks_disabled')
  }

  if (command.signatureStatus !== 'verified') {
    return recordWebhookEvent(state, command, 'rejected', 'signature_rejected')
  }

  const existing = state.webhookEvents.find((event) => event.providerFamily === command.providerFamily && event.providerEventId === command.providerEventId)
  if (existing !== undefined) {
    if (existing.payloadHash !== command.payloadHash) {
      return recordWebhookEvent(state, command, 'held_for_operator', 'provider_event_payload_conflict')
    }

    return ok('notification_webhook_duplicate', { state, webhookEvent: { ...existing, status: 'duplicate' } })
  }

  const dispatch = command.dispatchId === undefined ? undefined : findDispatch(state, command.dispatchId)
  if (dispatch === undefined) {
    return recordWebhookEvent(state, command, 'held_for_operator', 'unbound_provider_event')
  }

  const nextStatus = dispatchStatusForProviderEvent(command.eventType)
  const nextDispatch = {
    ...dispatch,
    status: nextStatus,
    updatedAt: command.receivedAt,
  }
  const webhook = webhookEvent(command, 'accepted')
  const nextState = {
    ...state,
    dispatches: replaceDispatch(state.dispatches, nextDispatch),
    webhookEvents: [...state.webhookEvents, webhook],
  }

  return ok('notification_webhook_received', { state: nextState, webhookEvent: webhook, dispatch: nextDispatch })
}

export function readNotificationDispatchReadback(
  state: NotificationOutboxSourceState,
  dispatchId: NotificationDispatchId
): ReadNotificationDispatchReadbackResult {
  const dispatch = findDispatch(state, dispatchId)
  if (dispatch === undefined) {
    return error('notification_not_found', false, { reason: 'notification_not_found' })
  }

  return ok('notification_dispatch_read', {
    readback: {
      dispatch,
      attempts: state.attempts.filter((attempt) => attempt.dispatchId === dispatchId),
      webhookEvents: state.webhookEvents.filter((event) => event.dispatchId === dispatchId),
      ownerCanRepair: false,
      operatorNextAction: operatorNextAction(dispatch),
    },
  })
}

export function retryNotificationDispatch(
  state: NotificationOutboxSourceState,
  command: RetryNotificationDispatchCommand
): RetryNotificationDispatchResult {
  const authority = requireOperator(command.authority, 'retry')
  if (authority.kind === 'denied') {
    return error('notification_operator_denied', false, { reason: authority.reason })
  }
  if (!state.controls.notificationDispatchEnabled) {
    return error('notification_dispatch_disabled', false, { reason: 'notification_dispatch_disabled' })
  }

  const dispatch = findDispatch(state, command.dispatchId)
  if (dispatch === undefined) {
    return error('notification_not_found', false, { reason: 'notification_not_found' })
  }
  if (dispatch.status === 'no_repair') {
    return error('notification_terminal', false, { reason: 'notification_terminal' })
  }

  const nextDispatch: NotificationDispatchRecord = {
    ...dispatch,
    status: 'retry_scheduled',
    retryCount: dispatch.retryCount + 1,
    retryAfter: command.retryAfter,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    updatedAt: command.now,
  }

  return ok('notification_retry_scheduled', { state: { ...state, dispatches: replaceDispatch(state.dispatches, nextDispatch) }, dispatch: nextDispatch })
}

export function markNotificationNoRepair(
  state: NotificationOutboxSourceState,
  command: MarkNotificationNoRepairCommand
): MarkNotificationNoRepairResult {
  const authority = requireOperator(command.authority, 'mark_no_repair')
  if (authority.kind === 'denied') {
    return error('notification_operator_denied', false, { reason: authority.reason })
  }

  const dispatch = findDispatch(state, command.dispatchId)
  if (dispatch === undefined) {
    return error('notification_not_found', false, { reason: 'notification_not_found' })
  }

  const nextDispatch: NotificationDispatchRecord = {
    ...dispatch,
    status: 'no_repair',
    lastRedactedError: normalizeReason(command.reason),
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    updatedAt: command.now,
  }

  return ok('notification_no_repair_marked', {
    state: { ...state, dispatches: replaceDispatch(state.dispatches, nextDispatch) },
    dispatch: nextDispatch,
  })
}

function completeDispatchAttempt(
  state: NotificationOutboxSourceState,
  dispatch: NotificationDispatchRecord,
  command: DispatchNotificationOutboxCommand,
  result: NotificationProviderTriggerResult
): DispatchNotificationOutboxResult {
  const attempt: NotificationDispatchAttemptRecord = {
    attemptId: notificationDispatchAttemptId({ dispatchId: dispatch.dispatchId, operationKey: command.operationKey, now: command.now }),
    dispatchId: dispatch.dispatchId,
    providerFamily: dispatch.providerFamily,
    status: result.kind === 'ok' ? result.status : result.status,
    providerIdempotencyKey: dispatch.providerIdempotencyKey,
    requestPayloadHash: dispatch.payloadHash,
    redactedRequestPayload: dispatch.redactedPayload,
    ...(result.kind === 'ok' ? { providerResponseHash: result.providerResponseHash } : {}),
    ...(result.kind === 'error' && result.providerResponseHash !== undefined ? { providerResponseHash: result.providerResponseHash } : {}),
    ...(result.kind === 'error' ? { redactedError: normalizeReason(result.redactedError) } : {}),
    ...(result.kind === 'error' && result.retryAfter !== undefined ? { retryAfter: result.retryAfter } : {}),
    startedAt: command.now,
    completedAt: command.now,
  }
  const nextDispatch: NotificationDispatchRecord = {
    ...dispatch,
    status: result.kind === 'ok' ? result.status : dispatchStatusForAttemptFailure(result.status),
    providerMissing: result.kind === 'error' ? result.status === 'provider_missing' : dispatch.providerMissing,
    orchestratorMissing: result.kind === 'error' ? result.status === 'orchestrator_missing' : dispatch.orchestratorMissing,
    ...(result.kind === 'ok' && result.resendMessageId !== undefined ? { resendMessageId: result.resendMessageId } : {}),
    ...(result.kind === 'ok' && result.novuTransactionId !== undefined ? { novuTransactionId: result.novuTransactionId } : {}),
    ...(result.kind === 'ok' && result.novuWorkflowId !== undefined ? { novuWorkflowId: result.novuWorkflowId } : {}),
    ...(result.kind === 'ok' && result.novuMessageId !== undefined ? { novuMessageId: result.novuMessageId } : {}),
    ...(result.kind === 'ok' && result.novuSubscriberId !== undefined ? { novuSubscriberId: result.novuSubscriberId } : {}),
    ...(result.kind === 'error' ? { lastRedactedError: normalizeReason(result.redactedError) } : {}),
    ...(result.kind === 'error' && result.retryAfter !== undefined ? { retryAfter: result.retryAfter } : {}),
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    updatedAt: command.now,
  }
  const nextState = {
    ...state,
    dispatches: replaceDispatch(state.dispatches, nextDispatch),
    attempts: [...state.attempts, attempt],
  }

  return ok(codeForDispatchStatus(nextDispatch.status), { state: nextState, dispatch: nextDispatch, attempt })
}

function recordWebhookEvent(
  state: NotificationOutboxSourceState,
  command: IngestNotificationWebhookCommand,
  status: NotificationWebhookEventStatus,
  reason: string
): IngestNotificationWebhookResult {
  const webhook = webhookEvent(command, status, reason)
  const nextState = { ...state, webhookEvents: [...state.webhookEvents, webhook] }
  const code =
    status === 'rejected'
      ? 'notification_webhook_rejected'
      : status === 'held_for_operator'
        ? 'notification_webhook_held'
        : 'notification_webhook_received'

  return ok(code, { state: nextState, webhookEvent: webhook })
}

function webhookEvent(
  command: IngestNotificationWebhookCommand,
  status: NotificationWebhookEventStatus,
  reason?: string
): NotificationWebhookEventRecord {
  return {
    webhookEventId: notificationWebhookEventId({
      providerFamily: command.providerFamily,
      providerEventId: command.providerEventId,
      payloadHash: command.payloadHash,
      status,
    }),
    providerFamily: command.providerFamily,
    providerEventId: command.providerEventId,
    logicalObjectKey: command.logicalObjectKey,
    ...(command.dispatchId === undefined ? {} : { dispatchId: command.dispatchId }),
    status,
    eventType: command.eventType,
    signatureStatus: command.signatureStatus,
    payloadHash: command.payloadHash,
    redactedPayload: command.redactedPayload,
    ...(reason === undefined ? {} : { reason }),
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    receivedAt: command.receivedAt,
  }
}

function dispatchStatusForAttemptFailure(status: Extract<NotificationAttemptStatus, 'failed' | 'provider_missing' | 'orchestrator_missing'>): NotificationDispatchStatus {
  switch (status) {
    case 'failed':
      return 'failed'
    case 'provider_missing':
      return 'provider_missing'
    case 'orchestrator_missing':
      return 'orchestrator_missing'
  }
}

function dispatchStatusForProviderEvent(eventType: string): NotificationDispatchStatus {
  const normalized = eventType.toLowerCase()
  if (normalized.includes('delivered')) return 'delivered'
  if (normalized.includes('bounce')) return 'bounced'
  if (normalized.includes('complain')) return 'complained'
  if (normalized.includes('delay')) return 'delivery_delayed'
  if (normalized.includes('suppress')) return 'suppressed'
  if (normalized.includes('fail')) return 'failed'
  if (normalized.includes('sent')) return 'sent'
  return 'triggered'
}

function codeForDispatchStatus(status: NotificationDispatchStatus): DispatchNotificationOkCode {
  switch (status) {
    case 'sent':
      return 'notification_sent'
    case 'triggered':
    case 'delivered':
    case 'bounced':
    case 'complained':
    case 'delivery_delayed':
    case 'suppressed':
    case 'retry_scheduled':
    case 'retry_attempted':
    case 'retry_exhausted':
    case 'no_repair':
    case 'queued':
      return 'notification_triggered'
    case 'provider_missing':
      return 'notification_provider_missing'
    case 'orchestrator_missing':
      return 'notification_orchestrator_missing'
    case 'failed':
      return 'notification_dispatch_failed'
  }
}

function operatorNextAction(dispatch: NotificationDispatchRecord): NotificationDispatchReadback['operatorNextAction'] {
  if (dispatch.status === 'no_repair' || dispatch.status === 'delivered' || dispatch.status === 'sent') {
    return 'terminal'
  }
  if (dispatch.status === 'failed' || dispatch.status === 'provider_missing' || dispatch.status === 'orchestrator_missing') {
    return 'retry_available'
  }
  if (dispatch.status === 'bounced' || dispatch.status === 'complained' || dispatch.status === 'delivery_delayed') {
    return 'operator_review_required'
  }
  return 'none'
}

function requireOperator(
  authority: NotificationOperatorAuthority | undefined,
  action: 'retry' | 'mark_no_repair'
): { kind: 'allowed' } | { kind: 'denied'; reason: string } {
  if (authority === undefined) {
    return { kind: 'denied', reason: 'missing_operator_authority' }
  }
  if (authority.role !== 'owner_admin' && action === 'mark_no_repair') {
    return { kind: 'denied', reason: 'owner_admin_required' }
  }
  if (authority.role === 'reviewer') {
    return { kind: 'denied', reason: 'operator_write_denied' }
  }
  return { kind: 'allowed' }
}

function isTerminalDispatch(status: NotificationDispatchStatus): boolean {
  return status === 'no_repair' || status === 'delivered'
}

function findDispatch(
  state: NotificationOutboxSourceState,
  dispatchId: NotificationDispatchId
): NotificationDispatchRecord | undefined {
  return state.dispatches.find((dispatch) => dispatch.dispatchId === dispatchId)
}

function replaceDispatch(
  dispatches: readonly NotificationDispatchRecord[],
  nextDispatch: NotificationDispatchRecord
): NotificationDispatchRecord[] {
  return dispatches.map((dispatch) => (dispatch.dispatchId === nextDispatch.dispatchId ? nextDispatch : dispatch))
}

function normalizeReason(value: string): string {
  const normalized = value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  return normalized.length === 0 ? 'redacted_provider_error' : normalized.slice(0, 180)
}

function notificationDispatchId(value: StableHashValue): NotificationDispatchId {
  return brandNonEmpty(`notification_dispatch:${stableHash(value)}`, 'NotificationDispatchId')
}

function notificationDispatchAttemptId(value: StableHashValue): NotificationDispatchAttemptId {
  return brandNonEmpty(`notification_attempt:${stableHash(value)}`, 'NotificationDispatchAttemptId')
}

function notificationWebhookEventId(value: StableHashValue): NotificationWebhookEventId {
  return brandNonEmpty(`notification_webhook:${stableHash(value)}`, 'NotificationWebhookEventId')
}

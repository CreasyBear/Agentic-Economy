import {
  BusinessActionSlug,
  type AuthorizationCheckpoint,
  type BusinessActionCurrency,
  type CapabilityRequest,
  type ExternalEvidenceEvent,
} from './schema'
import type { BusinessActionSourceState } from './business-action'
import type {
  AuthorizationCheckpointId,
  CapabilityRequestId,
  ExternalEvidenceEventId,
  OperationKey,
  SourceHash,
} from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'

export type StripeWebhookSourceAdmissionInput = {
  rawBody: string
  payloadHash: SourceHash
  now: number
}

export type StripeWebhookAdmissionErrorCode =
  | 'business_action_stripe_missing_webhook_secret'
  | 'business_action_stripe_missing_signature'
  | 'business_action_stripe_invalid_signature'
  | 'business_action_stripe_stale_signature'
  | 'business_action_stripe_malformed_body'
  | 'business_action_stripe_missing_refs'
  | 'business_action_stripe_unbound_held_event'

export type StripeWebhookAdmissionEvidence = {
  provider: 'stripe_test_mode'
  status: 'accepted' | 'duplicate' | 'held_for_operator'
  providerRefHash: SourceHash
  payloadHash: SourceHash
  requestId?: CapabilityRequestId | string
  checkpointId?: AuthorizationCheckpointId | string
  amountCents?: number
  currency?: BusinessActionCurrency
  reason?: string
}

export type StripeWebhookAdmissionResult =
  | {
      kind: 'ok'
      code:
        | 'business_action_stripe_webhook_received'
        | 'business_action_stripe_webhook_duplicate'
        | 'business_action_stripe_webhook_held'
      state: BusinessActionSourceState
      evidence: StripeWebhookAdmissionEvidence
    }
  | {
      kind: 'error'
      error: {
        code: StripeWebhookAdmissionErrorCode | string
        reason: string
        status?: number
      }
    }

type StripeParsedEvent = {
  id: string
  type: string
  object: Record<string, unknown>
}

type StripeCheckoutCompletedSession = {
  eventId: string
  checkoutSessionId: string
  paymentIntentId: string
  clientReferenceId: string
  amountTotal: number
  currency: string
  metadata: {
    actionSlug: string
    requestId: string
    checkpointId: string
    mandateHash: string
    requestHash: string
    cardHash: string
    amountCents: string
    currency: string
    idempotencyKey: string
    correlationId: string
  }
}

export function admitSignedStripeWebhookEvent(
  state: BusinessActionSourceState,
  input: StripeWebhookSourceAdmissionInput
): StripeWebhookAdmissionResult {
  const parsed = parseStripeEvent(input.rawBody)
  if (parsed.kind === 'error') {
    return parsed
  }

  const event = parsed.event
  if (event.type === 'checkout.session.expired') {
    return holdStripeWebhook(state, input.payloadHash, input.now, event, 'checkout_session_expired', optionalStripeSession(event))
  }

  if (event.type === 'payment_intent.payment_failed') {
    return holdStripeWebhook(state, input.payloadHash, input.now, event, 'payment_intent_failed', optionalStripeSession(event))
  }

  if (event.type !== 'checkout.session.completed') {
    return holdStripeWebhook(state, input.payloadHash, input.now, event, 'unsupported_event_type', optionalStripeSession(event))
  }

  const normalized = normalizeCheckoutSessionCompleted(event)
  if (normalized.kind === 'error') {
    return normalized
  }

  const duplicate = duplicateStripeEvidence(state, normalized.session, input.payloadHash, input.now)
  if (duplicate !== undefined) {
    return duplicate
  }

  const bound = bindStripeWebhookToSource(state, normalized.session)
  if (bound.kind === 'held') {
    return holdStripeWebhook(state, input.payloadHash, input.now, event, bound.reason, normalized.session)
  }

  const { request, checkpoint } = bound
  const amountCents = request.amountCents
  const currency = request.currency
  if (amountCents === undefined || currency === undefined) {
    return holdStripeWebhook(state, input.payloadHash, input.now, event, 'source_money_unbound', normalized.session)
  }

  const providerRefHash = stripeProviderRefHash(normalized.session)
  const evidence: ExternalEvidenceEvent = {
    id: `external_evidence:${request.id}:${stripeEventOperationKey(normalized.session)}` as ExternalEvidenceEventId,
    requestId: request.id,
    checkpointId: checkpoint.id,
    actionSlug: BusinessActionSlug,
    provider: 'stripe_test_mode',
    status: 'accepted',
    providerRefHash,
    payloadHash: input.payloadHash,
    idempotencyKey: stripeEventOperationKey(normalized.session) as OperationKey,
    correlationId: request.correlationId,
    amountCents,
    currency,
    receivedAt: input.now,
  }

  return {
    kind: 'ok',
    code: 'business_action_stripe_webhook_received',
    state: { ...state, externalEvidenceEvents: [...state.externalEvidenceEvents, evidence] },
    evidence: {
      provider: 'stripe_test_mode',
      status: 'accepted',
      providerRefHash,
      payloadHash: input.payloadHash,
      requestId: request.id,
      checkpointId: checkpoint.id,
      amountCents,
      currency,
    },
  }
}

function parseStripeEvent(rawBody: string): { kind: 'ok'; event: StripeParsedEvent } | Extract<StripeWebhookAdmissionResult, { kind: 'error' }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return webhookError('business_action_stripe_malformed_body', 'stripe_webhook_body_must_be_json', 400)
  }

  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.type !== 'string') {
    return webhookError('business_action_stripe_missing_refs', 'stripe_event_id_and_type_required', 400)
  }

  const data = parsed.data
  if (!isRecord(data) || !isRecord(data.object)) {
    return webhookError('business_action_stripe_missing_refs', 'stripe_event_object_required', 400)
  }

  return { kind: 'ok', event: { id: parsed.id, type: parsed.type, object: data.object } }
}

function normalizeCheckoutSessionCompleted(
  event: StripeParsedEvent
): { kind: 'ok'; session: StripeCheckoutCompletedSession } | Extract<StripeWebhookAdmissionResult, { kind: 'error' }> {
  const metadata = isRecord(event.object.metadata) ? event.object.metadata : undefined
  const checkoutSessionId = stringField(event.object, 'id')
  const paymentIntentId = stringField(event.object, 'payment_intent')
  const clientReferenceId = stringField(event.object, 'client_reference_id')
  const amountTotal = numberField(event.object, 'amount_total')
  const currency = stringField(event.object, 'currency')

  if (
    checkoutSessionId === undefined ||
    paymentIntentId === undefined ||
    clientReferenceId === undefined ||
    amountTotal === undefined ||
    currency === undefined ||
    metadata === undefined
  ) {
    return webhookError('business_action_stripe_missing_refs', 'checkout_session_required_refs_missing', 400)
  }

  const normalizedMetadata = {
    actionSlug: stringField(metadata, 'ae_action_slug'),
    requestId: stringField(metadata, 'ae_business_action_request_id'),
    checkpointId: stringField(metadata, 'ae_authorization_checkpoint_id'),
    mandateHash: stringField(metadata, 'ae_mandate_hash'),
    requestHash: stringField(metadata, 'ae_request_hash'),
    cardHash: stringField(metadata, 'ae_card_hash'),
    amountCents: stringField(metadata, 'ae_amount_cents'),
    currency: stringField(metadata, 'ae_currency'),
    idempotencyKey: stringField(metadata, 'ae_idempotency_key'),
    correlationId: stringField(metadata, 'ae_correlation_id'),
  }

  if (Object.values(normalizedMetadata).some((value) => value === undefined)) {
    return webhookError('business_action_stripe_missing_refs', 'checkout_session_metadata_required_refs_missing', 400)
  }

  return {
    kind: 'ok',
    session: {
      eventId: event.id,
      checkoutSessionId,
      paymentIntentId,
      clientReferenceId,
      amountTotal,
      currency,
      metadata: normalizedMetadata as StripeCheckoutCompletedSession['metadata'],
    },
  }
}

function optionalStripeSession(event: StripeParsedEvent): StripeCheckoutCompletedSession | undefined {
  const normalized = normalizeCheckoutSessionCompleted(event)
  return normalized.kind === 'ok' ? normalized.session : undefined
}

function duplicateStripeEvidence(
  state: BusinessActionSourceState,
  session: StripeCheckoutCompletedSession,
  payloadHash: SourceHash,
  receivedAt: number
): StripeWebhookAdmissionResult | undefined {
  const idempotencyKey = stripeEventOperationKey(session)
  const existing = state.externalEvidenceEvents.find(
    (event) => event.provider === 'stripe_test_mode' && event.idempotencyKey === idempotencyKey
  )
  if (existing === undefined) {
    return undefined
  }

  if (existing.payloadHash === payloadHash && existing.providerRefHash === stripeProviderRefHash(session)) {
    return {
      kind: 'ok',
      code: 'business_action_stripe_webhook_duplicate',
      state,
      evidence: {
        provider: 'stripe_test_mode',
        status: 'duplicate',
        providerRefHash: existing.providerRefHash,
        payloadHash: existing.payloadHash,
        requestId: existing.requestId,
        checkpointId: existing.checkpointId,
        ...(existing.amountCents === undefined ? {} : { amountCents: existing.amountCents }),
        ...(existing.currency === undefined ? {} : { currency: existing.currency }),
      },
    }
  }

  const heldEvidence = buildHeldStripeEvidence(state, session, payloadHash, 'stripe_event_payload_conflict', receivedAt)
  return {
    kind: 'ok',
    code: 'business_action_stripe_webhook_held',
    state: { ...state, externalEvidenceEvents: upsertExternalEvidenceEvent(state.externalEvidenceEvents, heldEvidence) },
    evidence: {
      provider: 'stripe_test_mode',
      status: 'held_for_operator',
      reason: 'stripe_event_payload_conflict',
      providerRefHash: heldEvidence.providerRefHash,
      payloadHash,
      requestId: session.metadata.requestId,
      checkpointId: session.metadata.checkpointId,
    },
  }
}

function bindStripeWebhookToSource(
  state: BusinessActionSourceState,
  session: StripeCheckoutCompletedSession
): { kind: 'ok'; request: CapabilityRequest; checkpoint: AuthorizationCheckpoint } | { kind: 'held'; reason: string } {
  if (session.clientReferenceId !== session.metadata.requestId) {
    return { kind: 'held', reason: 'request_mismatch' }
  }

  const request = state.requests.find((candidate) => candidate.id === session.metadata.requestId)
  if (request === undefined) {
    return { kind: 'held', reason: 'unbound_provider_event' }
  }

  const checkpoint = state.checkpoints.find((candidate) => candidate.id === session.metadata.checkpointId)
  if (checkpoint === undefined || checkpoint.requestId !== request.id || checkpoint.decision !== 'accepted') {
    return { kind: 'held', reason: 'checkpoint_mismatch' }
  }

  if (request.amountCents === undefined || session.amountTotal !== request.amountCents || session.metadata.amountCents !== String(request.amountCents)) {
    return { kind: 'held', reason: 'amount_mismatch' }
  }

  if (request.currency === undefined || session.currency !== request.currency || session.metadata.currency !== request.currency) {
    return { kind: 'held', reason: 'currency_mismatch' }
  }

  if (
    session.metadata.actionSlug !== BusinessActionSlug ||
    session.metadata.mandateHash !== request.mandateHash ||
    session.metadata.requestHash !== request.requestHash ||
    session.metadata.cardHash !== request.cardHash ||
    session.metadata.idempotencyKey !== request.idempotencyKey ||
    session.metadata.correlationId !== request.correlationId
  ) {
    return { kind: 'held', reason: 'source_ref_mismatch' }
  }

  return { kind: 'ok', request, checkpoint }
}

function holdStripeWebhook(
  state: BusinessActionSourceState,
  payloadHash: SourceHash,
  receivedAt: number,
  event: StripeParsedEvent,
  reason: string,
  session?: StripeCheckoutCompletedSession
): StripeWebhookAdmissionResult {
  const currency = session?.currency === 'aud' || session?.currency === 'usd' ? session.currency : undefined
  const heldEvidence = session === undefined ? undefined : buildHeldStripeEvidence(state, session, payloadHash, reason, receivedAt)
  if (session === undefined || heldEvidence === undefined) {
    return webhookError('business_action_stripe_unbound_held_event', reason, 503)
  }

  return {
    kind: 'ok',
    code: 'business_action_stripe_webhook_held',
    state: { ...state, externalEvidenceEvents: upsertExternalEvidenceEvent(state.externalEvidenceEvents, heldEvidence) },
    evidence: {
      provider: 'stripe_test_mode',
      status: 'held_for_operator',
      reason,
      providerRefHash: heldEvidence.providerRefHash,
      payloadHash,
      requestId: session.metadata.requestId,
      checkpointId: session.metadata.checkpointId,
      amountCents: session.amountTotal,
      ...(currency === undefined ? {} : { currency }),
    },
  }
}

function buildHeldStripeEvidence(
  state: BusinessActionSourceState,
  session: StripeCheckoutCompletedSession,
  payloadHash: SourceHash,
  reason: string,
  receivedAt: number
): ExternalEvidenceEvent {
  const currency = session.currency === 'aud' || session.currency === 'usd' ? session.currency : undefined
  const idempotencyKey = heldStripeEventOperationKey(session, payloadHash)
  const existing = state.externalEvidenceEvents.find((event) => event.idempotencyKey === idempotencyKey)
  return {
    id: `external_evidence:${session.metadata.requestId}:${idempotencyKey}` as ExternalEvidenceEventId,
    requestId: session.metadata.requestId as CapabilityRequestId,
    checkpointId: session.metadata.checkpointId as AuthorizationCheckpointId,
    actionSlug: BusinessActionSlug,
    provider: 'stripe_test_mode',
    status: 'held_for_operator',
    providerRefHash: stripeProviderRefHash(session),
    payloadHash,
    idempotencyKey: idempotencyKey as OperationKey,
    correlationId: session.metadata.correlationId as never,
    amountCents: session.amountTotal,
    ...(currency === undefined ? {} : { currency }),
    reason,
    receivedAt: existing?.receivedAt ?? receivedAt,
  }
}

function upsertExternalEvidenceEvent(
  events: readonly ExternalEvidenceEvent[],
  event: ExternalEvidenceEvent
): readonly ExternalEvidenceEvent[] {
  const index = events.findIndex((candidate) => candidate.idempotencyKey === event.idempotencyKey)
  if (index === -1) {
    return [...events, event]
  }

  return events.map((candidate, candidateIndex) => (candidateIndex === index ? event : candidate))
}

function stripeProviderRefHash(session: StripeCheckoutCompletedSession): SourceHash {
  return stableHash({
    provider: 'stripe_test_mode',
    eventId: session.eventId,
    checkoutSessionId: session.checkoutSessionId,
    paymentIntentId: session.paymentIntentId,
    requestId: session.metadata.requestId,
    checkpointId: session.metadata.checkpointId,
  })
}

function stripeEventOperationKey(session: StripeCheckoutCompletedSession): string {
  return `business-action:stripe-webhook:${session.eventId}:${session.checkoutSessionId}:${session.paymentIntentId}:${session.metadata.requestId}:${session.metadata.checkpointId}`
}

function heldStripeEventOperationKey(session: StripeCheckoutCompletedSession, payloadHash: SourceHash): string {
  return `${stripeEventOperationKey(session)}:held:${payloadHash}`
}

function webhookError(
  code: StripeWebhookAdmissionErrorCode,
  reason: string,
  status: number
): Extract<StripeWebhookAdmissionResult, { kind: 'error' }> {
  return {
    kind: 'error',
    error: { code, reason, status },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

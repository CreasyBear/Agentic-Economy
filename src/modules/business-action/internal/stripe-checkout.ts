import { createHmac, timingSafeEqual } from 'node:crypto'

import {
  BusinessActionSlug,
  type AuthorizationCheckpoint,
  type BusinessActionCurrency,
  type ExternalEvidenceEvent,
  type BusinessActionSourceState,
  type CapabilityRequest,
} from '@/modules/business-action/public'
import type {
  AuthorizationCheckpointId,
  CapabilityRequestId,
  CorrelationId,
  ExternalEvidenceEventId,
  OperationKey,
  SourceHash,
} from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'

export type StripeCheckoutSessionCreateRequest = {
  endpoint: string
  authorizationHeader: string
  idempotencyKey: string
  body: URLSearchParams
}

export type StripeCheckoutSessionResponse = {
  id: string
  url?: string | null
  payment_intent?: string | null
}

export type StripeCheckoutEvidenceSession = {
  testMode: true
  checkoutSessionId: string
  paymentIntentId?: string
  providerRefHash: SourceHash
  payloadHash: SourceHash
  idempotencyKey: OperationKey | string
  correlationId: CorrelationId
  amountCents: number
  currency: BusinessActionCurrency
}

export type StripeCheckoutEvidenceErrorCode =
  | 'business_action_stripe_client_field_rejected'
  | 'business_action_stripe_live_mode_rejected'
  | 'business_action_stripe_config_invalid'
  | 'business_action_stripe_source_unbound'
  | 'business_action_stripe_checkpoint_not_accepted'
  | 'business_action_stripe_money_unbound'
  | 'business_action_stripe_provider_rejected'

export type StripeCheckoutEvidenceResult =
  | {
      kind: 'ok'
      code: 'business_action_stripe_checkout_session_created'
      session: StripeCheckoutEvidenceSession
    }
  | {
      kind: 'error'
      error: {
        code: StripeCheckoutEvidenceErrorCode
        reason: string
        field?: string
      }
    }

export type StripeWebhookSignatureErrorCode =
  | 'business_action_stripe_missing_webhook_secret'
  | 'business_action_stripe_missing_signature'
  | 'business_action_stripe_invalid_signature'
  | 'business_action_stripe_stale_signature'

export type StripeWebhookAdmissionErrorCode =
  | StripeWebhookSignatureErrorCode
  | 'business_action_stripe_malformed_body'
  | 'business_action_stripe_missing_refs'

export type StripeWebhookSignatureInput = {
  rawBody: string
  headers: Headers
  webhookSecret: string | undefined
  now: number
  toleranceSeconds?: number
}

export type StripeWebhookAdmissionInput = StripeWebhookSignatureInput

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

export type CreateStripeCheckoutSessionEvidenceCommand = {
  requestId: CapabilityRequestId | string
  checkpointId: AuthorizationCheckpointId | string
  clientPayload?: Record<string, unknown>
  now: number
}

export type CreateStripeCheckoutSessionEvidenceOptions = {
  stripeSecretKey: string | undefined
  successUrl: string
  cancelUrl: string
  apiBaseUrl?: string
  createSession?: (request: StripeCheckoutSessionCreateRequest) => Promise<StripeCheckoutSessionResponse>
}

const forbiddenClientFields = new Set([
  'amount',
  'amountCents',
  'currency',
  'customer',
  'customerId',
  'stripeCustomerId',
  'providerObjectId',
  'checkoutSessionId',
  'paymentIntentId',
  'payment_intent',
  'successUrl',
  'success_url',
  'cancelUrl',
  'cancel_url',
  'paidState',
  'entitlement',
  'receiptStatus',
])

export async function createStripeCheckoutSessionEvidence(
  state: BusinessActionSourceState,
  command: CreateStripeCheckoutSessionEvidenceCommand,
  options: CreateStripeCheckoutSessionEvidenceOptions
): Promise<StripeCheckoutEvidenceResult> {
  const forbiddenField = firstForbiddenClientField(command.clientPayload)
  if (forbiddenField !== undefined) {
    return checkoutError('business_action_stripe_client_field_rejected', 'client_supplied_authority_field', forbiddenField)
  }

  if (options.stripeSecretKey === undefined || options.stripeSecretKey.trim().length === 0) {
    return checkoutError('business_action_stripe_config_invalid', 'stripe_secret_key_required')
  }

  if (!options.stripeSecretKey.startsWith('sk_test_')) {
    return checkoutError('business_action_stripe_live_mode_rejected', 'phase6_stripe_evidence_is_test_mode_only')
  }

  if (!isServerOwnedHttpsUrl(options.successUrl)) {
    return checkoutError('business_action_stripe_config_invalid', 'server_owned_success_url_required', 'successUrl')
  }

  if (!isServerOwnedHttpsUrl(options.cancelUrl)) {
    return checkoutError('business_action_stripe_config_invalid', 'server_owned_cancel_url_required', 'cancelUrl')
  }

  const bound = bindAcceptedRequest(state, command)
  if (bound.kind === 'error') {
    return bound
  }

  const { request, checkpoint } = bound
  if (request.amountCents === undefined || request.currency === undefined) {
    return checkoutError('business_action_stripe_money_unbound', 'source_owned_amount_and_currency_required')
  }

  const stripeRequest = buildCheckoutSessionCreateRequest({
    request,
    checkpoint,
    stripeSecretKey: options.stripeSecretKey,
    successUrl: options.successUrl,
    cancelUrl: options.cancelUrl,
    apiBaseUrl: options.apiBaseUrl,
  })
  const response = await (options.createSession ?? createCheckoutSessionWithFetch)(stripeRequest)
  if (!response.id.startsWith('cs_test_')) {
    return checkoutError('business_action_stripe_provider_rejected', 'test_mode_checkout_session_required')
  }

  return {
    kind: 'ok',
    code: 'business_action_stripe_checkout_session_created',
    session: {
      testMode: true,
      checkoutSessionId: response.id,
      ...(typeof response.payment_intent === 'string' && response.payment_intent.length > 0
        ? { paymentIntentId: response.payment_intent }
        : {}),
      providerRefHash: stableHash({
        provider: 'stripe_test_mode',
        checkoutSessionId: response.id,
        paymentIntentId: response.payment_intent ?? null,
        requestId: request.id,
        checkpointId: checkpoint.id,
      }),
      payloadHash: stableHash({
        provider: 'stripe_test_mode',
        checkoutSessionId: response.id,
        paymentIntentId: response.payment_intent ?? null,
        requestId: request.id,
        checkpointId: checkpoint.id,
        amountCents: request.amountCents,
        currency: request.currency,
        createdAt: command.now,
      }),
      idempotencyKey: stripeRequest.idempotencyKey,
      correlationId: request.correlationId,
      amountCents: request.amountCents,
      currency: request.currency,
    },
  }
}

export function verifyStripeWebhookSignature(
  input: StripeWebhookSignatureInput
): { kind: 'ok'; payloadHash: SourceHash; timestamp: number } | Extract<StripeWebhookAdmissionResult, { kind: 'error' }> {
  if (input.webhookSecret === undefined || input.webhookSecret.trim().length === 0) {
    return webhookError('business_action_stripe_missing_webhook_secret', 'stripe_webhook_secret_required', 500)
  }

  const signatureHeader = input.headers.get('stripe-signature')
  if (signatureHeader === null || signatureHeader.trim().length === 0) {
    return webhookError('business_action_stripe_missing_signature', 'stripe_signature_header_required', 400)
  }

  const parsed = parseStripeSignatureHeader(signatureHeader)
  if (parsed === undefined) {
    return webhookError('business_action_stripe_invalid_signature', 'stripe_signature_header_malformed', 401)
  }

  const toleranceSeconds = input.toleranceSeconds ?? 300
  const nowSeconds = Math.floor(input.now / 1_000)
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return webhookError('business_action_stripe_stale_signature', 'stripe_signature_timestamp_expired', 401)
  }

  const expected = createHmac('sha256', input.webhookSecret).update(`${parsed.timestamp}.${input.rawBody}`).digest('hex')
  const verified = parsed.signatures.some((signature) => constantTimeEqual(signature, expected))
  if (!verified) {
    return webhookError('business_action_stripe_invalid_signature', 'stripe_signature_verification_failed', 401)
  }

  return {
    kind: 'ok',
    payloadHash: stableHash(input.rawBody),
    timestamp: parsed.timestamp,
  }
}

export function admitStripeWebhookEvent(
  state: BusinessActionSourceState,
  input: StripeWebhookAdmissionInput
): StripeWebhookAdmissionResult {
  const signature = verifyStripeWebhookSignature(input)
  if (signature.kind === 'error') {
    return signature
  }

  const parsed = parseStripeEvent(input.rawBody)
  if (parsed.kind === 'error') {
    return parsed
  }

  const event = parsed.event
  if (event.type === 'checkout.session.expired') {
    return holdStripeWebhook(state, signature.payloadHash, event, 'checkout_session_expired')
  }

  if (event.type === 'payment_intent.payment_failed') {
    return holdStripeWebhook(state, signature.payloadHash, event, 'payment_intent_failed')
  }

  if (event.type !== 'checkout.session.completed') {
    return holdStripeWebhook(state, signature.payloadHash, event, 'unsupported_event_type')
  }

  const normalized = normalizeCheckoutSessionCompleted(event)
  if (normalized.kind === 'error') {
    return normalized
  }

  const duplicate = duplicateStripeEvidence(state, normalized.session, signature.payloadHash)
  if (duplicate !== undefined) {
    return duplicate
  }

  const bound = bindStripeWebhookToSource(state, normalized.session)
  if (bound.kind === 'held') {
    return holdStripeWebhook(state, signature.payloadHash, event, bound.reason, normalized.session)
  }

  const { request, checkpoint } = bound
  const amountCents = request.amountCents
  const currency = request.currency
  if (amountCents === undefined || currency === undefined) {
    return holdStripeWebhook(state, signature.payloadHash, event, 'source_money_unbound', normalized.session)
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
    payloadHash: signature.payloadHash,
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
      payloadHash: signature.payloadHash,
      requestId: request.id,
      checkpointId: checkpoint.id,
      amountCents,
      currency,
    },
  }
}

function buildCheckoutSessionCreateRequest(input: {
  request: CapabilityRequest
  checkpoint: AuthorizationCheckpoint
  stripeSecretKey: string
  successUrl: string
  cancelUrl: string
  apiBaseUrl: string | undefined
}): StripeCheckoutSessionCreateRequest {
  const body = new URLSearchParams()
  body.set('mode', 'payment')
  body.set('success_url', input.successUrl)
  body.set('cancel_url', input.cancelUrl)
  body.set('client_reference_id', input.request.id)
  body.set('line_items[0][quantity]', '1')
  body.set('line_items[0][price_data][currency]', input.request.currency ?? '')
  body.set('line_items[0][price_data][unit_amount]', String(input.request.amountCents ?? ''))
  body.set('line_items[0][price_data][product_data][name]', 'Agentic Economy paid intake endpoint proof')

  const metadata: Record<string, string> = {
    ae_action_slug: BusinessActionSlug,
    ae_business_action_request_id: input.request.id,
    ae_authorization_checkpoint_id: input.checkpoint.id,
    ae_mandate_hash: input.request.mandateHash,
    ae_request_hash: input.request.requestHash,
    ae_card_hash: input.request.cardHash,
    ae_amount_cents: String(input.request.amountCents),
    ae_currency: input.request.currency ?? '',
    ae_idempotency_key: input.request.idempotencyKey,
    ae_correlation_id: input.request.correlationId,
  }

  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value)
  }

  return {
    endpoint: `${input.apiBaseUrl ?? 'https://api.stripe.com'}/v1/checkout/sessions`,
    authorizationHeader: `Bearer ${input.stripeSecretKey}`,
    idempotencyKey: `business-action:stripe-checkout:${input.request.id}:${input.checkpoint.id}`,
    body,
  }
}

async function createCheckoutSessionWithFetch(request: StripeCheckoutSessionCreateRequest): Promise<StripeCheckoutSessionResponse> {
  const response = await fetch(request.endpoint, {
    method: 'POST',
    headers: {
      Authorization: request.authorizationHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': request.idempotencyKey,
    },
    body: request.body,
  })
  const body = await response.json()

  if (!response.ok || typeof body !== 'object' || body === null || typeof (body as { id?: unknown }).id !== 'string') {
    throw new Error('Stripe Checkout Session creation failed before source evidence was admitted.')
  }

  return body as StripeCheckoutSessionResponse
}

function bindAcceptedRequest(
  state: BusinessActionSourceState,
  command: CreateStripeCheckoutSessionEvidenceCommand
): { kind: 'ok'; request: CapabilityRequest; checkpoint: AuthorizationCheckpoint } | Extract<StripeCheckoutEvidenceResult, { kind: 'error' }> {
  const request = state.requests.find((candidate) => candidate.id === command.requestId)
  if (request === undefined || request.actionSlug !== BusinessActionSlug) {
    return checkoutError('business_action_stripe_source_unbound', 'business_action_request_not_found', 'requestId')
  }

  const checkpoint = state.checkpoints.find((candidate) => candidate.id === command.checkpointId)
  if (checkpoint === undefined || checkpoint.requestId !== request.id) {
    return checkoutError('business_action_stripe_source_unbound', 'authorization_checkpoint_not_bound_to_request', 'checkpointId')
  }

  if (checkpoint.decision !== 'accepted') {
    return checkoutError('business_action_stripe_checkpoint_not_accepted', checkpoint.decision, 'checkpointId')
  }

  return { kind: 'ok', request, checkpoint }
}

function firstForbiddenClientField(clientPayload: Record<string, unknown> | undefined): string | undefined {
  if (clientPayload === undefined) {
    return undefined
  }

  return Object.keys(clientPayload).find((field) => forbiddenClientFields.has(field))
}

function isServerOwnedHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function checkoutError(
  code: StripeCheckoutEvidenceErrorCode,
  reason: string,
  field?: string
): Extract<StripeCheckoutEvidenceResult, { kind: 'error' }> {
  return {
    kind: 'error',
    error: {
      code,
      reason,
      ...(field === undefined ? {} : { field }),
    },
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

function parseStripeSignatureHeader(value: string): { timestamp: number; signatures: readonly string[] } | undefined {
  const parts = value.split(',').map((part) => part.trim())
  const timestampPart = parts.find((part) => part.startsWith('t='))
  const timestamp = timestampPart === undefined ? Number.NaN : Number(timestampPart.slice(2))
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))

  if (!Number.isSafeInteger(timestamp) || signatures.length === 0) {
    return undefined
  }

  return { timestamp, signatures }
}

function constantTimeEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer)
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

function duplicateStripeEvidence(
  state: BusinessActionSourceState,
  session: StripeCheckoutCompletedSession,
  payloadHash: SourceHash
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

  return {
    kind: 'ok',
    code: 'business_action_stripe_webhook_held',
    state,
    evidence: {
      provider: 'stripe_test_mode',
      status: 'held_for_operator',
      reason: 'stripe_event_payload_conflict',
      providerRefHash: stripeProviderRefHash(session),
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
  event: StripeParsedEvent,
  reason: string,
  session?: StripeCheckoutCompletedSession
): StripeWebhookAdmissionResult {
  const currency = session?.currency === 'aud' || session?.currency === 'usd' ? session.currency : undefined
  return {
    kind: 'ok',
    code: 'business_action_stripe_webhook_held',
    state,
    evidence: {
      provider: 'stripe_test_mode',
      status: 'held_for_operator',
      reason,
      providerRefHash: session === undefined ? stableHash({ provider: 'stripe_test_mode', eventId: event.id }) : stripeProviderRefHash(session),
      payloadHash,
      ...(session === undefined
        ? {}
        : {
            requestId: session.metadata.requestId,
            checkpointId: session.metadata.checkpointId,
            amountCents: session.amountTotal,
          }),
      ...(currency === undefined ? {} : { currency }),
    },
  }
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

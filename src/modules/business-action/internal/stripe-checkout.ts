import { createHmac, timingSafeEqual } from 'node:crypto'

import {
  BusinessActionSlug,
  type AuthorizationCheckpoint,
  type BusinessActionCurrency,
  type BusinessActionSourceState,
  type CapabilityRequest,
} from '@/modules/business-action/public'
import type {
  AuthorizationCheckpointId,
  CapabilityRequestId,
  CorrelationId,
  OperationKey,
  SourceHash,
} from '@/modules/common/ids'
import { stableHash } from '@/modules/common/stable-hash'
import {
  admitSignedStripeWebhookEvent,
  type StripeWebhookAdmissionErrorCode,
  type StripeWebhookAdmissionEvidence,
  type StripeWebhookAdmissionResult,
} from './stripe-webhook-source'

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

export type StripeWebhookSignatureInput = {
  rawBody: string
  headers: Headers
  webhookSecret: string | undefined
  now: number
  toleranceSeconds?: number
}

export type StripeWebhookAdmissionInput = StripeWebhookSignatureInput
export type { StripeWebhookAdmissionEvidence, StripeWebhookAdmissionResult }

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

  return admitSignedStripeWebhookEvent(state, {
    rawBody: input.rawBody,
    payloadHash: signature.payloadHash,
    now: input.now,
  })
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

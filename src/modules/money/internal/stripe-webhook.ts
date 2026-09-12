import { response as jsonResponse } from '@/lib/server/no-store-response'
import { kindForStatus } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import { isMoneyRefusal, type ExactAmount, type MoneyRefusal } from '../public'

const MAX_STRIPE_WEBHOOK_BODY_BYTES = 256 * 1024
const RETRY_AFTER_SECONDS = 5

export type StripeCheckoutWebhookEvent = Readonly<{
  kind: 'checkout'
  stripeEventId: string
  eventType:
    | 'checkout.session.completed'
    | 'checkout.session.async_payment_succeeded'
    | 'checkout.session.async_payment_failed'
  externalRef: string
  sessionId: string
  commandRef: string
  paymentId?: string
  checkoutSessionDigest: string
  paymentIntentDigest?: string
  status: 'paid' | 'processing' | 'failed'
  amount: ExactAmount
  metadataDigest: string
  payloadDigest: string
  observedAt: number
}>

export type StripeRefundWebhookEvent = Readonly<{
  kind: 'refund'
  stripeEventId: string
  eventType: 'refund.created' | 'refund.updated' | 'refund.failed'
  externalRef: string
  refundId: string
  paymentId: string
  chargeId: string
  refundDigest: string
  status: 'pending' | 'succeeded' | 'failed'
  amount: ExactAmount
  payloadDigest: string
  observedAt: number
}>

export type StripeAccountUpdatedWebhookEvent = Readonly<{
  kind: 'account'
  stripeEventId: string
  eventType:
    | 'v2.core.account.created'
    | 'v2.core.account.updated'
    | 'v2.core.account.closed'
    | 'v2.core.account[configuration.recipient].updated'
    | 'v2.core.account[configuration.recipient].capability_status_updated'
  externalRef: string
  stripeAccountId: string
  providerObjectDigest: string
  providerObjectVersion?: number
  payloadDigest: string
  observedAt: number
}>

export type StripeMoneyWebhookEvent =
  | StripeCheckoutWebhookEvent
  | StripeRefundWebhookEvent
  | StripeAccountUpdatedWebhookEvent

export type StripeWebhookVerification = StripeMoneyWebhookEvent | MoneyRefusal

export type StripeWebhookAdmission = Readonly<{
  kind: 'accepted'
  status: 'queued' | 'replayed' | 'reconciliation_required'
}>

export type StripeWebhookApplication = Readonly<{
  kind: 'accepted'
  status: 'applied' | 'replayed'
  appliedRef: string
}>

export type StripeWebhookDestination = 'snapshot' | 'accounts_v2'

export type StripeWebhookVerifier = Readonly<{
  verify: (input: Readonly<{ rawBody: string; signature: string }>) => Promise<StripeWebhookVerification>
}>

export type StripeWebhookIngester = Readonly<{
  ingest: (input: Readonly<{ event: StripeMoneyWebhookEvent; rawBody: string }>) => Promise<StripeWebhookAdmission | MoneyRefusal>
}>

export async function handleStripeWebhookRequest(input: Readonly<{
  request: Request
  verifier: StripeWebhookVerifier
  ingester: StripeWebhookIngester
}>): Promise<Response> {
  const boundedBody = await readBoundedRequestText(input.request, MAX_STRIPE_WEBHOOK_BODY_BYTES)
  if (!boundedBody.ok) return problem({ status: 413, kind: kindForStatus(413), code: 'request_too_large', detail: 'request_too_large' })
  const rawBody = boundedBody.text
  const signature = input.request.headers.get('stripe-signature')
  if (signature === null || signature.length === 0) {
    return problem({ status: 400, kind: kindForStatus(400), code: 'payment_binding_invalid', detail: 'payment_binding_invalid' })
  }

  let verified: StripeWebhookVerification
  try {
    verified = await input.verifier.verify({ rawBody, signature })
  } catch (cause) {
    return degradeBackend(cause, problem({ status: 503, kind: kindForStatus(503), code: 'stripe_setup_required', detail: 'stripe_setup_required' }), { site: 'handleStripeWebhookRequest', reason: 'source_unavailable' })
  }
  if (isMoneyRefusal(verified)) return refusalResponse(verified, 'verify')

  let admitted: StripeWebhookAdmission | MoneyRefusal
  try {
    admitted = await input.ingester.ingest({ event: verified, rawBody })
  } catch (cause) {
    return degradeBackend(cause, problem(
      { status: 503, kind: kindForStatus(503), code: 'credit_topup_pending', detail: 'credit_topup_pending' },
      { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    ), { site: 'handleStripeWebhookRequest', reason: 'source_unavailable' })
  }
  if (isMoneyRefusal(admitted)) return refusalResponse(admitted, 'ingest')
  return jsonResponse({
    kind: 'accepted',
    status: admitted.status,
  }, 200)
}

function refusalResponse(refusal: MoneyRefusal, phase: 'verify' | 'ingest'): Response {
  const retryable = refusal.retryable || refusal.code === 'credit_topup_pending'
  const status = phase === 'verify'
    ? refusal.code === 'stripe_setup_required' ? 503 : 400
    : 503
  return problem(
    { status, kind: kindForStatus(status), code: refusal.code, detail: refusal.code },
    retryable ? { 'Retry-After': String(RETRY_AFTER_SECONDS) } : {},
  )
}

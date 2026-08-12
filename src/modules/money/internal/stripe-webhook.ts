import { response as jsonResponse } from '@/lib/server/no-store-response'
import { kindForStatus } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

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
    | 'checkout.session.expired'
  externalRef: string
  sessionId: string
  commandRef: string
  paymentId?: string
  checkoutSessionDigest: string
  paymentIntentDigest?: string
  status: 'paid' | 'failed' | 'expired'
  amount: ExactAmount
  metadataDigest: string
  payloadDigest: string
  observedAt: number
}>

export type StripeAccountUpdatedWebhookEvent = Readonly<{
  kind: 'account'
  stripeEventId: string
  eventType:
    | 'account.updated'
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

export type StripeMoneyWebhookEvent = StripeCheckoutWebhookEvent | StripeAccountUpdatedWebhookEvent

export type StripeWebhookVerification = StripeMoneyWebhookEvent | MoneyRefusal

export type StripeWebhookApplication = Readonly<{
  kind: 'accepted'
  status: 'applied' | 'replayed' | 'ignored'
  appliedRef?: string
}>

export type StripeWebhookVerifier = Readonly<{
  verify: (input: Readonly<{ rawBody: string; signature: string }>) => Promise<StripeWebhookVerification>
}>

export type StripeWebhookApplier = Readonly<{
  apply: (input: Readonly<{ event: StripeMoneyWebhookEvent; rawBody: string }>) => Promise<StripeWebhookApplication | MoneyRefusal>
}>

export async function handleStripeWebhookRequest(input: Readonly<{
  request: Request
  verifier: StripeWebhookVerifier
  applier: StripeWebhookApplier
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
  } catch {
    return problem({ status: 503, kind: kindForStatus(503), code: 'stripe_setup_required', detail: 'stripe_setup_required' })
  }
  if (isMoneyRefusal(verified)) return refusalResponse(verified, 'verify')

  let applied: StripeWebhookApplication | MoneyRefusal
  try {
    applied = await input.applier.apply({ event: verified, rawBody })
  } catch {
    return problem(
      { status: 503, kind: kindForStatus(503), code: 'credit_topup_pending', detail: 'credit_topup_pending' },
      { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    )
  }
  if (isMoneyRefusal(applied)) return refusalResponse(applied, 'apply')
  return jsonResponse({
    kind: 'accepted',
    status: applied.status,
    ...(applied.appliedRef === undefined ? {} : { appliedRef: applied.appliedRef }),
  }, 200)
}

function refusalResponse(refusal: MoneyRefusal, phase: 'verify' | 'apply'): Response {
  const retryable = refusal.retryable || refusal.code === 'credit_topup_pending'
  const status = phase === 'verify'
    ? refusal.code === 'stripe_setup_required' ? 503 : 400
    : refusal.code === 'stripe_setup_required' || retryable ? 503 : 409
  return problem(
    { status, kind: kindForStatus(status), code: refusal.code, detail: refusal.code },
    retryable ? { 'Retry-After': String(RETRY_AFTER_SECONDS) } : {},
  )
}

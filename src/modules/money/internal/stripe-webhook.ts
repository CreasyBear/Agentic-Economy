import { response as jsonResponse } from '@/lib/server/no-store-response'
import { kindForStatus } from '@/lib/errors'
import { problem } from '@/lib/server/problem'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import { isMoneyRefusal, type ExactAmount, type MoneyRefusal } from '../public'

const MAX_STRIPE_WEBHOOK_BODY_BYTES = 256 * 1024

export type CreditTopupWebhookEvent = Readonly<{
  stripeEventId: string
  eventType: 'payment_intent.succeeded'
  externalRef: string
  principalId: string
  accountRef: string
  amount: ExactAmount
  payloadDigest: string
  observedAt: number
}>

export type StripeWebhookVerifier = Readonly<{
  verify: (input: Readonly<{ rawBody: string; signature: string }>) => Promise<CreditTopupWebhookEvent | MoneyRefusal>
}>

export type StripeWebhookApplier = Readonly<{
  apply: (event: CreditTopupWebhookEvent) => Promise<Readonly<{ kind: 'accepted'; appliedRef: string } | MoneyRefusal>>
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
  if (signature === null || signature.length === 0) return problem({ status: 503, kind: kindForStatus(503), code: 'stripe_setup_required', detail: 'stripe_setup_required' })
  const verified = await input.verifier.verify({ rawBody, signature })
  if (isMoneyRefusal(verified)) {
    const status = verified.code === 'stripe_setup_required' ? 503 : 400
    return problem({ status, kind: kindForStatus(status), code: verified.code, detail: verified.code })
  }
  const applied = await input.applier.apply(verified)
  if (isMoneyRefusal(applied)) {
    const status = applied.code === 'stripe_setup_required' ? 503 : 409
    return problem({ status, kind: kindForStatus(status), code: applied.code, detail: applied.code })
  }
  return jsonResponse({ kind: 'accepted', appliedRef: applied.appliedRef }, 200)
}


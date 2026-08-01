import type { MoneyRefusal } from '../public'

export type CreditTopupWebhookEvent = Readonly<{
  stripeEventId: string
  eventType: 'payment_intent.succeeded'
  externalRef: string
  principalId: string
  accountRef: string
  currency: string
  amountMinor: number
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
  const rawBody = await input.request.text()
  const signature = input.request.headers.get('stripe-signature')
  if (signature === null || signature.length === 0) return jsonResponse({ kind: 'refused', code: 'stripe_setup_required' }, 503)
  const verified = await input.verifier.verify({ rawBody, signature })
  if (isMoneyRefusal(verified)) return jsonResponse(verified, verified.code === 'stripe_setup_required' ? 503 : 400)
  const applied = await input.applier.apply(verified)
  if (isMoneyRefusal(applied)) return jsonResponse(applied, applied.code === 'stripe_setup_required' ? 503 : 409)
  return jsonResponse({ kind: 'accepted', appliedRef: applied.appliedRef }, 200)
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
function isMoneyRefusal(value: CreditTopupWebhookEvent | MoneyRefusal | Readonly<{ kind: 'accepted'; appliedRef: string }>): value is MoneyRefusal {
  return 'kind' in value && value.kind === 'refused'
}

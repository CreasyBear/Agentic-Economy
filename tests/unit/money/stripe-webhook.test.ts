import { describe, expect, it } from 'vitest'

import { handleStripeWebhookRequest } from '../../../src/modules/money/internal/stripe-webhook'
import type { StripeMoneyWebhookEvent } from '../../../src/modules/money/server'

describe('money Stripe webhook handler', () => {
  it('rejects a missing signature before provider application', async () => {
    const response = await handleStripeWebhookRequest({
      request: new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}' }),
      verifier: { verify: async () => event() },
      applier: { apply: async () => ({ kind: 'accepted', status: 'applied' }) },
    })
    expect(response.status).toBe(400)
  })

  it('verifies and applies the exact raw body before returning the applied event identity', async () => {
    const applied: Array<{ stripeEventId: string; rawBody: string }> = []
    const webhookEvent = event()
    const verifier = {
      verify: async (input: { rawBody: string; signature: string }) => {
        expect(input.rawBody).toBe('{"ok":true}')
        expect(input.signature).toBe('sig')
        return webhookEvent
      },
    }
    const applier = {
      apply: async (input: { event: StripeMoneyWebhookEvent; rawBody: string }) => {
        applied.push({ stripeEventId: input.event.stripeEventId, rawBody: input.rawBody })
        const appliedRef = input.event.kind === 'checkout' ? input.event.sessionId : input.event.externalRef
        return { kind: 'accepted' as const, status: 'applied' as const, appliedRef }
      },
    }
    const response = await handleStripeWebhookRequest({
      request: new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{"ok":true}', headers: { 'stripe-signature': 'sig' } }),
      verifier,
      applier,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'accepted', status: 'applied', appliedRef: 'cs_1' })
    expect(applied).toEqual([{ stripeEventId: 'evt_1', rawBody: '{"ok":true}' }])
  })

  it('returns retryable pending with Retry-After', async () => {
    const response = await handleStripeWebhookRequest({
      request: new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' } }),
      verifier: { verify: async () => event() },
      applier: { apply: async () => ({ kind: 'refused' as const, code: 'credit_topup_pending' as const, retryable: true }) },
    })
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
  })

  it('rejects oversized webhook bodies before signature verification', async () => {
    let verified = false
    const response = await handleStripeWebhookRequest({
      request: new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_oversized', padding: 'x'.repeat(300 * 1024) }),
        headers: { 'stripe-signature': 'sig' },
      }),
      verifier: {
        verify: async () => {
          verified = true
          return event()
        },
      },
      applier: { apply: async () => ({ kind: 'accepted', status: 'applied' }) },
    })
    expect(response.status).toBe(413)
    expect(verified).toBe(false)
  })
})

function event(): StripeMoneyWebhookEvent {
  return {
    kind: 'checkout',
    stripeEventId: 'evt_1',
    eventType: 'checkout.session.async_payment_succeeded',
    externalRef: 'cs_1',
    sessionId: 'cs_1',
    commandRef: 'sha256:command',
    paymentId: 'pi_1',
    status: 'paid',
    amount: { currency: 'USD', units: '1050', exponent: 2 },
    metadataDigest: 'sha256:metadata',
    checkoutSessionDigest: 'sha256:checkout-session',
    paymentIntentDigest: 'sha256:payment-intent',
    payloadDigest: 'sha256:payload',
    observedAt: 2,
  }
}


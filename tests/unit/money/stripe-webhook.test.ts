import { describe, expect, it } from 'vitest'

import { handleStripeWebhookRequest } from '../../../src/routes/api.stripe.webhook'

describe('money Stripe webhook adapter', () => {
  it('fails closed before Stripe setup and never applies a browser return', async () => {
    const response = await handleStripeWebhookRequest(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}' }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
  })

  it('verifies raw body before applying and supports duplicate event replay in the applier', async () => {
    const applied: string[] = []
    const event = { stripeEventId: 'evt_1', eventType: 'payment_intent.succeeded' as const, externalRef: 'pi_1', principalId: 'clerk_api_key:key-1', accountRef: 'clerk_api_key:key-1:USD', currency: 'USD', amountMinor: 1_000, payloadDigest: 'payload-1', observedAt: 2 }
    const verifier = { verify: async (input: { rawBody: string; signature: string }) => { expect(input.rawBody).toBe('{"ok":true}'); expect(input.signature).toBe('sig'); return event } }
    const applier = { apply: async (value: typeof event) => { applied.push(value.stripeEventId); return { kind: 'accepted' as const, appliedRef: value.stripeEventId } } }
    const response = await handleStripeWebhookRequest(new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{"ok":true}', headers: { 'stripe-signature': 'sig' } }), { verifier, applier })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ kind: 'accepted', appliedRef: 'evt_1' })
    expect(applied).toEqual(['evt_1'])
  })

  it('rejects oversized webhook bodies before signature verification', async () => {
    let verified = false
    const verifier = {
      verify: async () => {
        verified = true
        throw new Error('should not verify an oversized webhook')
      },
    }
    const response = await handleStripeWebhookRequest(
      new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt_oversized', padding: 'x'.repeat(300 * 1024) }),
        headers: { 'stripe-signature': 'sig' },
      }),
      { verifier },
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ kind: 'refused', code: 'request_too_large' })
    expect(verified).toBe(false)
  })
})

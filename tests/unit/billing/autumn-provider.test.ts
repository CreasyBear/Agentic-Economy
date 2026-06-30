import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAutumnHttpProvider } from '@/modules/billing/internal/provider-readback'

const originalFetch = globalThis.fetch

describe('Autumn HTTP provider', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('creates the customer before starting billing attach', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = []
    globalThis.fetch = vi.fn(async (url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body })

      if (String(url).endsWith('/v1/customers')) {
        return jsonResponse({ id: body.id, name: body.name })
      }

      return jsonResponse({
        customer_id: body.customer_id,
        payment_url: 'https://checkout.stripe.test/session',
      })
    }) as typeof fetch

    const provider = createAutumnHttpProvider({
      secretKey: 'am_sk_test_local',
      apiBaseUrl: 'https://api.useautumn.test',
      apiVersion: '2.3.0',
    })

    const readback = await provider.attach({
      customerId: 'ae_business_owner',
      planId: 'paid_activation_monthly',
      successUrl: 'http://127.0.0.1:3200/owner/billing/return/op_123',
      metadata: { ae_operation_id: 'op_123' },
    })

    expect(readback.paymentUrl).toBe('https://checkout.stripe.test/session')
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.useautumn.test/v1/customers',
      'https://api.useautumn.test/v1/billing.attach',
    ])
    expect(calls[0]?.body).toMatchObject({
      id: 'ae_business_owner',
      name: 'ae_business_owner',
      metadata: { ae_operation_id: 'op_123' },
    })
    expect(calls[1]?.body).toMatchObject({
      customer_id: 'ae_business_owner',
      plan_id: 'paid_activation_monthly',
      redirect_mode: 'always',
    })
  })
})

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleFundingConstraintsRequest } from '@/routes/api.v1.funding.constraints'
import { handleFundingQuoteRequest } from '@/routes/api.v1.funding.quote'

describe('public funding preflight', () => {
  beforeEach(() => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
  })

  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
  })

  it('returns cacheable constraints and a caller correlation ref', async () => {
    const response = await handleFundingConstraintsRequest(new Request(
      'https://ae.example/api/v1/funding/constraints',
      { headers: { 'X-AE-Request-Id': 'funding-constraints-1' } },
    ))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('max-age=60')
    expect(response.headers.get('x-ae-request-id')).toBe('funding-constraints-1')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'funding_constraints',
      minimum: { currency: 'AUD', units: '5000000', exponent: 6 },
      maximum: { currency: 'AUD', units: '25000000000', exponent: 6 },
      quotePath: '/api/v1/funding/quote',
    })
  })

  it('quotes exact Account principal, fee, tax, and total before payment creation', async () => {
    const response = await handleFundingQuoteRequest(new Request(
      'https://ae.example/api/v1/funding/quote',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AE-Request-Id': 'funding-quote-1',
        },
        body: JSON.stringify({ amount: { currency: 'AUD', units: '10000000', exponent: 6 } }),
      },
    ), { now: 10_000 })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBe('funding-quote-1')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'funding_quote',
      binding: false,
      generatedAt: 10_000,
      principalAmount: { currency: 'AUD', units: '10000000', exponent: 6 },
      serviceFee: { currency: 'AUD', units: '500000', exponent: 6 },
      taxOnServiceFee: { currency: 'AUD', units: '50000', exponent: 6 },
      totalPayment: { currency: 'AUD', units: '10550000', exponent: 6 },
    })
  })

  it('fails before payment work for bad media, malformed JSON, and invalid amount', async () => {
    const wrongMedia = await handleFundingQuoteRequest(new Request(
      'https://ae.example/api/v1/funding/quote',
      { method: 'POST', body: '{}' },
    ))
    expect(wrongMedia.status).toBe(415)

    const malformed = await handleFundingQuoteRequest(new Request(
      'https://ae.example/api/v1/funding/quote',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' },
    ))
    expect(malformed.status).toBe(400)

    const invalid = await handleFundingQuoteRequest(new Request(
      'https://ae.example/api/v1/funding/quote',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: { currency: 'AUD', units: '4990000', exponent: 6 } }),
      },
    ))
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ code: 'funding_amount_out_of_range' })
  })
})

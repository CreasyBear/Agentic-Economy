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
      minimum: { currency: 'USD', units: '500', exponent: 2 },
      maximum: { currency: 'USD', units: '2500000', exponent: 2 },
      quotePath: '/api/v1/funding/quote',
    })
  })

  it('quotes exact credit, fee, and total before payment creation', async () => {
    const response = await handleFundingQuoteRequest(new Request(
      'https://ae.example/api/v1/funding/quote',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AE-Request-Id': 'funding-quote-1',
        },
        body: JSON.stringify({ amount: { currency: 'USD', units: '1000', exponent: 2 } }),
      },
    ), { now: 10_000 })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBe('funding-quote-1')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'funding_quote',
      binding: false,
      generatedAt: 10_000,
      creditAmount: { currency: 'USD', units: '1000', exponent: 2 },
      processingFee: { currency: 'USD', units: '50', exponent: 2 },
      totalCharge: { currency: 'USD', units: '1050', exponent: 2 },
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
        body: JSON.stringify({ amount: { currency: 'USD', units: '499', exponent: 2 } }),
      },
    ))
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ code: 'funding_amount_out_of_range' })
  })
})

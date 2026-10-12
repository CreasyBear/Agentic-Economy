import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { createFundingHandoffService } from '@/lib/server/funding-handoff-api'
import { handleFundingConstraintsRequest } from '@/routes/api.v1.funding.constraints'
import { handleFundingQuoteRequest } from '@/routes/api.v1.funding.quote'

const LIVE_SERVICE_FEE_BPS = 250

function sandboxFundingProjection(serviceFeeBps = 500) {
  return {
    kind: 'available' as const,
    environment: 'sandbox' as const,
    currency: 'AUD' as const,
    exponent: 6 as const,
    minimumPrincipalUnits: '5000000',
    maximumPrincipalUnits: '25000000000',
    incrementUnits: '10000',
    serviceFeeBps,
    taxOnServiceFeeBps: 1000,
  }
}

function installPlatformFundingQuery(serviceFeeBps = 500) {
  const query = vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) => {
    expect(getFunctionName(reference)).toBe('moneyCommercialPolicy:readPlatformFundingConstraints')
    return sandboxFundingProjection(serviceFeeBps)
  })
  return setPublicSourceTransportForTests({
    query,
    mutation: vi.fn(),
    action: vi.fn(),
  } as never)
}

describe('public funding preflight', () => {
  let restorePublicSource: (() => void) | undefined

  beforeEach(() => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_funding_contract')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_funding_contract')
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    restorePublicSource = installPlatformFundingQuery()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    setHttpRateLimitAdmissionForTests(undefined)
    restorePublicSource?.()
    restorePublicSource = undefined
  })

  it.each(['payments_paused', 'payments_admins_only', 'payments_not_open'])(
    'returns payments_not_open (409, no-store) for %s without Stripe setup', async (code) => {
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
      vi.stubEnv('STRIPE_SECRET_KEY', '')
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
      restorePublicSource?.()
      restorePublicSource = setPublicSourceTransportForTests({
        query: vi.fn(async (_reference, args) => {
          expect(args.environment).toBe('production')
          return { kind: 'refused', code, retryable: false }
        }),
        mutation: vi.fn(), action: vi.fn(),
      } as never)
      const response = await handleFundingConstraintsRequest(new Request('https://ae.example/api/v1/funding/constraints'))
      expect(response.status).toBe(409)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toMatchObject({ code: 'payments_not_open', retryable: false })
    },
  )

  it('keeps open funding unavailable without Stripe setup', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    const response = await handleFundingConstraintsRequest(new Request('https://ae.example/api/v1/funding/constraints'))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'funding_constraints_unavailable', reason: 'stripe_setup_required',
    })
  })

  it('rejects an unknown deployment environment before reading policy', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', '')
    restorePublicSource?.()
    const query = vi.fn(async () => ({ kind: 'refused', code: 'payments_not_open', retryable: false }))
    restorePublicSource = setPublicSourceTransportForTests({
      query, mutation: vi.fn(), action: vi.fn(),
    } as never)
    const response = await handleFundingConstraintsRequest(new Request('https://ae.example/api/v1/funding/constraints'))
    expect(response.status).toBe(503)
    expect(query).not.toHaveBeenCalled()
  })

  it('keeps 503 when the source throws', async () => {
    restorePublicSource?.()
    restorePublicSource = setPublicSourceTransportForTests({
      query: vi.fn(async () => { throw new Error('down') }),
      mutation: vi.fn(), action: vi.fn(),
    } as never)
    const response = await handleFundingConstraintsRequest(new Request('https://ae.example/api/v1/funding/constraints'))
    expect(response.status).toBe(503)
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
      taxOnServiceFee: { currency: 'AUD', units: '1050000', exponent: 6 },
      totalPayment: { currency: 'AUD', units: '11550000', exponent: 6 },
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

  it('projects live commercial-policy bps through public constraints, quote, and handoff config', async () => {
    restorePublicSource?.()
    restorePublicSource = installPlatformFundingQuery(LIVE_SERVICE_FEE_BPS)

    const constraints = await handleFundingConstraintsRequest(new Request(
      'https://ae.example/api/v1/funding/constraints',
    ))
    expect(constraints.status).toBe(200)
    await expect(constraints.json()).resolves.toMatchObject({
      kind: 'funding_constraints',
      serviceFeeBps: LIVE_SERVICE_FEE_BPS,
    })

    const quote = await handleFundingQuoteRequest(new Request(
      'https://ae.example/api/v1/funding/quote',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: { currency: 'AUD', units: '10000000', exponent: 6 } }),
      },
    ), { now: 10_000 })
    expect(quote.status).toBe(200)
    await expect(quote.json()).resolves.toMatchObject({
      kind: 'funding_quote',
      serviceFeeBps: LIVE_SERVICE_FEE_BPS,
      serviceFee: { currency: 'AUD', units: '250000', exponent: 6 },
      taxOnServiceFee: { currency: 'AUD', units: '1030000', exponent: 6 },
      totalPayment: { currency: 'AUD', units: '11280000', exponent: 6 },
    })

    const handoff = createFundingHandoffService(
      new Request('https://ae.example/api/v1/account/funding/config'),
      '{}',
    )
    await expect(handoff.config()).resolves.toMatchObject({
      kind: 'funding_config',
      success: true,
      currency: 'AUD',
      minimum: { currency: 'AUD', units: '5000000', exponent: 6 },
      maximum: { currency: 'AUD', units: '25000000000', exponent: 6 },
      increment: { currency: 'AUD', units: '10000', exponent: 6 },
    })
  })
})

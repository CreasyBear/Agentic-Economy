import { describe, expect, it, vi } from 'vitest'

import { createShippoGateway } from '../../examples/routing-provider/lib/shippo-gateway.mjs'
import { createEasyPostGateway } from '../../examples/routing-provider/lib/easypost-gateway.mjs'
import { issueProviderQuoteRef } from '../../examples/routing-provider/lib/provider-quote-ref.mjs'

const signingKey = 'provider-quote-signing-key-with-at-least-32-bytes'
const now = () => 1_750_000_000_000

describe('live shipping provider gateways', () => {
  it('Shippo binds one exact rate, treats a suppressed buy as unknown, and reconciles without retry', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ object_id: 'shippo-shipment-1', rates: [{ object_id: 'shippo-rate-1', carrier_account: 'shippo-carrier-1', servicelevel: { token: 'au-express' }, amount: '12.34', currency: 'AUD', expires_at: '2025-06-15T15:10:00.000Z' }] }))
      .mockRejectedValueOnce(new Error('response suppressed'))
      .mockResolvedValueOnce(Response.json({ results: [{ object_id: 'shippo-transaction-1', status: 'SUCCESS', rate: { object_id: 'shippo-rate-1', amount: '12.34', currency: 'AUD' }, tracking_number: 'TRACK-SHIPPO', label_url: 'https://labels.example/shippo.pdf' }] }))
    const gateway = createShippoGateway({ fetchImpl, token: 'shippo-token', signingKey, carrierAccountId: 'shippo-carrier-1', serviceLevelToken: 'au-express', shipmentTemplate: { address_from: {}, address_to: {}, parcels: [{}] }, now })
    const quote = await gateway.quote()
    expect(quote).toMatchObject({ kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 1_234 }, providerQuoteRef: expect.stringMatching(/^ae-provider-quote:v1:/) })
    if (quote.kind !== 'quoted') throw new Error(quote.reason)
    await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shippo-rate:shippo-rate-1' })
    await expect(gateway.reconcile({ providerQuoteRef: quote.providerQuoteRef })).resolves.toMatchObject({ kind: 'effect_committed', providerReference: 'shippo-transaction-1', outcome: { provider: 'shippo', shipment_id: 'shippo-shipment-1' } })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.goshippo.com/shipments', 'https://api.goshippo.com/transactions',
      'https://api.goshippo.com/transactions?rate=shippo-rate-1',
    ])
  })

  it('EasyPost binds one exact shipment rate and reconciles the same shipment after suppressed buy response', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'shp_1', rates: [{ id: 'rate_1', carrier_account_id: 'ca_1', service: 'ExpressPost', rate: '10.25', currency: 'AUD' }] }))
      .mockRejectedValueOnce(new Error('response suppressed'))
      .mockResolvedValueOnce(Response.json({ id: 'shp_1', selected_rate: { id: 'rate_1', rate: '10.25', currency: 'AUD' }, tracking_code: 'TRACK-EASYPOST', postage_label: { label_url: 'https://labels.example/easypost.pdf' } }))
    const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'EZTK-test', signingKey, carrierAccountId: 'ca_1', service: 'ExpressPost', shipmentTemplate: { to_address: {}, from_address: {}, parcel: {} }, now })
    const quote = await gateway.quote()
    expect(quote).toMatchObject({ kind: 'quoted', expectedCost: { currency: 'AUD', amountMinor: 1_025 }, providerQuoteRef: expect.stringMatching(/^ae-provider-quote:v1:/) })
    if (quote.kind !== 'quoted') throw new Error(quote.reason)
    await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shp_1' })
    await expect(gateway.reconcile({ providerQuoteRef: quote.providerQuoteRef })).resolves.toMatchObject({ kind: 'effect_committed', providerReference: 'shp_1', outcome: { provider: 'easypost', shipment_id: 'shp_1' } })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.easypost.com/v2/shipments', 'https://api.easypost.com/v2/shipments/shp_1/buy',
      'https://api.easypost.com/v2/shipments/shp_1',
    ])
  })

  it('rejects tampered or expired provider quote references before any provider purchase call', async () => {
    const fetchImpl = vi.fn()
    const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'EZTK-test', signingKey, carrierAccountId: 'ca_1', service: 'ExpressPost', shipmentTemplate: {}, now })
    await expect(gateway.execute({ providerQuoteRef: 'ae-provider-quote:v1:tampered:value' })).resolves.toEqual({ kind: 'effect_not_committed', reason: 'provider_quote_invalid' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a correctly signed provider quote whose material does not match the exact schema', async () => {
    const fetchImpl = vi.fn()
    const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'EZTK-test', signingKey, carrierAccountId: 'ca_1', service: 'ExpressPost', shipmentTemplate: {}, now })
    const malformed = issueProviderQuoteRef({
      provider: 'easypost', shipmentId: '../shipments/other', rateId: 'rate', amountMinor: -1,
      currency: 'USD', expiresAt: now() + 60_000, extraAuthority: 'forged',
    }, signingKey)
    await expect(gateway.execute({ providerQuoteRef: malformed })).resolves.toEqual({ kind: 'effect_not_committed', reason: 'provider_quote_invalid' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts Shippo transaction rate references that identify the exact signed rate without an expanded rate object', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ object_id: 'shp_rate_ref', rates: [{ object_id: 'rate_ref', carrier_account: 'ca', amount: '1.00', currency: 'AUD' }] }))
      .mockResolvedValueOnce(Response.json({ object_id: 'tx_rate_ref', status: 'SUCCESS', rate: 'rate_ref', tracking_number: 'TRACK', label_url: 'https://labels.example/rate-ref.pdf' }))
    const gateway = createShippoGateway({ fetchImpl, token: 'token', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
    const quote = await gateway.quote(); if (quote.kind !== 'quoted') throw new Error(quote.reason)
    await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toMatchObject({
      kind: 'effect_committed', providerReference: 'tx_rate_ref', reportedCost: { currency: 'AUD', amountMinor: 100 },
    })
  })

  it('allows read-only reconciliation after quote expiry while continuing to reject purchase', async () => {
    let clock = 1_750_000_000_000
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'shp_expired', rates: [{ id: 'rate_expired', carrier_account_id: 'ca_1', service: 'ExpressPost', rate: '10.25', currency: 'AUD' }] }))
      .mockResolvedValueOnce(Response.json({ id: 'shp_expired', selected_rate: { id: 'rate_expired', rate: '10.25', currency: 'AUD' }, tracking_code: 'TRACK', postage_label: { label_url: 'https://labels.example/expired.pdf' } }))
    const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'EZTK-test', signingKey, carrierAccountId: 'ca_1', service: 'ExpressPost', shipmentTemplate: {}, now: () => clock })
    const quote = await gateway.quote()
    if (quote.kind !== 'quoted') throw new Error(quote.reason)
    clock = quote.providerQuoteExpiresAt + 1
    await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'effect_not_committed', reason: 'provider_quote_invalid' })
    await expect(gateway.reconcile({ providerQuoteRef: quote.providerQuoteRef })).resolves.toMatchObject({ kind: 'effect_committed', providerReference: 'shp_expired' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['Shippo', 409],
    ['EasyPost', 422],
  ])('treats %s purchase rejection status %i as unknown because the provider may have committed', async (provider, status) => {
    const fetchImpl = vi.fn()
    if (provider === 'Shippo') {
      fetchImpl.mockResolvedValueOnce(Response.json({ object_id: 'shp', rates: [{ object_id: 'rate', carrier_account: 'ca', amount: '1.00', currency: 'AUD' }] }))
        .mockResolvedValueOnce(Response.json({ error: 'ambiguous' }, { status }))
      const gateway = createShippoGateway({ fetchImpl, token: 'token', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
      const quote = await gateway.quote(); if (quote.kind !== 'quoted') throw new Error(quote.reason)
      await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shippo-rate:rate' })
    } else {
      fetchImpl.mockResolvedValueOnce(Response.json({ id: 'shp', rates: [{ id: 'rate', carrier_account_id: 'ca', rate: '1.00', currency: 'AUD' }] }))
        .mockResolvedValueOnce(Response.json({ error: 'ambiguous' }, { status }))
      const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'key', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
      const quote = await gateway.quote(); if (quote.kind !== 'quoted') throw new Error(quote.reason)
      await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shp' })
    }
  })

  it('refuses to call an EasyPost purchase committed when the purchased selected rate differs from the signed quote', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'shp_mismatch', rates: [{ id: 'rate_expected', carrier_account_id: 'ca', rate: '1.00', currency: 'AUD' }] }))
      .mockResolvedValueOnce(Response.json({ id: 'shp_mismatch', selected_rate: { id: 'rate_other', rate: '2.00', currency: 'AUD' }, tracking_code: 'TRACK', postage_label: { label_url: 'https://labels.example/mismatch.pdf' } }))
    const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'key', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
    const quote = await gateway.quote(); if (quote.kind !== 'quoted') throw new Error(quote.reason)
    await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shp_mismatch' })
  })

  it('keeps reconciliation uncertain when Shippo returns multiple transactions for one exact rate', async () => {
    const rate = { object_id: 'rate_multi', amount: '1.00', currency: 'AUD' }
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ object_id: 'shp_multi', rates: [{ ...rate, carrier_account: 'ca' }] }))
      .mockRejectedValueOnce(new Error('suppressed'))
      .mockResolvedValueOnce(Response.json({ results: [{ object_id: 'tx_1', status: 'SUCCESS', rate }, { object_id: 'tx_2', status: 'SUCCESS', rate }] }))
    const gateway = createShippoGateway({ fetchImpl, token: 'token', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
    const quote = await gateway.quote(); if (quote.kind !== 'quoted') throw new Error(quote.reason)
    await gateway.execute({ providerQuoteRef: quote.providerQuoteRef })
    await expect(gateway.reconcile({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shippo-rate:rate_multi' })
  })

  it('bounds provider response bodies and treats an oversized purchase response as unknown', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 'shp_large', rates: [{ id: 'rate_large', carrier_account_id: 'ca', rate: '1.00', currency: 'AUD' }] }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ padding: 'x'.repeat(1024 * 1024 + 1) }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'key', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
    const quote = await gateway.quote(); if (quote.kind !== 'quoted') throw new Error(quote.reason)
    await expect(gateway.execute({ providerQuoteRef: quote.providerQuoteRef })).resolves.toEqual({ kind: 'outcome_unknown', providerReference: 'shp_large' })
  })

  it.each(['1.001', '1e2', '-1.00', '01.00', '90071992547410.00'])(
    'refuses a non-canonical or unsafe carrier amount %s instead of rounding it', async (rate) => {
      const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({
        id: 'shp_bad_money', rates: [{ id: 'rate_bad_money', carrier_account_id: 'ca', rate, currency: 'AUD' }],
      }))
      const gateway = createEasyPostGateway({ fetchImpl, apiKey: 'key', signingKey, carrierAccountId: 'ca', shipmentTemplate: {}, now })
      await expect(gateway.quote()).resolves.toEqual({ kind: 'refused', reason: 'easypost_quote_invalid' })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    },
  )
})

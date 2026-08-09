import { describe, expect, it, vi } from 'vitest'

import {
  createEasyPostQuoteAdapter,
  createShippoQuoteAdapter,
} from '@/modules/provider-integrations/shipping/server'
import type { ShippingQuoteInput } from '@/modules/provider-integrations/shipping/public'

const signingKey = 'provider-quote-signing-key-with-at-least-32-bytes'
const now = () => 1_750_000_000_000

describe('production shipping quote adapters', () => {
  it('sends one Request-derived normalized input to Shippo in explicit millimetres and grams', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({
      object_id: 'shippo-shipment-1',
      rates: [{
        object_id: 'shippo-rate-1', carrier_account: 'shippo-carrier-1',
        provider: 'Australia Post', servicelevel: { token: 'au-express', name: 'Express Post' },
        amount: '12.34', currency: 'AUD', object_created: '2025-06-15T15:06:40.000Z',
        estimated_days: 2, duration_terms: 'Delivery in two business days', test: false,
      }],
    }))
    const adapter = createShippoQuoteAdapter({
      fetchImpl, token: 'shippo-token', signingKey,
      carrierAccountId: 'shippo-carrier-1', serviceLevelToken: 'au-express', now,
    })

    await expect(adapter.quote({ quoteInput })).resolves.toMatchObject({
      kind: 'quoted', inputDigest: quoteInput.inputDigest,
      provider: 'shippo', downstreamCarrier: 'Australia Post', serviceCode: 'au-express',
      expectedCost: { currency: 'AUD', units: '1234', exponent: 2 },
      maximumCost: { currency: 'AUD', units: '1234', exponent: 2 },
      observedAt: Date.parse('2025-06-15T15:06:40.000Z'),
    })
    expect(requestBody(fetchImpl)).toEqual({
      address_from: {
        name: 'Sender', street1: '1 Origin Street', city: 'Perth', state: 'WA', zip: '6000', country: 'AU',
      },
      address_to: {
        name: 'Recipient', street1: '2 Destination Road', city: 'Sydney', state: 'NSW', zip: '2000', country: 'AU',
      },
      parcels: [{ length: '300', width: '200', height: '100', distance_unit: 'mm', weight: '1200', mass_unit: 'g' }],
      carrier_accounts: ['shippo-carrier-1'], async: false,
    })
  })

  it('converts the same normalized input to EasyPost inches and ounces without unsupported unit fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({
      id: 'shp_1',
      rates: [{
        id: 'rate_1', carrier_account_id: 'ca_1', carrier: 'AustraliaPost', service: 'ExpressPost',
        rate: '10.25', currency: 'AUD', created_at: '2025-06-15T15:06:40.000Z', mode: 'production',
        delivery_days: 2, delivery_date: '2025-06-17', delivery_date_guaranteed: false,
      }],
    }))
    const adapter = createEasyPostQuoteAdapter({
      fetchImpl, apiKey: 'EZTK-production', signingKey,
      carrierAccountId: 'ca_1', service: 'ExpressPost', now,
    })

    await expect(adapter.quote({ quoteInput })).resolves.toMatchObject({
      kind: 'quoted', inputDigest: quoteInput.inputDigest,
      provider: 'easypost', downstreamCarrier: 'AustraliaPost', serviceCode: 'ExpressPost',
      expectedCost: { currency: 'AUD', units: '1025', exponent: 2 }, environment: 'production',
      maximumCost: { currency: 'AUD', units: '1025', exponent: 2 },
    })
    expect(requestBody(fetchImpl)).toEqual({
      shipment: {
        from_address: {
          name: 'Sender', street1: '1 Origin Street', city: 'Perth', state: 'WA', zip: '6000', country: 'AU',
        },
        to_address: {
          name: 'Recipient', street1: '2 Destination Road', city: 'Sydney', state: 'NSW', zip: '2000', country: 'AU',
        },
        parcel: { length: 11.8, width: 7.9, height: 3.9, weight: 42.3 },
        carrier_accounts: ['ca_1'],
      },
    })
    expect(JSON.stringify(requestBody(fetchImpl))).not.toMatch(/distance_unit|mass_unit/)
  })

  it('preserves provider fractional precision instead of assuming cents', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({
      object_id: 'shippo-shipment-precise',
      rates: [{
        object_id: 'shippo-rate-precise', carrier_account: 'shippo-carrier-1',
        provider: 'Australia Post', servicelevel: { token: 'au-express', name: 'Express Post' },
        amount: '0.007', currency: 'AUD', object_created: '2025-06-15T15:06:40.000Z',
        estimated_days: 2, duration_terms: 'Delivery in two business days', test: false,
      }],
    }))
    const adapter = createShippoQuoteAdapter({
      fetchImpl, token: 'shippo-token', signingKey,
      carrierAccountId: 'shippo-carrier-1', serviceLevelToken: 'au-express', now,
    })

    await expect(adapter.quote({ quoteInput })).resolves.toMatchObject({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', units: '7', exponent: 3 },
      maximumCost: { currency: 'AUD', units: '7', exponent: 3 },
    })
  })

  it.each([
    ['scientific notation', '7e-3'],
    ['negative amount', '-0.007'],
    ['malformed decimal', '0.'],
    ['precision beyond ExactAmount scale', '0.1234567890123456789'],
  ])('refuses %s provider rate', async (_label, amount) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({
      object_id: 'shippo-shipment-invalid',
      rates: [{
        object_id: 'shippo-rate-invalid', carrier_account: 'shippo-carrier-1',
        provider: 'Australia Post', servicelevel: { token: 'au-express', name: 'Express Post' },
        amount, currency: 'AUD', object_created: '2025-06-15T15:06:40.000Z',
      }],
    }))
    const adapter = createShippoQuoteAdapter({
      fetchImpl, token: 'shippo-token', signingKey,
      carrierAccountId: 'shippo-carrier-1', serviceLevelToken: 'au-express', now,
    })

    await expect(adapter.quote({ quoteInput })).resolves.toEqual({
      kind: 'refused', reason: 'shippo_quote_invalid',
    })
  })
})

function requestBody(fetchImpl: ReturnType<typeof vi.fn>): unknown {
  const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined
  if (typeof init?.body !== 'string') throw new Error('provider request body missing')
  return JSON.parse(init.body)
}

const quoteInput: ShippingQuoteInput = Object.freeze({
  schemaVersion: 'ae-shipping-quote-input:v1',
  source: { requestId: 'request:shipping:quote-input', requestRevision: 1 },
  origin: { name: 'Sender', street1: '1 Origin Street', city: 'Perth', region: 'WA', postcode: '6000', countryCode: 'AU' },
  destination: { name: 'Recipient', street1: '2 Destination Road', city: 'Sydney', region: 'NSW', postcode: '2000', countryCode: 'AU' },
  parcel: { lengthMillimetres: 300, widthMillimetres: 200, heightMillimetres: 100, weightGrams: 1_200 },
  deliveryDeadline: 1_760_000_000_000,
  inputDigest: 'sha256:48f5e0f46f16833ba8a7cb221c802196e8cdd60fb662f7ca5c42a360e44721a4',
})

import { describe, expect, it } from 'vitest'

import {
  deriveShippingQuoteInput,
  type ShippingQuoteInputDerivation,
  type ShippingQuoteRequest,
} from '@/modules/provider-integrations/shipping/public'

describe('shipping quote input derivation', () => {
  it('derives different provider inputs and digests from different Customer Request parcel facts', () => {
    const first = requireReady(deriveShippingQuoteInput(request({ parcel_weight_grams: 1_200 })))
    const second = requireReady(deriveShippingQuoteInput(request({ parcel_weight_grams: 2_400 })))

    expect(first.parcel.weightGrams).toBe(1_200)
    expect(second.parcel.weightGrams).toBe(2_400)
    expect(first.inputDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(second.inputDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(first.inputDigest).not.toBe(second.inputDigest)
  })

  it('flows a Customer Request fact change into the normalized provider input', () => {
    const first = requireReady(deriveShippingQuoteInput(request()))
    const second = requireReady(deriveShippingQuoteInput(request({ destination_postcode: '3000' })))

    expect(first.destination.postcode).toBe('2000')
    expect(second.destination.postcode).toBe('3000')
    expect(second.inputDigest).not.toBe(first.inputDigest)
  })

  it('refuses missing required Customer Request facts without substituting provider defaults', () => {
    const complete = request()
    const { parcel_height_mm: _removed, ...knownFacts } = complete.knownFacts

    expect(deriveShippingQuoteInput({ ...complete, knownFacts })).toEqual({
      kind: 'refused',
      reason: 'shipping_quote_input_missing',
      fields: ['parcel_height_mm'],
    })
  })

  it('refuses invalid Customer Request facts with a typed field path', () => {
    expect(deriveShippingQuoteInput(request({ parcel_weight_grams: 0 }))).toEqual({
      kind: 'refused',
      reason: 'shipping_quote_input_invalid',
      fields: ['parcel.weightGrams'],
    })
  })
})

function requireReady(result: ShippingQuoteInputDerivation) {
  if (result.kind !== 'ready') throw new Error(`expected ready input, received ${result.reason}`)
  return result.quoteInput
}

function request(overrides: Readonly<Record<string, string | number | boolean>> = {}): ShippingQuoteRequest {
  return {
    requestId: 'request:shipping:quote-input',
    knownFacts: {
      origin_name: 'Sender', origin_street1: '1 Origin Street', origin_city: 'Perth',
      origin_region: 'WA', origin_postcode: '6000', origin_country_code: 'AU',
      destination_name: 'Recipient', destination_street1: '2 Destination Road', destination_city: 'Sydney',
      destination_region: 'NSW', destination_postcode: '2000', destination_country_code: 'AU',
      parcel_length_mm: 300, parcel_width_mm: 200, parcel_height_mm: 100, parcel_weight_grams: 1_200,
      delivery_deadline: 1_760_000_000_000,
      ...overrides,
    },
    revision: 1,
  }
}

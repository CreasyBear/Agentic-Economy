import { describe, expect, it } from 'vitest'

import {
  handleDemoProviderQuoteRequest,
  nextAdelaideBusinessSlot,
} from '@/routes/api.demo-provider.quote'

describe('AE Demo Services quote endpoint', () => {
  it('computes the next Adelaide business slot from the current time', () => {
    expect(nextAdelaideBusinessSlot(new Date('2026-07-28T00:00:00.000Z')))
      .toBe('2026-07-28T00:30:00.000Z')
    expect(nextAdelaideBusinessSlot(new Date('2026-07-31T08:00:00.000Z')))
      .toBe('2026-08-02T23:30:00.000Z')
  })

  it('returns a bounded fixed AUD quote with computed availability', async () => {
    const response = await handleDemoProviderQuoteRequest(new Request('https://ae.example/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'home-office-video-setup', postcode: '5000' }),
    }), new Date('2026-07-28T00:00:00.000Z'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', units: '18900', exponent: 2 },
      maximumCost: { currency: 'AUD', units: '18900', exponent: 2 },
      dataFields: ['service', 'postcode'],
      disclosures: ['postcode'],
      availability: {
        nextSlot: '2026-07-28T00:30:00.000Z',
        durationMinutes: 90,
        timeZone: 'Australia/Adelaide',
      },
    })
  })
  it('refuses malformed JSON without defaulting to a quote', async () => {
    const response = await handleDemoProviderQuoteRequest(new Request('https://ae.example/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"service":',
    }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      type: 'about:blank',
      title: 'Invalid argument',
      status: 400,
      detail: 'invalid_request',
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_request',
    })
  })

  it('rejects oversized JSON before parsing a quote', async () => {
    const response = await handleDemoProviderQuoteRequest(new Request('https://ae.example/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'remote-tech-check', padding: 'x'.repeat(8 * 1024) }),
    }))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      type: 'about:blank',
      title: 'Payload too large',
      status: 413,
      detail: 'request_too_large',
      kind: 'PAYLOAD_TOO_LARGE',
      code: 'request_too_large',
    })
  })



  it('refuses unsupported services without inventing a quote', async () => {
    const response = await handleDemoProviderQuoteRequest(new Request('https://ae.example/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'unsupported' }),
    }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      type: 'about:blank',
      title: 'Invalid argument',
      status: 400,
      detail: 'invalid_request',
      kind: 'INVALID_ARGUMENT',
      code: 'invalid_request',
    })
  })
})

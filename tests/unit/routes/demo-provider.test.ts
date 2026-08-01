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
      expectedCost: { currency: 'AUD', amountMinor: 18_900 },
      maximumCost: { currency: 'AUD', amountMinor: 18_900 },
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
    await expect(response.json()).resolves.toEqual({ kind: 'refused', reason: 'invalid_request' })
  })


  it('refuses unsupported services without inventing a quote', async () => {
    const response = await handleDemoProviderQuoteRequest(new Request('https://ae.example/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: 'unsupported' }),
    }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ kind: 'refused', reason: 'invalid_request' })
  })
})

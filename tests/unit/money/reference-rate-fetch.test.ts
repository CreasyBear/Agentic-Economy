import { describe, expect, it, vi } from 'vitest'
import { fetchCoinbaseReferenceRate } from '../../../src/modules/money/reference-rate'

describe('Coinbase reference rate fetch', () => {
  it('fetches one fixed public currency pair and retains decimal precision', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ data: { currency: 'USDC', rates: { AUD: '1.501234567890123456789' } } }))
    expect(await fetchCoinbaseReferenceRate({ fetch, now: () => 1000 })).toEqual({ source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.501234567890123456789', fetchedAt: 1000 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://api.coinbase.com/v2/exchange-rates?currency=USDC', expect.objectContaining({ redirect: 'error' }))
  })
  it('refuses wrong pairs, invalid rates, oversized bodies and unavailable upstreams', async () => {
    for (const response of [
      Response.json({ data: { currency: 'USD', rates: { AUD: '1.5' } } }),
      Response.json({ data: { currency: 'USDC', rates: { AUD: '0' } } }),
      Response.json({ data: { currency: 'USDC', rates: { AUD: 1.5 } } }),
      new Response('x'.repeat(128 * 1024 + 1)),
      new Response('', { status: 503 }),
    ]) {
      expect(await fetchCoinbaseReferenceRate({ fetch: vi.fn().mockResolvedValue(response) })).toBeUndefined()
    }
    expect(await fetchCoinbaseReferenceRate({ fetch: vi.fn().mockRejectedValue(new Error('timeout')) })).toBeUndefined()
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
const read = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market/x402-directory.server', () => ({ readX402Directory: read }))
import { readX402MarketplaceHome } from '@/modules/market/x402-marketplace-home.server'
import { X402_MARKETPLACE_COLLECTIONS } from '@/modules/market/x402-marketplace-home'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
const items: X402DirectoryEntry[] = Array.from({ length: 8 }, (_, i) => ({ resource: `https://api.example.com/${i}`, title: `Tool ${i}`, provider: i < 4 ? 'api.example.com' : 'other.example.com', description: '', protocol: 'http', prices: [], metadataJson: '{}' }))
beforeEach(() => read.mockReset())
describe('editorial marketplace collections', () => {
  it('orders a collection by Bazaar call volume, then keeps two Tools per Provider', async () => {
    const ranked: X402DirectoryEntry[] = [
      { ...items[0]!, title: 'Low', activity: { calls30d: 1, payers30d: 1 } },
      { ...items[1]!, title: 'High', activity: { calls30d: 50, payers30d: 2 } },
      { ...items[2]!, title: 'Mid', activity: { calls30d: 9, payers30d: 4 } },
      { ...items[4]!, title: 'Other', activity: { calls30d: 3, payers30d: 3 } },
    ]
    read.mockResolvedValue({ kind: 'ok', items: ranked, offset: 0, limit: 20 })
    const home = await readX402MarketplaceHome()
    expect(home.rails[0]?.items.map(item => item.title)).toEqual(['High', 'Mid', 'Other'])
  })

  it('searches every collection independently and selects diverse providers in source order', async () => {
    read.mockResolvedValue({ kind: 'ok', items, offset: 0, limit: 20, partialResults: true })
    const home = await readX402MarketplaceHome()
    expect(read).toHaveBeenCalledTimes(6)
    expect(home.rails.map(rail => rail.search)).toEqual(X402_MARKETPLACE_COLLECTIONS.map(({ query }) => ({ query })))
    for (const collection of X402_MARKETPLACE_COLLECTIONS) expect(read).toHaveBeenCalledWith({ query: collection.query })
    expect(home.rails[0]?.items.map(item => item.title)).toEqual(['Tool 0', 'Tool 1', 'Tool 4', 'Tool 5'])
    expect(home.rails[0]).toMatchObject({ returnedCount: 8, partialResults: true, kind: 'ok' })
    expect(Number.isFinite(Date.parse(home.observedAt))).toBe(true)
  })
  it('keeps healthy and empty collections available when another request fails', async () => {
    read.mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' })
      .mockResolvedValueOnce({ kind: 'ok', items: [], offset: 0, limit: 20 })
      .mockResolvedValue({ kind: 'ok', items, offset: 0, limit: 20 })
    const home = await readX402MarketplaceHome()
    expect(home.rails).toHaveLength(6)
    expect(home.rails[0]).toMatchObject({ kind: 'unavailable', items: [] })
    expect(home.rails[1]).toMatchObject({ kind: 'unavailable', items: [] })
    expect(home.rails[2]).toMatchObject({ kind: 'ok', items: [], returnedCount: 0 })
    expect(home.rails[3]?.items).toHaveLength(4)
  })
})

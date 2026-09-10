import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async (original) => ({ ...await original<typeof import('@coinbase/cdp-sdk')>(), listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))
import { fetchCatalogPage } from '../../../convex/capabilityToolCatalog'

describe('SDK-backed catalogue discovery', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('uses Coinbase search and preserves its truncation without inventing a continuation', async () => {
    sdk.search.mockResolvedValue({ resources: [{ resource: 'https://provider.test/tool' }], partialResults: true, x402Version: 2 })
    const page = await fetchCatalogPage({ source: 'coinbase', query: 'weather', limit: 100 })
    expect(sdk.search).toHaveBeenCalledWith({ query: 'weather', limit: 20, scheme: 'exact' })
    expect(page).toEqual({ items: [{ resource: 'https://provider.test/tool' }], partialResults: true, limit: 20 })
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('continues native browsing beyond the old four-page maximum', async () => {
    sdk.list.mockResolvedValue({ items: Array.from({ length: 20 }, (_, i) => ({ resource: `https://provider.test/${i}` })), pagination: { limit: 20, offset: 400, total: 450 } })
    const page = await fetchCatalogPage({ source: 'coinbase', query: '', cursor: '400' })
    expect(sdk.list).toHaveBeenCalledWith({ type: 'http', limit: 20, offset: 400 })
    expect(page.nextCursor).toBe('420')
  })

  it('rejects malformed offsets and search pagination', async () => {
    await expect(fetchCatalogPage({ source: 'coinbase', query: '', cursor: '1e2' })).rejects.toThrow('catalog_cursor_invalid')
    await expect(fetchCatalogPage({ source: 'coinbase', query: 'weather', cursor: '20' })).rejects.toThrow('catalog_search_has_no_cursor')
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('preserves small-page positions across native Coinbase page boundaries', async () => {
    sdk.list.mockImplementation(async ({ offset }: { offset: number }) => ({
      items: Array.from({ length: 20 }, (_, i) => ({ resource: `https://provider.test/${offset + i}` })),
      pagination: { limit: 20, offset, total: 40 },
    }))
    for (const cursor of ['1', '19', '20']) {
      const page = await fetchCatalogPage({ source: 'coinbase', query: '', cursor, limit: 1 })
      expect(page.items).toEqual([{ resource: `https://provider.test/${cursor}` }])
      expect(page.nextCursor).toBe(String(Number(cursor) + 1))
    }
    expect(sdk.list).toHaveBeenNthCalledWith(1, { type: 'http', limit: 20, offset: 0 })
    expect(sdk.list).toHaveBeenNthCalledWith(3, { type: 'http', limit: 20, offset: 20 })
    const crossing = await fetchCatalogPage({ source: 'coinbase', query: '', cursor: '12', limit: 12 })
    expect(crossing.items).toHaveLength(8)
    expect(crossing.nextCursor).toBe('20')
  })

  it('keeps upstream failures distinct from empty results', async () => {
    sdk.list.mockRejectedValue(new Error('upstream unavailable'))
    await expect(fetchCatalogPage({ source: 'coinbase', query: '' })).rejects.toThrow('upstream unavailable')
    sdk.list.mockResolvedValue({ items: [], pagination: { offset: 0, total: 0 } })
    await expect(fetchCatalogPage({ source: 'coinbase', query: '' })).resolves.toEqual({ items: [], limit: 20 })
  })

  it('uses PayAI documented pagination and refuses semantic-search emulation', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ resource: 'https://provider.test/tool' }], pagination: { total: 51 } }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchCatalogPage({ source: 'payai', query: '', cursor: '40' })).resolves.toMatchObject({ nextCursor: '41' })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://facilitator.payai.network/discovery/resources?limit=20&offset=40')
    await expect(fetchCatalogPage({ source: 'payai', query: 'weather' })).rejects.toThrow('payai_browse_only')
  })
})

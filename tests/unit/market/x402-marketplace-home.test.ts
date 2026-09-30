import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
const read = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market/x402-directory-index.server', () => ({ readX402DirectoryCatalogue: read }))
import { readX402MarketplaceHome } from '@/modules/market/x402-marketplace-home.server'
import { X402_MARKETPLACE_RAILS } from '@/modules/market/x402-marketplace-home'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
const entry = (provider: string, index: number): X402DirectoryEntry => ({
  resource: `https://${provider}/${index}`,
  title: `${provider} Tool ${index}`,
  provider,
  description: '',
  protocol: 'http',
  prices: [],
  metadataJson: '{}',
})
function catalogue(entries: readonly X402DirectoryEntry[]) {
  return { kind: 'ok', source: 'index', searchMethod: 'native_full_text', isDone: true, page: { kind: 'ok', items: entries, offset: 0, limit: 12, mode: 'browse', appliedFilters: {} } }
}
beforeEach(() => { read.mockReset(); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production') })
afterEach(() => vi.unstubAllEnvs())
describe('evidence-based marketplace rails', () => {
  it('hides all rails when the deployment declaration is missing', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', undefined)
    expect(await readX402MarketplaceHome()).toEqual({ rails: [], observedAt: expect.any(String) })
    expect(read).not.toHaveBeenCalled()
  })
  it('requests only Sepolia rails in development', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    read.mockResolvedValue(catalogue([]))
    await readX402MarketplaceHome()
    expect(read).toHaveBeenCalledTimes(4)
    for (const [request] of read.mock.calls) expect(request.network).toBe('eip155:84532')
  })

  it('reads the four browse sorts independently and keeps their evidence order', async () => {
    read.mockImplementation(async (request: { sort?: string } | undefined) => catalogue([entry(`${request?.sort ?? 'missing'}.example.com`, 0)]))
    const home = await readX402MarketplaceHome()

    expect(home.rails.map(({ id, sort }) => ({ id, sort }))).toEqual([
      { id: 'adoption', sort: 'adoption' },
      { id: 'active', sort: 'active' },
      { id: 'repeat', sort: 'repeat' },
      { id: 'price_asc', sort: 'price_asc' },
    ])
    expect(read.mock.calls.map(([request]) => request)).toEqual([
      { sort: 'adoption', network: 'eip155:8453' },
      { sort: 'active', network: 'eip155:8453' },
      { sort: 'repeat', network: 'eip155:8453' },
      { sort: 'price_asc', network: 'eip155:8453' },
    ])
    expect(home.rails.map(rail => rail.items[0]?.provider)).toEqual(X402_MARKETPLACE_RAILS.map(rail => `${rail.sort}.example.com`))
  })

  it('keeps at most two Tools per Provider and eight per rail, in browse order', async () => {
    const ranked = ['one', 'two', 'three', 'four', 'five'].flatMap(provider =>
      Array.from({ length: 3 }, (_, index) => entry(`${provider}.example.com`, index)),
    )
    read.mockResolvedValue(catalogue(ranked))

    const home = await readX402MarketplaceHome()
    const expected = ['one', 'two', 'three', 'four'].flatMap(provider =>
      [0, 1].map(index => `https://${provider}.example.com/${index}`),
    )
    expect(home.rails).toHaveLength(4)
    for (const rail of home.rails) expect(rail.items.map(item => item.resource)).toEqual(expected)
  })

  it('hides rejected, unavailable and empty rails without losing a healthy rail', async () => {
    read.mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' })
      .mockResolvedValueOnce(catalogue([]))
      .mockResolvedValueOnce(catalogue([entry('healthy.example.com', 0)]))

    const home = await readX402MarketplaceHome()
    expect(home.rails.map(rail => rail.id)).toEqual(['price_asc'])
    expect(home.rails[0]?.items.map(item => item.provider)).toEqual(['healthy.example.com'])
  })
})

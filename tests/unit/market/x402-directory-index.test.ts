import { describe, expect, it, vi } from 'vitest'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { x402DirectoryInputSchema } from '@/modules/market/x402-directory'
import { directoryAdoptionBand, directoryBasePayTo, directoryEntryMatchesFilters, directoryNetwork, directoryPriceBand, directorySlugBase, minimumDirectoryUsdPrice, x402DirectoryIndexInputSchema } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
const { query, upstream } = vi.hoisted(() => ({ query: vi.fn(), upstream: vi.fn() }))
vi.mock('@/lib/server/convex-source', () => ({ sourceQuery: (name: string) => name, callPublicSourceQuery: query }))
vi.mock('@/modules/market/x402-directory.server', () => ({ readX402Directory: upstream }))
import { readX402DirectoryCatalogueBySlug } from '@/modules/market/x402-directory-index.server'
const entry: X402DirectoryEntry = {
  resource: 'https://provider.test/tool', title: 'Tool', description: '', protocol: 'http', provider: 'provider.test', metadataJson: '{}',
  prices: [
    { network: 'base', scheme: 'exact', amount: '2000000', decimalAmount: '2', symbol: 'USDC' },
    { network: 'eip155:1', scheme: 'exact', amount: '100000', decimalAmount: '0.1', symbol: 'USDC' },
    { network: 'base', scheme: 'exact', amount: '1', decimalAmount: '0.0000001', symbol: 'UNKNOWN' },
  ],
}
describe('directory Base payee', () => {
  it('reads the payee from provider metadata when the stored price omitted it', () => {
    const payTo = '0xabababababababababababababababababababab'
    const listed = {
      ...entry,
      prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '1 USDC', decimalAmount: '1', symbol: 'USDC', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }],
      metadataJson: JSON.stringify({ accepts: [{ network: 'eip155:8453', scheme: 'exact', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000000', payTo: `0x${'AB'.repeat(20)}` }] }),
    }
    expect(directoryBasePayTo(listed)).toBe(payTo)
    expect(directoryBasePayTo({ ...listed, prices: [{ ...listed.prices[0]!, payTo: '0x1111111111111111111111111111111111111111' }] })).toBe('0x1111111111111111111111111111111111111111')
    expect(directoryBasePayTo({ ...listed, metadataJson: '{' })).toBeUndefined()
  })
  it('does not report deliberately omitted projected metadata as malformed provider JSON', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(directoryBasePayTo({ ...entry, metadataJson: '' })).toBeUndefined()
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})
describe('directory hard filters', () => {
  it('accepts the Market query limit with its existing hard filters and rejects longer input', () => {
    const query = 'x'.repeat(SEARCH_QUERY_MAX_LENGTH)
    const filters = { provider: 'Provider.Test', network: 'base', maxUsdPrice: 0.25 }

    expect(x402DirectoryIndexInputSchema.parse({ query, ...filters })).toMatchObject({
      query,
      provider: 'provider.test',
      network: 'base',
      maxUsdPrice: 0.25,
    })
    expect(x402DirectoryIndexInputSchema.safeParse({ query: `${query}x`, ...filters }).success).toBe(false)
    expect(x402DirectoryInputSchema.safeParse({ query }).success).toBe(true)
    expect(x402DirectoryInputSchema.safeParse({ query: `${query}x` }).success).toBe(false)
  })

  it('normalizes supported upstream network aliases without changing unknown identifiers', () => {
    expect(directoryNetwork('base')).toBe('eip155:8453')
    expect(directoryNetwork('eip155:8453')).toBe('eip155:8453')
    expect(directoryNetwork('future:chain')).toBe('future:chain')
  })
  it('requires the network and USD cap to match the same known payment option', () => {
    expect(minimumDirectoryUsdPrice(entry)).toBe('0.1')
    expect(minimumDirectoryUsdPrice(entry, 'eip155:8453')).toBe('2')
    expect(directoryEntryMatchesFilters(entry, { network: 'base', maxUsdPrice: 1 })).toBe(false)
    expect(directoryEntryMatchesFilters(entry, { network: 'base', maxUsdPrice: 2, provider: 'PROVIDER.TEST' })).toBe(true)
    expect(directoryEntryMatchesFilters(entry, { network: 'base', provider: 'other.test' })).toBe(false)
  })
  it('keeps exact decimal boundaries and excludes absent or invalid price facts', () => {
    const precise = { ...entry, prices: [{ ...entry.prices[0]!, decimalAmount: '0.1000000000000000001' }] }
    expect(directoryEntryMatchesFilters(precise, { maxUsdPrice: 0.1 })).toBe(false)
    for (const decimalAmount of ['NaN', 'Infinity', '-1', 'invalid']) expect(directoryEntryMatchesFilters({ ...precise, prices: [{ ...precise.prices[0]!, decimalAmount }] }, { maxUsdPrice: 100 })).toBe(false)
    expect(directoryEntryMatchesFilters({ ...entry, prices: [] }, { maxUsdPrice: 100 })).toBe(false)
  })
  it('uses exact-scheme prices and classifies half-open price bands without overlapping boundaries', () => {
    expect(minimumDirectoryUsdPrice({ ...entry, prices: [{ ...entry.prices[0]!, scheme: 'upto', decimalAmount: '0.001' }] })).toBeUndefined()
    expect(['0', '0.009999', '0.01', '0.029999', '0.03', '0.1', '1', '10'].map(directoryPriceBand)).toEqual(['lt_0_01', 'lt_0_01', '0_01_to_0_03', '0_01_to_0_03', '0_03_to_0_10', '0_10_to_1', '1_to_10', '10_plus'])
    expect(directoryPriceBand(undefined)).toBe('unknown')
    expect([undefined, 0, 1, 2, 4, 5, 9, 10, 49, 50].map(directoryAdoptionBand)).toEqual(['missing', '0', '1', '2_4', '2_4', '5_9', '5_9', '10_49', '10_49', '50_plus'])
  })

  it('resolves an index miss from the upstream Provider page without replacing the original miss', async () => {
    const upstreamEntry = { ...entry, resource: 'https://provider.test/v1/images/generations' }
    const indexUnavailable = { kind: 'unavailable', reason: 'index_unavailable' } as const
    query.mockResolvedValue(indexUnavailable)
    upstream.mockResolvedValue({ kind: 'ok', items: [upstreamEntry], offset: 0, limit: 20 })

    expect(await readX402DirectoryCatalogueBySlug({
      providerKey: 'provider.test',
      slug: directorySlugBase(upstreamEntry.resource),
    })).toEqual({ kind: 'found_upstream', item: { entry: upstreamEntry } })

    upstream.mockResolvedValue({ kind: 'ok', items: [], offset: 0, limit: 20 })
    expect(await readX402DirectoryCatalogueBySlug({
      providerKey: 'provider.test',
      slug: directorySlugBase(upstreamEntry.resource),
    })).toEqual(indexUnavailable)
  })

})

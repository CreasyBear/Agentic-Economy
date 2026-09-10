import { describe, expect, it } from 'vitest'
import { directoryEntryMatchesFilters, directoryNetwork, directoryPriceBand, directoryAdoptionBand, minimumDirectoryUsdPrice } from '@/modules/market/x402-directory-index'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
const entry: X402DirectoryEntry = {
  resource: 'https://provider.test/tool', title: 'Tool', description: '', protocol: 'http', provider: 'provider.test', metadataJson: '{}',
  prices: [
    { network: 'base', scheme: 'exact', amount: '2000000', decimalAmount: '2', symbol: 'USDC' },
    { network: 'eip155:1', scheme: 'exact', amount: '100000', decimalAmount: '0.1', symbol: 'USDC' },
    { network: 'base', scheme: 'exact', amount: '1', decimalAmount: '0.0000001', symbol: 'UNKNOWN' },
  ],
}
describe('directory hard filters', () => {
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

})

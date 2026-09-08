import { expect, it } from 'vitest'
import { x402DirectoryFunctionalTitle } from '@/modules/market/x402-directory-title'
import { directoryNetworkLabel, directoryPrice, directoryTitle } from '@/components/ae/market/directory-presentation'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
const entry: X402DirectoryEntry = { resource: 'https://example.com/exa', provider: 'example.com', title: 'StableEnrich', serviceName: 'StableEnrich', description: 'Search with Exa; returns matching documents.', protocol: 'http', prices: [], metadataJson: '{}' }
it('repairs stale umbrella titles from the declared job while preserving explicit operation titles', () => {
  expect(directoryTitle(entry)).toBe('Search with Exa')
  expect(directoryTitle({ ...entry, title: 'Find companies' })).toBe('Find companies')
  expect(directoryTitle({ ...entry, description: 'The provider has not supplied a description.' })).toBe('StableEnrich')
  expect(directoryTitle({ ...entry, description: 'Search '.repeat(80) }).length).toBeLessThanOrEqual(100)
  expect(entry.title).toBe('StableEnrich')
  expect(entry.description).toBe('Search with Exa; returns matching documents.')
})
it('keeps exact known denominations and defers unknown atomic amounts to payment details', () => {
  const unknown = { ...entry, prices: [{ network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', scheme: 'exact', amount: '20000 atomic units (unknown-mint)' }] }
  expect(directoryPrice(unknown)).toBe('See payment details')
  expect(directoryNetworkLabel(unknown)).toBe('Solana')
  expect(unknown.prices[0]?.amount).toBe('20000 atomic units (unknown-mint)')
  expect(directoryPrice({ ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.020000', symbol: 'USDC' }] })).toBe('0.02 USDC')
  expect(directoryPrice(entry)).toBe('Price on request')
})

it('skips empty declared titles before selecting a useful source description', () => {
  expect(x402DirectoryFunctionalTitle({ explicitTitle: ' \u0000 ', description: 'Search companies; returns business records.', serviceName: 'Umbrella', fallback: 'Service' })).toBe('Search companies')
})

it('uses spaced ASCII dashes as description clauses while preserving hyphenated words', () => {
  expect(x402DirectoryFunctionalTitle({ description: 'Exa Search - Neural search across the web', fallback: 'Service' })).toBe('Exa Search')
  expect(x402DirectoryFunctionalTitle({ description: 'Higher-fidelity text-to-image over x402 - OpenAI images wire format', fallback: 'Service' })).toBe('Higher-fidelity text-to-image over x402')
})
it('truncates long labels at complete words without clipping an amount or token', () => {
  const beginning = `${'Published source '.repeat(5)}price `
  const title = x402DirectoryFunctionalTitle({ description: `${beginning}$0.000000000000000001 per response`, fallback: 'Service' })
  expect(title).toBe(`${beginning.trimEnd()}…`)
  expect(title).not.toContain('$0.')
  expect(title.length).toBeLessThanOrEqual(100)
})

it('skips a price-only description prefix without changing explicit titles or price-bearing prose', () => {
  const description = '$0.001/page. Extract every embedded image from a PDF as PNGs. 1¢ x402 min; remainder auto-credits — relaystation.ai/penny'
  expect(x402DirectoryFunctionalTitle({ description, serviceName: 'Relaystation Images', fallback: 'Service' })).toBe('Extract every embedded image from a PDF as PNGs.')
  expect(x402DirectoryFunctionalTitle({ description: '$0.001/page.', serviceName: 'Relaystation Images', fallback: 'Service' })).toBe('Relaystation Images')
  expect(x402DirectoryFunctionalTitle({ description: '$0.001/page.', fallback: 'Service' })).toBe('Service')
  expect(x402DirectoryFunctionalTitle({ explicitTitle: '$0.001/page.', description, fallback: 'Service' })).toBe('$0.001/page.')
  expect(x402DirectoryFunctionalTitle({ description: 'Extract images for $0.001/page.', fallback: 'Service' })).toBe('Extract images for $0.001/page.')
})

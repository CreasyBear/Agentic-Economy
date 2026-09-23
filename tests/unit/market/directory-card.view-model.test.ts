import { expect, it } from 'vitest'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const entry: X402DirectoryEntry = {
  resource: 'https://example.com/exa',
  provider: 'example.com',
  title: 'StableEnrich',
  serviceName: 'StableEnrich',
  description: 'Search with Exa; returns matching documents.',
  protocol: 'http',
  prices: [],
  metadataJson: '{}',
}

it('labels empty prices as on-request with no Provider price published', () => {
  const model = toDirectoryToolCardModel(entry)
  expect(model.priceLabel).toBe('Price on request')
  expect(model.priceContext).toBe('No Provider price published')
})

it('formats decimalAmount and symbol as a listed denomination', () => {
  const model = toDirectoryToolCardModel({
    ...entry,
    prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', decimalAmount: '0.020000', symbol: 'USDC' }],
  })
  expect(model.priceLabel).toBe('0.02 USDC')
  expect(model.priceContext).toBe('Provider price per Call')
})

it('defers unknown atomic amounts to payment details', () => {
  const model = toDirectoryToolCardModel({
    ...entry,
    prices: [{ network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', scheme: 'exact', amount: '20000 atomic units (unknown-mint)' }],
  })
  expect(model.priceLabel).toBe('See payment details')
})

it('counts multiple payment options', () => {
  const model = toDirectoryToolCardModel({
    ...entry,
    prices: [
      { network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC' },
      { network: 'solana:mainnet', scheme: 'exact', amount: '0.02 USDC' },
    ],
  })
  expect(model.priceContext).toBe('2 Provider payment options')
})

it('surfaces recent Call activity with label and title', () => {
  const model = toDirectoryToolCardModel({ ...entry, activity: { calls30d: 12 } })
  expect(model.activityLabel).toBe('Used recently by other agents')
  expect(model.activityTitle).toBe('Reported by Coinbase Bazaar in the past 30 days')
})

it('omits absent optional keys from the model object', () => {
  const model = toDirectoryToolCardModel({
    resource: 'https://example.com/minimal',
    provider: 'example.com',
    title: 'Minimal',
    description: 'Minimal',
    protocol: 'http',
    prices: [],
    metadataJson: '{}',
  })
  expect('iconUrl' in model).toBe(false)
  expect('description' in model).toBe(false)
})

it('de-duplicates tags with category first and caps at two', () => {
  const model = toDirectoryToolCardModel({
    ...entry,
    category: 'search',
    tags: ['search', 'web', 'extra'],
  })
  expect(model.tags).toEqual(['search', 'web'])
})

it('derives providerHost and slug from directory index helpers', () => {
  const model = toDirectoryToolCardModel({ ...entry, slug: 'custom-slug' })
  expect(model.providerHost).toBe(directoryProviderKey(entry.provider))
  expect(model.slug).toBe('custom-slug')
  const { slug: _slug, ...withoutSlug } = { ...entry, slug: 'ignored' }
  expect(toDirectoryToolCardModel(withoutSlug).slug).toBe(directorySlugBase(entry.resource))
})

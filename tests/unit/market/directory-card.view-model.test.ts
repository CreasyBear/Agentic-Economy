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

it('surfaces Bazaar volume without treating it as an Agentic Economy Call', () => {
  const model = toDirectoryToolCardModel({ ...entry, activity: { calls30d: 12, lastCalledAt: '2026-09-08T06:00:00.000Z' } })
  expect(model.activityLabel).toBe('12 reported calls in 30 days')
  expect(model.activityTitle).toBe('Coinbase Bazaar volume, not an Agentic Economy Call. Last reported 8 Sept 2026.')
  expect(toDirectoryToolCardModel({ ...entry, activity: { calls30d: 1 } }).activityLabel).toBe('1 reported call in 30 days')
  expect(toDirectoryToolCardModel({ ...entry, activity: { calls30d: 9, payers30d: 2 } }).activityLabel).toBe('9 reported calls · 2 payers in 30 days')
  expect(toDirectoryToolCardModel({ ...entry, activity: { calls30d: 1, payers30d: 1 } }).activityLabel).toBe('1 reported call · 1 payer in 30 days')
  expect(toDirectoryToolCardModel({ ...entry, activity: { lastCalledAt: '2026-09-08T06:00:00.000Z' } }).activityLabel).toBe('Last reported 8 Sept 2026')
})

it('keeps a service icon and two-letter mark for the card', () => {
  expect(toDirectoryToolCardModel(entry).initials).toBe('ST')
  const marked = toDirectoryToolCardModel({ ...entry, iconUrl: 'https://cdn.example.com/icon.png', serviceName: 'agentbit.app' })
  expect(marked.iconUrl).toBe('https://cdn.example.com/icon.png')
  expect(marked.initials).toBe('AG')
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

it('names the provider once and turns schema fields into a glance line', () => {
  const model = toDirectoryToolCardModel({
    ...entry,
    serviceName: 'ItalianCompanyCheck',
    provider: 'italian-company-check.example',
    title: 'Italian company registry lookup, verification and KYB pre-check',
    description: 'Italian company registry lookup, verification and KYB pre-check using official sources.',
    schemaSummary: 'Inputs: company_name (required), vat_number',
    output: {
      fields: [
        { name: 'found', path: 'found', location: 'output', source: 'schema' },
        { name: 'jurisdiction', path: 'jurisdiction', location: 'output', source: 'schema' },
        { name: 'legal_address', path: 'legal_address', location: 'output', source: 'schema' },
      ],
    },
  })
  expect(model.providerLine).toBe('ItalianCompanyCheck')
  expect(model.glance).toBe('Returns jurisdiction, legal address')
  expect(model.description).toBeUndefined()
})

import { expect, it } from 'vitest'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import { absorbProviderEntries, groupDirectoryProviders, toDirectoryProviderRow, toDirectoryServiceSurface, toDirectoryToolCardModel, toDirectoryToolPageModel } from '@/modules/market/directory-card.view-model'
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

it('carries the decision facts a listing page can show without a Call', () => {
  const model = toDirectoryToolPageModel({
    ...entry,
    methodLabel: 'HTTP POST',
    outputSummary: 'Returns matching documents',
    activity: { calls30d: 12, payers30d: 2, lastCalledAt: '2026-09-01T00:00:00.000Z' },
    prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '0.02 USDC' }],
  })
  expect(model.callsLabel).toBe('12')
  expect(model.payersLabel).toBe('2')
  expect(model.useLine).toBe('12 calls in 30 days · 2 payers · last used 1 Sept 2026')
  expect(model.returnsLabel).toBe('Returns matching documents')
  expect(model.payments).toEqual([{ network: 'Base', amount: '0.02 USDC' }])
  expect(toDirectoryToolPageModel({
    ...entry,
    prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '0.002000 USDC', decimalAmount: '0.002000', symbol: 'USDC' }],
  }).priceLabel).toBe('0.002 USDC')
  expect(toDirectoryToolPageModel({
    ...entry,
    prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '5680.941049 USDC', decimalAmount: '5680.941049', symbol: 'USDC' }],
  }).payments[0]?.amount).toBe('5,680.94 USDC')
  expect(model.methodLabel).toBe('HTTP POST')
  expect(model.providerLine).toBe('StableEnrich')
  expect(model.providerHost).toBe('example.com')
  expect(model.serviceName).toBeUndefined()
  const described = toDirectoryToolPageModel({
    ...entry,
    serviceName: 'BlockRun',
    provider: 'blockrun.ai',
    category: 'inference',
    input: {
      fields: [
        { name: 'model', path: 'body.model', location: 'body', source: 'schema', required: true, description: 'AI model ID' },
        { name: 'temperature', path: 'body.temperature', location: 'body', source: 'schema', description: 'Sampling temperature' },
      ],
    },
  })
  expect(described.providerLine).toBe('BlockRun')
  expect(described.serviceName).toBeUndefined()
  expect(described.providerHost).toBe('blockrun.ai')
  expect(described.category).toBe('inference')
  expect(described.asks).toEqual([
    { label: 'Model', detail: 'AI model ID' },
    { label: 'Temperature', detail: 'Sampling temperature' },
  ])
})

it('groups a Provider into a listed price range and its endpoints', () => {
  const search = {
    ...entry,
    resource: 'https://api.exa.ai/search',
    slug: 'search',
    title: 'Search',
    provider: 'api.exa.ai',
    serviceName: 'Exa',
    category: 'search',
    activity: { calls30d: 5900, payers30d: 87 },
    prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '0.001 USDC', decimalAmount: '0.001', symbol: 'USDC' }],
  }
  const contents = {
    ...search,
    resource: 'https://api.exa.ai/contents',
    slug: 'contents',
    title: 'Contents',
    activity: { calls30d: 160, payers30d: 27 },
    prices: [{ network: 'solana', networkLabel: 'Solana', scheme: 'exact', amount: '0.007 USDC', decimalAmount: '0.007', symbol: 'USDC' }],
  }
  const surface = toDirectoryServiceSurface(search, [search, contents], false)
  expect(surface.title).toBe('Exa')
  expect(surface.networks).toBe('Base, Solana')
  expect(surface.priceRange).toBe('0.001 USDC – 0.007 USDC')
  expect(surface.endpointCount).toBe('2 endpoints')
  expect(surface.endpoints.map(endpoint => endpoint.path)).toEqual(['/search', '/contents'])
  expect(surface.endpoints[0]?.current).toBe(true)
  expect(surface.endpoints[0]?.activity).toBe('5,900 calls · 87 payers · last 30 days')
  expect(toDirectoryServiceSurface(search, [], true).endpointCount).toBe('1+ endpoints')
})

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
  expect(model.callsLabel).toBe('12')
  expect(toDirectoryToolCardModel({ ...entry, activity: { calls30d: 168128, payers30d: 2 } })).toMatchObject({ callsLabel: '168,128', payersLabel: '2' })
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

it('reads a Provider from its busiest Tool and leaves a quiet host blank', () => {
  expect(toDirectoryProviderRow({
    key: 'blockrun.ai', label: 'blockrun.ai', count: 48,
    leadCalls: 334244, leadPayers: 183, leadPrice: '0.002', leadTitle: 'AI chat completions', leadSlug: 'api-v1-chat-completions',
  })).toMatchObject({
    callsLabel: '334,244', payersLabel: '183', priceLabel: '0.002 USDC', toolLabel: '48',
    leadTitle: 'AI chat completions', leadSlug: 'api-v1-chat-completions',
  })
  const quiet = toDirectoryProviderRow({ key: 'quiet.example', label: 'quiet.example', count: 1, leadCalls: -1, leadTitle: 'Ghost' })
  expect(quiet.callsLabel).toBe('—')
  expect(quiet.priceLabel).toBe('—')
  expect(quiet.leadTitle).toBeUndefined()
})

function hostTool(provider: string, n: number): X402DirectoryEntry {
  return { ...entry, resource: `https://${provider}/${n}`, provider, title: `${provider} ${n}` }
}

it('fills one provider page and keeps the next host for the following page', () => {
  const tools = [
    hostTool('a.example', 1),
    hostTool('a.example', 2),
    ...Array.from({ length: 11 }, (_, index) => hostTool(`h${index}.example`, index)),
    hostTool('a.example', 3),
    hostTool('next.example', 1),
  ]
  const page = absorbProviderEntries(tools, [], new Set())
  expect(page.groups).toHaveLength(12)
  expect(page.groups[0]?.tools.map(tool => tool.title)).toEqual(['a.example 1', 'a.example 2', 'a.example 3'])
  expect(page.rest.map(tool => tool.provider)).toEqual(['next.example'])
})

it('skips a host already shown and continues a page that is still short', () => {
  const carried = absorbProviderEntries([hostTool('a.example', 1)], [], new Set(), 2)
  const page = absorbProviderEntries([
    hostTool('a.example', 2),
    hostTool('seen.example', 1),
    hostTool('b.example', 1),
    hostTool('c.example', 1),
  ], carried.groups, new Set(['seen.example']), 2)
  expect(page.groups.map(group => group.provider)).toEqual(['a.example', 'b.example'])
  expect(page.groups[0]?.tools).toHaveLength(2)
  expect(page.rest.map(tool => tool.provider)).toEqual(['c.example'])
})

it('keeps host order from the sorted Tool list', () => {
  const groups = groupDirectoryProviders([
    { ...entry, resource: 'https://busy.example/a', provider: 'busy.example', title: 'First' },
    { ...entry, resource: 'https://quiet.example/a', provider: 'quiet.example', title: 'Other' },
    { ...entry, resource: 'https://busy.example/b', provider: 'busy.example', title: 'Second' },
  ])
  expect(groups.map(group => group.provider)).toEqual(['busy.example', 'quiet.example'])
  expect(groups[0]?.tools.map(tool => tool.title)).toEqual(['First', 'Second'])
})

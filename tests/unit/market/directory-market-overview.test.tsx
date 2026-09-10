/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryMarketOverview } from '@/components/ae/market/DirectoryMarketOverview'
import type { X402DirectoryAnalytics } from '@/modules/market/x402-directory-catalogue'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const curated: X402DirectoryEntry = { resource: 'https://api.example.com/search', title: 'Search the web', provider: 'api.example.com', description: 'Retrieve a ranked list of web pages.', category: 'Search', protocol: 'http', metadataJson: '{}', prices: [{ amount: '0.02 USDC', decimalAmount: '0.02', symbol: 'USDC', network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact' }], activity: { payers30d: 40, calls30d: 250_000 } }
const widelyUsed: X402DirectoryEntry[] = Array.from({ length: 10 }, (_, index) => ({ ...curated, resource: `https://example.com/tool/${index}`, title: `Adopted Tool ${index}`, activity: { payers30d: 1_000 - index } }))
const analytics: Extract<X402DirectoryAnalytics, { kind: 'ok' }> = {
  kind: 'ok', scope: 'whole_generation', totalTools: 1000,
  coverage: { source: 'coinbase', generation: 'whole-catalogue', indexedTotal: 1000, reportedTotal: 1000, reportedTotalAtStart: 1000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 10, startedAt: Date.parse('2026-09-01T00:00:00Z'), completedAt: Date.parse('2026-09-02T00:00:00Z'), completeness: 'completed_observed_scan' },
  adoption: [
    { key: 'missing', label: 'Not reported', count: 600 }, { key: '0', label: 'Zero payers', count: 200 },
    { key: '1', label: 'One payer', count: 100 }, { key: '2_4', label: '2–4 payers', count: 89 },
    { key: '5_9', label: '5–9 payers', count: 7 }, { key: '10_49', label: '10–49 payers', count: 3 }, { key: '50_plus', label: '50+ payers', count: 1 },
  ],
  metadata: [{ key: 'hasInputFields', label: 'Request fields', count: 300 }, { key: 'hasInputSchema', label: 'Request schema', count: 700 }, { key: 'hasOutputFields', label: 'Output fields', count: 100 }, { key: 'hasOutputSchema', label: 'Output schema', count: 90 }, { key: 'hasOutputExample', label: 'Output example', count: 250 }, { key: 'curated', label: 'Curated', count: 42 }],
  categories: [{ key: 'search', label: 'Search', count: 55 }, { key: 'unclassified', label: 'Unclassified', count: 945 }],
  networks: [{ key: 'eip155:8453', label: 'Base', count: 25 }, { key: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', label: 'Solana', count: 980 }],
  curated: [{ entry: curated, category: 'search', categorySource: 'provider_declared', observedAt: 1, sourceDigest: 'source-digest' }],
  price: { scope: 'network', network: 'eip155:8453', totalTools: 25, knownPriceTools: 20, unknownPriceTools: 5, basis: 'minimum_exact_usdc_per_tool', bands: [{ key: '0_01_to_0_03', label: '0.01–<0.03 USDC', count: 20 }, { key: 'unknown', label: 'Unknown price', count: 5 }], quantiles: { minimum: '0.01', p25: '0.01', median: '0.02', p75: '0.02', maximum: '0.025' } },
  depth: [], recency: [], momentum: [],
  concentration: { basis: 'declared_calls30d', categoryCount: 0, categories: [] },
  rising: [], falling: [],
}
afterEach(cleanup)
function show(value: X402DirectoryAnalytics | undefined = analytics) {
  const explore = vi.fn(), priceNetwork = vi.fn(), select = vi.fn(), save = vi.fn(), compare = vi.fn()
  const props = { widelyUsed, onExplore: explore, onPriceNetworkChange: priceNetwork, onSelect: select, onSave: save, isSaved: (resource: string) => resource === curated.resource, onCompare: compare, isCompared: (resource: string) => resource === curated.resource, compareDisabled: false }
  const rendered = render(<DirectoryMarketOverview {...props} {...(value === undefined ? {} : { analytics: value })} />)
  return { ...rendered, explore, priceNetwork, select, save, compare, props }
}

it('uses complete-generation KPIs and metadata counts while isolating the network price denominator', () => {
  const { explore } = show()
  expect(screen.getByRole('button', { name: 'Capabilities to explore: 1,000. Explore Tools' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Curated by Coinbase: 42. Explore Tools' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Median listed price: 0.02 USDC. Explore Tools' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Tools with 5+ payers: 11. Explore Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ minPayers30d: 5, sort: 'adoption' })
  expect(screen.getByText('20 Tools with comparable exact USDC prices on Base. Each Tool is counted once at its lowest listed price; 5 have no comparable price.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Capability coverage and published details' }))
  expect(screen.getByText('300 / 1,000')).toBeTruthy()
  expect(screen.getByText('400 / 1,000')).toBeTruthy()
  expect(screen.queryByText('Comparable price')).toBeNull()
  expect(screen.queryByText('20 / 1,000')).toBeNull()
})

it('includes comparable-price coverage only when it uses the same complete-generation denominator', () => {
  const { network: _network, ...price } = analytics.price
  show({ ...analytics, price: { ...price, scope: 'whole_generation', totalTools: 1000, knownPriceTools: 990, unknownPriceTools: 10 } })
  fireEvent.click(screen.getByRole('button', { name: 'Capability coverage and published details' }))
  expect(screen.getByText('Comparable price')).toBeTruthy()
  expect(screen.getByText('990 / 1,000')).toBeTruthy()
  expect(screen.getByText(/990 Tools with comparable exact USDC prices, across networks/u)).toBeTruthy()
})

it('drills from real numerical chart controls into exact price, missing-adoption and category filters', () => {
  const { explore } = show()
  for (const summary of screen.getAllByText('View counts and filter Tools')) fireEvent.click(summary)
  fireEvent.click(screen.getByRole('button', { name: 'Filter 0.01–<0.03 USDC: 20 Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ priceBand: '0_01_to_0_03', network: 'eip155:8453', sort: 'price_asc' })
  fireEvent.click(screen.getByRole('button', { name: 'Filter Unknown price: 5 Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ priceBand: 'unknown', network: 'eip155:8453', sort: 'price_asc' })
  fireEvent.click(screen.getByRole('button', { name: 'Filter Not reported: 600 Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ adoptionBand: 'missing', sort: 'adoption' })
  fireEvent.click(screen.getByRole('button', { name: 'Filter Zero payers: 200 Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ adoptionBand: '0', sort: 'adoption' })
  fireEvent.click(screen.getByRole('button', { name: 'Capability coverage and published details' }))
  const categoryTable = screen.getByText('Largest categories').closest('[data-slot="card"]')!
  fireEvent.click(within(categoryTable as HTMLElement).getByText('View counts and filter Tools'))
  fireEvent.click(screen.getByRole('button', { name: 'Filter Search: 55 Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ directoryCategory: 'search', sort: 'adoption' })
})

it('changes and clears the price-analysis network through the real Select without filtering market-wide adoption', async () => {
  const { priceNetwork, explore } = show()
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Price analysis network' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'Solana' }))
  expect(priceNetwork).toHaveBeenLastCalledWith('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Price analysis network' }), { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: 'Prices: all networks' }))
  expect(priceNetwork).toHaveBeenLastCalledWith(undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Tools with 5+ payers: 11. Explore Tools' }))
  expect(explore).toHaveBeenLastCalledWith({ minPayers30d: 5, sort: 'adoption' })
})

it('keeps curated and adoption table actions attached to the exact original Tool and source search', () => {
  const { select, save, compare, explore } = show()
  const curatedTable = within(screen.getByRole('table', { name: 'Tool comparison table' }))
  fireEvent.click(curatedTable.getByRole('button', { name: 'View Tool: Search the web' }))
  fireEvent.click(curatedTable.getByRole('button', { name: 'Unsave Search the web' }))
  fireEvent.click(curatedTable.getByRole('button', { name: 'Remove Search the web from comparison' }))
  for (const callback of [select, save, compare]) {
    expect(callback.mock.calls[0]?.[0].entry).toBe(curated)
    expect(callback.mock.calls[0]?.[0].search).toEqual({})
  }
  fireEvent.click(screen.getByRole('button', { name: 'Explore this group' }))
  expect(explore).toHaveBeenLastCalledWith({ curatedOnly: true, sort: 'adoption' })
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Broader adoption' }))
  const adoptionTable = within(screen.getByRole('table', { name: 'Tool comparison table' }))
  expect(adoptionTable.getAllByRole('row')).toHaveLength(9)
  expect(adoptionTable.queryByRole('button', { name: 'View Tool: Adopted Tool 8' })).toBeNull()
  fireEvent.click(adoptionTable.getByRole('button', { name: 'View Tool: Adopted Tool 0' }))
  expect(select.mock.lastCall?.[0].entry).toBe(widelyUsed[0])
  expect(select.mock.lastCall?.[0].search).toEqual({ network: 'eip155:8453' })
  fireEvent.click(screen.getByRole('button', { name: 'Explore this group' }))
  expect(explore).toHaveBeenLastCalledWith({ sort: 'adoption', network: 'eip155:8453' })
})

it.each(['missing', 'unavailable'] as const)('keeps the Tool Explorer usable when analytics is %s', state => {
  const value: X402DirectoryAnalytics | undefined = state === 'missing' ? undefined : { kind: 'unavailable', reason: 'analytics_not_ready' }
  const explore = vi.fn()
  render(<DirectoryMarketOverview {...(value === undefined ? {} : { analytics: value })} widelyUsed={widelyUsed} onExplore={explore} onPriceNetworkChange={vi.fn()} onSelect={vi.fn()} onSave={vi.fn()} isSaved={() => false} onCompare={vi.fn()} isCompared={() => false} compareDisabled={false} />)
  expect(screen.getByText('The market snapshot is being prepared')).toBeTruthy()
  expect(screen.queryByText('Median listed price')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open the Tool Explorer' }))
  expect(explore).toHaveBeenCalledExactlyOnceWith({})
})

/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryExplorerFilters } from '@/components/ae/market/DirectoryExplorerFilters'
import type { DirectoryExplorerFilterValues } from '@/modules/market/directory-filters.contracts'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'

const overview: X402DirectoryCatalogueOverview = { kind: 'ok', coverage: { source: 'coinbase', generation: 'test', indexedTotal: 14000, reportedTotal: 14000, reportedTotalAtStart: 14000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 140, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }, categories: [{ key: 'search', label: 'Search', count: 500 }, { key: 'unclassified', label: 'Unclassified', count: 13000 }], networks: [{ key: 'eip155:8453', label: 'Base', count: 4000 }], providers: [{ key: 'api.example.com', label: 'api.example.com', count: 42 }], popular: [], recentlyUpdated: [] }
afterEach(cleanup)
function show(search: DirectoryExplorerFilterValues = {}) {
  const change = vi.fn(), reset = vi.fn()
  const rendered = render(<DirectoryExplorerFilters search={search} overview={overview} onChange={change} onReset={reset} />)
  const filterCount = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'].filter(key => {
    const value = search[key as keyof DirectoryExplorerFilterValues]
    return value !== undefined && value !== false
  }).length
  fireEvent.click(screen.getByRole('button', { name: filterCount > 0 ? `Filters ${filterCount}` : 'Filters' }))
  return { ...rendered, change, reset, filters: within(screen.getByRole('dialog', { name: 'Refine Tools' })) }
}
it('searches global category facets without altering counts or filtering the supplied page', () => {
  const { filters, change } = show()
  expect(filters.getByText('Counts cover the full indexed catalogue.')).toBeTruthy()
  expect(filters.getByText('13,000')).toBeTruthy()
  fireEvent.change(filters.getByRole('textbox', { name: 'Find provider category' }), { target: { value: 'search' } })
  expect(filters.queryByRole('button', { name: 'Unclassified 13,000' })).toBeNull()
  fireEvent.click(filters.getByRole('button', { name: 'Search 500' }))
  expect(change).toHaveBeenCalledWith({ directoryCategory: 'search' })
})
it('picks a Provider from the catalogue index instead of typing a hostname', () => {
  const { filters, change } = show()
  fireEvent.click(filters.getByRole('button', { name: 'api.example.com 42' }))
  expect(change).toHaveBeenCalledWith({ provider: 'api.example.com' })
})
it('picks a listed-price band from the published index', () => {
  const { filters, change } = show()
  fireEvent.click(filters.getByRole('button', { name: '0.01–<0.03 USDC' }))
  expect(change).toHaveBeenCalledWith({ priceBand: '0_01_to_0_03', minUsdPrice: undefined, maxUsdPrice: undefined })
})
it('keeps typed price bounds in Advanced and rejects inverted bounds', () => {
  const { filters, change } = show()
  fireEvent.click(filters.getByRole('button', { name: 'Advanced filters' }))
  fireEvent.change(filters.getByLabelText('Min USDC'), { target: { value: '0.1' } })
  fireEvent.change(filters.getByLabelText('Max USDC'), { target: { value: '0.01' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply price range' }))
  expect(change).not.toHaveBeenCalled()
  expect(filters.getByRole('alert').textContent).toContain('minimum no greater')
  fireEvent.change(filters.getByLabelText('Max USDC'), { target: { value: '1' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply price range' }))
  expect(change).toHaveBeenCalledWith({ minUsdPrice: 0.1, maxUsdPrice: 1, priceBand: undefined })
})
it('keeps typed Provider hostnames in Advanced and permits explicitly clearing a constraint', () => {
  const { filters, change } = show({ provider: 'api.example.com', directoryCategory: 'search' })
  fireEvent.click(filters.getByRole('button', { name: 'Advanced filters' }))
  fireEvent.change(filters.getByLabelText('Provider'), { target: { value: 'https://invalid.example.com/path' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply Provider' }))
  expect(change).not.toHaveBeenCalled()
  fireEvent.change(filters.getByLabelText('Provider'), { target: { value: 'API.EXAMPLE.COM' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply Provider' }))
  expect(change).toHaveBeenLastCalledWith({ provider: 'api.example.com' })
  fireEvent.click(filters.getByRole('button', { name: 'Search 500' }))
  expect(change).toHaveBeenLastCalledWith({ directoryCategory: undefined })
})
it('sends metadata, curation and payer filters with source meaning intact', () => {
  const { filters, change, reset } = show()
  fireEvent.click(filters.getByRole('button', { name: 'Advanced filters' }))
  fireEvent.click(filters.getByRole('checkbox', { name: 'Request fields' }))
  expect(change).toHaveBeenLastCalledWith({ hasInputFields: true })
  fireEvent.click(filters.getByRole('checkbox', { name: 'Output example' }))
  expect(change).toHaveBeenLastCalledWith({ hasOutputExample: true })
  fireEvent.click(filters.getByRole('checkbox', { name: 'Bazaar curated' }))
  expect(change).toHaveBeenLastCalledWith({ curatedOnly: true })
  fireEvent.click(filters.getByRole('button', { name: '100+ paying addresses' }))
  expect(change).toHaveBeenLastCalledWith({ minPayers30d: 100, maxPayers30d: undefined, adoptionBand: undefined })
  expect(filters.getByText('Distinct paying addresses per Tool, not people or Customers.')).toBeTruthy()
  fireEvent.click(filters.getByRole('button', { name: 'Clear filters' }))
  expect(reset).toHaveBeenCalledOnce()
})
it('closes the filter Sheet after Show results', async () => {
  const { change, filters } = show({ network: 'eip155:8453' })
  fireEvent.click(filters.getByRole('button', { name: 'All networks' }))
  expect(change).toHaveBeenCalledWith({ network: undefined })
  fireEvent.click(filters.getByRole('button', { name: 'Show results' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('makes chart bands visible and replaces them when a price range or payer threshold is chosen', () => {
  const { filters, change } = show({ priceBand: '0_01_to_0_03', adoptionBand: '2_4', maxPayers30d: 4 })
  expect(filters.getByRole('button', { name: '0.01–<0.03 USDC' }).getAttribute('aria-pressed')).toBe('true')
  expect(filters.getByRole('button', { name: 'Remove payer band: 2–4 paying addresses' })).toBeTruthy()
  expect(filters.getByRole('button', { name: 'Any payer count' }).getAttribute('aria-pressed')).toBe('false')
  fireEvent.change(filters.getByLabelText('Max USDC'), { target: { value: '0.1' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply price range' }))
  expect(change).toHaveBeenLastCalledWith({ minUsdPrice: undefined, maxUsdPrice: 0.1, priceBand: undefined })
  fireEvent.click(filters.getByRole('button', { name: '100+ paying addresses' }))
  expect(change).toHaveBeenLastCalledWith({ minPayers30d: 100, maxPayers30d: undefined, adoptionBand: undefined })
})
it('retains selected tags outside the shown facet sample and enforces the five-tag limit', () => {
  const change = vi.fn()
  render(<DirectoryExplorerFilters search={{ tags: ['one', 'two', 'three', 'four', 'five'] }} overview={{ ...overview, kind: 'ok', tags: [{ key: 'six', label: 'Six', count: 17 }], bundleSlugs: [{ key: 'developer-kit', label: 'Developer kit', count: 3 }] }} onChange={change} onReset={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filters 1' }))
  const filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  expect((filters.getByRole('checkbox', { name: 'Six 17' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(filters.getByRole('button', { name: 'Remove tags: three' }))
  expect(change).toHaveBeenLastCalledWith({ tags: ['one', 'two', 'four', 'five'] })
  fireEvent.click(filters.getByRole('checkbox', { name: 'Developer kit 3' }))
  expect(change).toHaveBeenLastCalledWith({ bundleSlugs: ['developer-kit'] })
})

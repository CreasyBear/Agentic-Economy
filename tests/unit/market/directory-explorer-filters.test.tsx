/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryDiscoveryFilters } from '@/components/ae/market/DirectoryExplorerFilters'
import type { DirectoryExplorerFilterValues } from '@/modules/market/directory-filters.contracts'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'

const overview: X402DirectoryCatalogueOverview = { kind: 'ok', coverage: { source: 'coinbase', generation: 'test', indexedTotal: 14000, reportedTotal: 14000, reportedTotalAtStart: 14000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 140, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }, categories: [{ key: 'search', label: 'Search', count: 500 }, { key: 'unclassified', label: 'Unclassified', count: 13000 }], networks: [{ key: 'eip155:8453', label: 'Base', count: 4000 }], providers: [{ key: 'api.example.com', label: 'api.example.com', count: 42 }], popular: [], recentlyUpdated: [] }
const hostLookup = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market/x402-directory-index.functions', () => ({ readX402DirectoryProvidersServer: hostLookup }))
beforeEach(() => {
  hostLookup.mockReset()
  hostLookup.mockResolvedValue({ kind: 'ok', page: overview.providers, coverage: overview.coverage, continueCursor: '', isDone: true })
})

const filterKeys = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'reviewedProvidersOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const
afterEach(cleanup)

function isActive(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false
}

function show(search: DirectoryExplorerFilterValues = {}, catalogue: X402DirectoryCatalogueOverview = overview) {
  const change = vi.fn(), reset = vi.fn()
  const rendered = render(<DirectoryDiscoveryFilters search={search} overview={catalogue} onChange={change} onReset={reset} />)
  const filterCount = filterKeys.filter(key => isActive(search[key as keyof DirectoryExplorerFilterValues])).length
  fireEvent.click(screen.getByRole('button', { name: filterCount > 0 ? `Filters, ${filterCount} applied` : 'Filters' }))
  return { ...rendered, change, reset, filters: within(screen.getByRole('dialog', { name: 'Filter tools' })) }
}

it('picks a provider from the whole catalogue index instead of typing a hostname', async () => {
  const { filters, change } = show()
  const providers = filters.getByRole('combobox', { name: 'Provider' }) as HTMLInputElement
  expect(providers.placeholder).toBe('Search providers')
  expect(filters.getByText('Type the start of a provider’s web address.')).toBeTruthy()
  act(() => providers.focus())
  fireEvent.input(providers, { target: { value: 'api' } })
  await waitFor(() => expect(hostLookup).toHaveBeenLastCalledWith({ data: { providerPrefix: 'api' } }))
  fireEvent.click(await filters.findByRole('option', { name: 'api.example.com' }))
  expect(change).toHaveBeenCalledWith({ provider: 'api.example.com' })
})

it('selects a price cap per call and clears it, replacing any band or minimum', () => {
  const { filters, change } = show({ maxUsdPrice: 0.1 })
  const caps = within(filters.getByRole('group', { name: 'Price per call' }))
  expect(caps.getByRole('button', { name: 'Up to US$0.10' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(caps.getByRole('button', { name: 'Up to US$1' }))
  expect(change).toHaveBeenLastCalledWith({ maxUsdPrice: 1, minUsdPrice: undefined, priceBand: undefined })
  fireEvent.click(caps.getByRole('button', { name: 'Up to US$0.10' }))
  expect(change).toHaveBeenLastCalledWith({ maxUsdPrice: undefined, minUsdPrice: undefined, priceBand: undefined })
})

it('shows no price cap as selected when a band or minimum price is applied', () => {
  const { filters } = show({ maxUsdPrice: 0.1, priceBand: '0_03_to_0_10' })
  const caps = within(filters.getByRole('group', { name: 'Price per call' }))
  expect(caps.getByRole('button', { name: 'Up to US$0.10' }).getAttribute('aria-pressed')).toBe('false')
})

it('clears filters through the footer and closes with Done', async () => {
  const { filters, reset } = show({ maxUsdPrice: 1 })
  fireEvent.click(filters.getByRole('button', { name: 'Clear filters' }))
  expect(reset).toHaveBeenCalledOnce()
  fireEvent.click(filters.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('keeps the applied toolbar mounted when there are no active facets and ignores empty arrays in its count', () => {
  const unavailable: X402DirectoryCatalogueOverview = { kind: 'unavailable', reason: 'unavailable' }
  render(<DirectoryDiscoveryFilters search={{ tags: [], bundleSlugs: [] }} overview={unavailable} onChange={vi.fn()} onReset={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
})

it('retains an unlisted selected provider when the catalogue sample is unavailable', () => {
  const unavailable: X402DirectoryCatalogueOverview = { kind: 'unavailable', reason: 'unavailable' }
  const { filters, change } = show({ provider: 'outside.example' }, unavailable)
  const providers = filters.getByRole('combobox', { name: 'Provider' }) as HTMLInputElement
  expect(providers.value).toBe('outside.example')
  fireEvent.click(within(providers.parentElement?.parentElement as HTMLElement).getByRole('button', { name: 'Clear selection' }))
  expect(change).toHaveBeenCalledWith({ provider: undefined })
})

it('removes only the selected key and clears all eighteen facet keys without touching query or sort', async () => {
  const search = { query: 'weather', sort: 'popular' as const, directoryCategory: 'search', tags: ['one'] }
  const { change, filters } = show(search)
  fireEvent.click(filters.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Remove Category: Search' }))
  expect(change).toHaveBeenLastCalledWith({ directoryCategory: undefined })
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(change).toHaveBeenLastCalledWith(Object.fromEntries(filterKeys.map(key => [key, undefined])))
})

it('summarizes labels from the catalogue and preserves exact filter-bound meanings', () => {
  const catalogue = { ...overview, tags: [{ key: 'one', label: 'First tag', count: 120 }], bundleSlugs: [{ key: 'developer-kit', label: 'Developer kit', count: 99 }] }
  render(<DirectoryDiscoveryFilters search={{ directoryCategory: 'search', provider: 'api.example.com', network: 'eip155:8453', minUsdPrice: 0.000001, maxPayers30d: 0, tags: ['one', 'missing'], bundleSlugs: ['developer-kit'] }} overview={catalogue} onChange={vi.fn()} onReset={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Remove Category: Search' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Provider: api.example.com' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Network: Base' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Price from: US$0.000001' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Paying wallets: Up to 0' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Tags: First tag, missing' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Collections: Developer kit' })).toBeTruthy()
})

it('keeps the phone sheet grabber name fixed and carries its size only in aria-expanded', () => {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({ matches: query === '(max-width: 720px)', media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }))
  render(<DirectoryDiscoveryFilters search={{}} overview={overview} onChange={vi.fn()} onReset={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  const grabber = screen.getByRole('button', { name: 'Sheet size' })
  const before = grabber.getAttribute('aria-expanded')
  fireEvent.click(grabber)
  expect(screen.getByRole('button', { name: 'Sheet size' }).getAttribute('aria-expanded')).not.toBe(before)
})

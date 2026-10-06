/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryDiscoveryFilters } from '@/components/ae/market/DirectoryExplorerFilters'
import type { DirectoryExplorerFilterValues } from '@/modules/market/directory-filters.contracts'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'

const overview: X402DirectoryCatalogueOverview = { kind: 'ok', coverage: { source: 'coinbase', generation: 'test', indexedTotal: 14000, reportedTotal: 14000, reportedTotalAtStart: 14000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 140, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }, categories: [{ key: 'search', label: 'Search', count: 500 }, { key: 'unclassified', label: 'Unclassified', count: 13000 }], networks: [{ key: 'eip155:8453', label: 'Base', count: 4000 }], providers: [{ key: 'api.example.com', label: 'api.example.com', count: 42 }], popular: [], recentlyUpdated: [] }
const filterKeys = ['directoryCategory', 'network', 'provider', 'minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'priceBand', 'adoptionBand', 'curatedOnly', 'reviewedProvidersOnly', 'hasInputFields', 'hasOutputExample', 'hasInputSchema', 'hasOutputFields', 'hasOutputSchema', 'tags', 'bundleSlugs'] as const
afterEach(cleanup)

function isActive(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== false
}

function show(search: DirectoryExplorerFilterValues = {}, catalogue: X402DirectoryCatalogueOverview = overview, entity: 'tools' | 'providers' = 'tools') {
  const change = vi.fn(), reset = vi.fn()
  const rendered = render(<DirectoryDiscoveryFilters search={search} overview={catalogue} onChange={change} onReset={reset} entity={entity} />)
  const filterCount = filterKeys.filter(key => isActive(search[key as keyof DirectoryExplorerFilterValues])).length
  fireEvent.click(screen.getByRole('button', { name: filterCount > 0 ? `Filters ${filterCount}` : 'Filters' }))
  return { ...rendered, change, reset, filters: within(screen.getByRole('dialog', { name: entity === 'providers' ? 'Refine Providers' : 'Refine Tools' })) }
}

function openAdvanced(filters: ReturnType<typeof show>['filters']) {
  const trigger = filters.queryByRole('button', { name: /^Advanced filters/ })
  if (trigger?.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger ?? filters.getByRole('button', { name: 'Advanced filters' }))
}

it('searches category options from the catalogue without changing counts or filtering the supplied page', () => {
  const { filters, change } = show()
  expect(screen.getByText('Category names and counts come from a bounded catalogue sample, not current search matches.')).toBeTruthy()
  const category = filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement
  expect(category.placeholder).toBe('All categories')
  fireEvent.change(category, { target: { value: 'search' } })
  expect(filters.queryByRole('option', { name: 'Unclassified 13,000' })).toBeNull()
  fireEvent.click(filters.getByRole('option', { name: 'Search 500' }))
  expect(change).toHaveBeenCalledWith({ directoryCategory: 'search' })
})

it('keeps the committed category label through Clear filters and Drawer close/reopen', () => {
  const change = vi.fn(), reset = vi.fn()
  const renderFilters = (search: DirectoryExplorerFilterValues) => <DirectoryDiscoveryFilters search={search} overview={overview} onChange={change} onReset={reset} />
  const { rerender } = render(renderFilters({}))
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  let filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  const category = filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement
  fireEvent.change(category, { target: { value: 'search' } })
  fireEvent.click(filters.getByRole('option', { name: 'Search 500' }))
  expect(change).toHaveBeenLastCalledWith({ directoryCategory: 'search' })
  rerender(renderFilters({ directoryCategory: 'search' }))
  filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  const selectedCategory = filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement
  expect(selectedCategory.placeholder).toBe('Search 500')
  fireEvent.click(filters.getByRole('button', { name: 'Clear filters' }))
  expect(reset).toHaveBeenCalledOnce()
  const resetCategory = filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement
  expect(resetCategory.value).toBe('Search 500')
  fireEvent.change(resetCategory, { target: { value: 'unclassified' } })
  fireEvent.click(filters.getByRole('button', { name: 'Show results' }))
  fireEvent.click(screen.getByRole('button', { name: 'Filters 1' }))
  filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  expect((filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement).value).toBe('Search 500')
})

it('keeps an over-limit Market query editable and submits only a corrected search', () => {
  const { filters, change } = show()
  const input = filters.getByRole('searchbox', { name: 'Search Tools' }) as HTMLInputElement
  const tooLong = 'x'.repeat(201)
  fireEvent.change(input, { target: { value: tooLong } })
  fireEvent.click(filters.getByRole('button', { name: 'Search Tools' }))
  expect(input.value).toBe(tooLong)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(filters.getByRole('alert').textContent).toContain('200')
  expect(document.activeElement).toBe(input)
  expect(change).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: ' weather ' } })
  fireEvent.click(filters.getByRole('button', { name: 'Search Tools' }))
  expect(change).toHaveBeenCalledWith({ query: 'weather', sort: 'relevance' })
})

it('chooses a category by keyboard, then Escape closes the Combo before the Drawer', () => {
  const change = vi.fn(), reset = vi.fn()
  const renderFilters = (search: DirectoryExplorerFilterValues) => <DirectoryDiscoveryFilters search={search} overview={overview} onChange={change} onReset={reset} />
  const { rerender } = render(renderFilters({}))
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  let filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  const category = filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement
  act(() => category.focus())
  fireEvent.keyDown(category, { key: 'ArrowDown' })
  fireEvent.keyDown(category, { key: 'Enter' })
  expect(change).toHaveBeenCalledWith({ directoryCategory: 'search' })
  rerender(renderFilters({ directoryCategory: 'search' }))
  filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  const selectedCategory = filters.getByRole('combobox', { name: 'Provider category' }) as HTMLInputElement
  expect(selectedCategory.placeholder).toBe('Search 500')
  fireEvent.keyDown(selectedCategory, { key: 'ArrowDown' })
  expect(selectedCategory.getAttribute('aria-expanded')).toBe('true')
  fireEvent.keyDown(selectedCategory, { key: 'Escape' })
  expect(selectedCategory.getAttribute('aria-expanded')).toBe('false')
  expect(selectedCategory.value).toBe('Search 500')
  expect(document.activeElement).toBe(selectedCategory)
  expect(screen.getByRole('dialog', { name: 'Refine Tools' })).toBeTruthy()
  expect(change).toHaveBeenCalledOnce()
  fireEvent.keyDown(selectedCategory, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  const visibleCategories = within(screen.getByRole('group', { name: 'Browse by Provider category' }))
  expect(visibleCategories.getByRole('button', { name: 'Search 500' }).getAttribute('aria-pressed')).toBe('true')
})

it('picks a Provider from the catalogue index instead of typing a hostname', () => {
  const { filters, change } = show()
  const providers = filters.getByRole('combobox', { name: 'Providers' }) as HTMLInputElement
  expect(providers.placeholder).toBe('All providers')
  expect(filters.getByText('Provider names and counts come from a bounded catalogue sample.')).toBeTruthy()
  expect(filters.getByText('Select a Provider from the bounded catalogue sample.')).toBeTruthy()
  fireEvent.change(providers, { target: { value: 'api' } })
  fireEvent.click(filters.getByRole('option', { name: 'api.example.com 42' }))
  expect(change).toHaveBeenCalledWith({ provider: 'api.example.com' })
})

it('offers the reviewed shortlist separately from source curation and permits returning to all providers', () => {
  const { filters, change } = show({ reviewedProvidersOnly: true })
  const review = within(filters.getByRole('group', { name: 'Provider review' }))
  expect(review.getByRole('button', { name: 'Reviewed providers' }).getAttribute('aria-pressed')).toBe('true')
  expect(filters.getByText(/initial shortlist reviewed against public operator and service evidence/)).toBeTruthy()
  fireEvent.click(review.getByRole('button', { name: 'Reviewed providers' }))
  expect(change).toHaveBeenLastCalledWith({ reviewedProvidersOnly: undefined })
})

it('selects a listed-price band and clears it after the controlled selection updates', () => {
  const change = vi.fn(), reset = vi.fn()
  const renderFilters = (search: DirectoryExplorerFilterValues) => <DirectoryDiscoveryFilters search={search} overview={overview} onChange={change} onReset={reset} />
  const { rerender } = render(renderFilters({}))
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  let filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  let prices = within(filters.getByRole('group', { name: 'Provider-listed price · USDC' }))
  const band = prices.getByRole('button', { name: /0\.01.*0\.03/ })
  fireEvent.click(band)
  expect(change).toHaveBeenLastCalledWith({ priceBand: '0_01_to_0_03', minUsdPrice: undefined, maxUsdPrice: undefined })
  expect(band.getAttribute('aria-pressed')).toBe('false')
  rerender(renderFilters({ priceBand: '0_01_to_0_03' }))
  filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  prices = within(filters.getByRole('group', { name: 'Provider-listed price · USDC' }))
  const selectedBand = prices.getByRole('button', { name: /0\.01.*0\.03/ })
  expect(selectedBand.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(selectedBand)
  expect(change).toHaveBeenLastCalledWith({ priceBand: undefined, minUsdPrice: undefined, maxUsdPrice: undefined })
})

it('keeps typed price bounds in Advanced, rejects inverted bounds and focuses the refused input', () => {
  const { filters, change } = show()
  openAdvanced(filters)
  const minimum = filters.getByLabelText('Min USDC') as HTMLInputElement
  const maximum = filters.getByLabelText('Max USDC') as HTMLInputElement
  fireEvent.change(minimum, { target: { value: '0.1' } })
  fireEvent.change(maximum, { target: { value: '0.01' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply price range' }))
  expect(change).not.toHaveBeenCalled()
  expect(filters.getByRole('alert').textContent).toContain('minimum no greater')
  expect(document.activeElement).toBe(minimum)
  expect(maximum.getAttribute('aria-describedby')).toBe(minimum.getAttribute('aria-describedby'))
  fireEvent.change(maximum, { target: { value: '1' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply price range' }))
  expect(change).toHaveBeenCalledWith({ minUsdPrice: 0.1, maxUsdPrice: 1, priceBand: undefined })
})

it('keeps typed Provider hostnames in Advanced and uses the safe hostname parser', () => {
  const { filters, change } = show({ provider: 'api.example.com', directoryCategory: 'search' })
  openAdvanced(filters)
  const hostname = filters.getByLabelText('Provider') as HTMLInputElement
  fireEvent.change(hostname, { target: { value: 'https://invalid.example.com/path' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply Provider' }))
  expect(change).not.toHaveBeenCalled()
  expect(filters.getByRole('alert').textContent).toContain('hostname')
  expect(document.activeElement).toBe(hostname)
  fireEvent.change(hostname, { target: { value: 'API.EXAMPLE.COM' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply Provider' }))
  expect(change).toHaveBeenLastCalledWith({ provider: 'api.example.com' })
})

it('sends published metadata changes one flag at a time and preserves source curation wording', () => {
  const { filters, change } = show()
  openAdvanced(filters)
  const details = within(filters.getByRole('group', { name: 'Published details' }))
  fireEvent.click(details.getByRole('button', { name: 'Request fields' }))
  expect(change).toHaveBeenLastCalledWith({ hasInputFields: true })
  fireEvent.click(details.getByRole('button', { name: 'Output example' }))
  expect(change).toHaveBeenLastCalledWith({ hasOutputExample: true })
  fireEvent.click(details.getByRole('button', { name: 'Bazaar curated' }))
  expect(change).toHaveBeenLastCalledWith({ curatedOnly: true })
  expect(filters.getByText('Provider metadata and source curation.')).toBeTruthy()
})

it('clears payer ranges on a threshold choice and keeps address-not-people wording', () => {
  const { filters, change } = show({ adoptionBand: '2_4', maxPayers30d: 4 })
  const payer = within(filters.getByRole('group', { name: 'Payer breadth · 30 days' }))
  expect(filters.getByRole('button', { name: 'Remove payer band: 2–4 paying addresses' })).toBeTruthy()
  expect(filters.getByRole('button', { name: 'Remove maximum payer count: At most 4 paying addresses' })).toBeTruthy()
  fireEvent.click(payer.getByRole('button', { name: '100+ paying addresses' }))
  expect(change).toHaveBeenLastCalledWith({ minPayers30d: 100, maxPayers30d: undefined, adoptionBand: undefined })
  expect(filters.getByText('Distinct paying addresses per Tool, not people or Customers.')).toBeTruthy()
})

it('returns focus to payer choices after removing the last payer filter', () => {
  const { filters, rerender, change, reset } = show({ adoptionBand: '2_4' })
  openAdvanced(filters)
  const remove = filters.getByRole('button', { name: 'Remove payer band: 2–4 paying addresses' })
  remove.focus()
  fireEvent.click(remove)
  expect(change).toHaveBeenCalledWith({ adoptionBand: undefined })
  rerender(<DirectoryDiscoveryFilters search={{}} overview={overview} onChange={change} onReset={reset} />)
  expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Payer breadth choices' }))
})

it('keeps a custom payer minimum visible and clears it through the single-choice group', () => {
  const { filters, change } = show({ minPayers30d: 37 })
  const payer = within(filters.getByRole('group', { name: 'Payer breadth · 30 days' }))
  const custom = payer.getByRole('button', { name: '37+ paying addresses' })
  expect(custom.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(custom)
  expect(change).toHaveBeenCalledWith({ minPayers30d: undefined, maxPayers30d: undefined, adoptionBand: undefined })
})

it('clears a selected network through the Combobox clear action', () => {
  const { filters, change } = show({ network: 'eip155:8453' })
  openAdvanced(filters)
  const network = filters.getByRole('combobox', { name: 'Network' }) as HTMLInputElement
  expect(network.value).toBe('Base 4,000')
  fireEvent.click(within(network.parentElement?.parentElement as HTMLElement).getByRole('button', { name: 'Clear selection' }))
  expect(change).toHaveBeenLastCalledWith({ network: undefined })
})

it('closes the filter Drawer after Show results', () => {
  const { filters, change } = show({ network: 'eip155:8453' })
  openAdvanced(filters)
  const network = filters.getByRole('combobox', { name: 'Network' })
  fireEvent.click(within(network.parentElement?.parentElement as HTMLElement).getByRole('button', { name: 'Clear selection' }))
  expect(change).toHaveBeenCalledWith({ network: undefined })
  fireEvent.click(filters.getByRole('button', { name: 'Show results' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps chart bands and payer removals visible while replacing them with a custom range or threshold', () => {
  const { filters, change } = show({ priceBand: '0_01_to_0_03', adoptionBand: '2_4', maxPayers30d: 4 })
  const prices = within(filters.getByRole('group', { name: 'Provider-listed price · USDC' }))
  expect(prices.getByRole('button', { name: /0\.01.*0\.03/ }).getAttribute('aria-pressed')).toBe('true')
  expect(filters.getByRole('button', { name: 'Remove payer band: 2–4 paying addresses' })).toBeTruthy()
  expect(filters.getByRole('button', { name: 'Any payer count' }).getAttribute('aria-pressed')).toBe('false')
  const maximum = filters.getByLabelText('Max USDC')
  fireEvent.change(maximum, { target: { value: '0.1' } })
  fireEvent.click(filters.getByRole('button', { name: 'Apply price range' }))
  expect(change).toHaveBeenLastCalledWith({ minUsdPrice: undefined, maxUsdPrice: 0.1, priceBand: undefined })
  fireEvent.click(within(filters.getByRole('group', { name: 'Payer breadth · 30 days' })).getByRole('button', { name: '100+ paying addresses' }))
  expect(change).toHaveBeenLastCalledWith({ minPayers30d: 100, maxPayers30d: undefined, adoptionBand: undefined })
})

it('adds one tag or collection at a time and disables tag entry at the five-item limit', () => {
  const catalogue = { ...overview, tags: [{ key: 'six', label: 'Six', count: 17 }], bundleSlugs: [{ key: 'developer-kit', label: 'Developer kit', count: 3 }] }
  const { filters, change } = show({ tags: ['one', 'two', 'three', 'four', 'five'] }, catalogue)
  openAdvanced(filters)
  const tags = filters.getByRole('combobox', { name: 'Tags' }) as HTMLInputElement
  expect(tags.disabled).toBe(true)
  expect(tags.getAttribute('aria-describedby')).toBeTruthy()
  expect(filters.getByText(/select up to five tags.*remove a selected tag to add another/i)).toBeTruthy()
  fireEvent.click(filters.getByRole('button', { name: 'Remove Tag: three' }))
  expect(change).toHaveBeenLastCalledWith({ tags: ['one', 'two', 'four', 'five'] })
  const collections = filters.getByRole('combobox', { name: 'Collections' }) as HTMLInputElement
  fireEvent.change(collections, { target: { value: 'developer' } })
  fireEvent.click(filters.getByRole('option', { name: 'Developer kit 3' }))
  expect(change).toHaveBeenLastCalledWith({ bundleSlugs: ['developer-kit'] })
})

it('keeps selected multi-facet options disabled and lets an unlisted selection be removed', () => {
  const catalogue = { ...overview, tags: [{ key: 'listed', label: 'Listed tag', count: 17 }], bundleSlugs: [] }
  const { filters, change } = show({ tags: ['listed', 'missing-key'] }, catalogue)
  openAdvanced(filters)
  const tags = filters.getByRole('combobox', { name: 'Tags' })
  fireEvent.focus(tags)
  expect(filters.getByRole('option', { name: 'Listed tag 17' }).getAttribute('aria-disabled')).toBe('true')
  expect(filters.getByRole('button', { name: 'Remove Tag: missing-key' })).toBeTruthy()
  fireEvent.click(filters.getByRole('button', { name: 'Remove Tag: missing-key' }))
  expect(change).toHaveBeenCalledWith({ tags: ['listed'] })
})

it('preserves multi-facet insertion order and clears an array only when its last item is removed', () => {
  const catalogue = { ...overview, tags: [{ key: 'one', label: 'One', count: 1 }, { key: 'two', label: 'Two', count: 2 }, { key: 'three', label: 'Three', count: 3 }] }
  const change = vi.fn(), reset = vi.fn()
  const renderFilters = (tags: string[] | undefined) => <DirectoryDiscoveryFilters search={{ ...(tags === undefined ? {} : { tags }) }} overview={catalogue} onChange={change} onReset={reset} />
  const { rerender } = render(renderFilters(['one', 'two', 'three']))
  fireEvent.click(screen.getByRole('button', { name: 'Filters 1' }))
  let filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  openAdvanced(filters)
  fireEvent.click(filters.getByRole('button', { name: 'Remove Tag: Two' }))
  expect(change).toHaveBeenLastCalledWith({ tags: ['one', 'three'] })
  rerender(renderFilters(['one', 'three']))
  filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  fireEvent.click(filters.getByRole('button', { name: 'Remove Tag: One' }))
  expect(change).toHaveBeenLastCalledWith({ tags: ['three'] })
  rerender(renderFilters(['three']))
  filters = within(screen.getByRole('dialog', { name: 'Refine Tools' }))
  fireEvent.click(filters.getByRole('button', { name: 'Remove Tag: Three' }))
  expect(change).toHaveBeenLastCalledWith({ tags: undefined })
})

it('shows six category chips initially, keeps the selected category visible and preserves keyboard roving focus', () => {
  const categories = Array.from({ length: 10 }, (_, index) => ({ key: `category-${index}`, label: `Category ${index}`, count: index }))
  const catalogue = { ...overview, categories }
  const change = vi.fn()
  render(<DirectoryDiscoveryFilters search={{ directoryCategory: 'category-9' }} overview={catalogue} onChange={change} onReset={vi.fn()} />)
  const group = within(screen.getByRole('group', { name: 'Browse by Provider category' }))
  expect(group.getByRole('button', { name: 'Category 9 9' }).getAttribute('aria-pressed')).toBe('true')
  expect(group.queryByRole('button', { name: 'Category 8 8' })).toBeNull()
  const first = group.getByRole('button', { name: 'Category 0 0' })
  const second = group.getByRole('button', { name: 'Category 1 1' })
  first.focus()
  fireEvent.keyDown(first, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(second)
  expect(change).not.toHaveBeenCalled()
})

it('retains a selected category absent from the catalogue without inventing a count', () => {
  const { change, filters } = show({ directoryCategory: 'future-category' }, { ...overview, categories: [] })
  fireEvent.click(filters.getByRole('button', { name: 'Show results' }))
  const group = within(screen.getByRole('group', { name: 'Browse by Provider category' }))
  const option = group.getByRole('button', { name: 'future-category' })
  expect(option.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Remove Provider category: future-category' })).toBeTruthy()
  fireEvent.click(option)
  expect(change).toHaveBeenLastCalledWith({ directoryCategory: undefined })
})

it('omits the visible category entry when the sample is unavailable and no category is selected', () => {
  const unavailable: X402DirectoryCatalogueOverview = { kind: 'unavailable', reason: 'unavailable' }
  const { filters } = show({}, unavailable)
  expect(filters.getByText('Provider and network catalogue samples are unavailable.')).toBeTruthy()
  fireEvent.click(filters.getByRole('button', { name: 'Show results' }))
  expect(screen.queryByRole('group', { name: 'Browse by Provider category' })).toBeNull()
  expect(screen.getByRole('group', { name: 'Applied catalogue filters' })).toBeTruthy()
})

it('keeps the applied toolbar mounted when there are no active facets and ignores empty arrays in its count', () => {
  const unavailable: X402DirectoryCatalogueOverview = { kind: 'unavailable', reason: 'unavailable' }
  render(<DirectoryDiscoveryFilters search={{ tags: [], bundleSlugs: [] }} overview={unavailable} onChange={vi.fn()} onReset={vi.fn()} />)
  expect(screen.getByRole('group', { name: 'Applied catalogue filters' })).toBeTruthy()
  expect(screen.getByText('No filters applied')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Browse by Provider category' })).toBeNull()
})

it('retains unlisted selected Provider and network values when the catalogue sample is unavailable', () => {
  const unavailable: X402DirectoryCatalogueOverview = { kind: 'unavailable', reason: 'unavailable' }
  const { filters, change } = show({ provider: 'outside.example', network: 'solana:mainnet' }, unavailable)
  const providers = filters.getByRole('combobox', { name: 'Providers' }) as HTMLInputElement
  const network = filters.getByRole('combobox', { name: 'Network' }) as HTMLInputElement
  expect(providers.value).toBe('outside.example')
  expect(network.value).toBe('solana:mainnet')
  fireEvent.click(within(providers.parentElement?.parentElement as HTMLElement).getByRole('button', { name: 'Clear selection' }))
  expect(change).toHaveBeenCalledWith({ provider: undefined })
})

it('removes only the selected key and clears all eighteen facet keys without touching query or sort', () => {
  const search = { query: 'weather', sort: 'popular' as const, directoryCategory: 'search', tags: ['one'] }
  const { change, filters } = show(search)
  fireEvent.click(filters.getByRole('button', { name: 'Show results' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove Provider category: Search' }))
  expect(change).toHaveBeenLastCalledWith({ directoryCategory: undefined })
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(change).toHaveBeenLastCalledWith({
    directoryCategory: undefined,
    network: undefined,
    provider: undefined,
    minUsdPrice: undefined,
    maxUsdPrice: undefined,
    minPayers30d: undefined,
    maxPayers30d: undefined,
    priceBand: undefined,
    adoptionBand: undefined,
    curatedOnly: undefined,
    reviewedProvidersOnly: undefined,
    hasInputFields: undefined,
    hasOutputExample: undefined,
    hasInputSchema: undefined,
    hasOutputFields: undefined,
    hasOutputSchema: undefined,
    tags: undefined,
    bundleSlugs: undefined,
  })
})

it('uses Provider terminology for the provider Drawer without claiming imported host verification', () => {
  const { filters } = show({}, overview, 'providers')
  expect(filters.getByRole('heading', { name: 'Refine Providers' })).toBeTruthy()
  expect(filters.getByRole('searchbox', { name: 'Search Providers' })).toBeTruthy()
  expect(filters.getByRole('combobox', { name: 'Providers' })).toBeTruthy()
  expect(filters.getByText('Provider names and counts come from a bounded catalogue sample.')).toBeTruthy()
  expect(filters.getByText('Search indexed Provider names, descriptions, categories and hostnames.')).toBeTruthy()
})

it('summarizes labels from the catalogue and preserves exact filter-bound meanings', () => {
  const catalogue = { ...overview, tags: [{ key: 'one', label: 'First tag', count: 120 }], bundleSlugs: [{ key: 'developer-kit', label: 'Developer kit', count: 99 }] }
  render(<DirectoryDiscoveryFilters search={{ directoryCategory: 'search', provider: 'api.example.com', network: 'eip155:8453', minUsdPrice: 0.000001, maxPayers30d: 0, tags: ['one', 'missing'], bundleSlugs: ['developer-kit'] }} overview={catalogue} onChange={vi.fn()} onReset={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Remove Provider category: Search' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Providers: api.example.com' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Network: Base' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Minimum Provider-listed price: 0.000001 USDC' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Maximum paying addresses: At most 0' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Tags: First tag, missing' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Remove Collections: Developer kit' })).toBeTruthy()
})

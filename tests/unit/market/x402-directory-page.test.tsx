/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { DIRECTORY_SAVED_TOOLS_STORAGE_KEY } from '@/components/ae/market/DirectorySavedTools'
import { buildMarketReturnContext } from '@/components/ae/market/market-return-context'
import type { ComponentProps } from 'react'
import { x402PendingToolRef, type X402DirectoryEntry } from '@/modules/market/x402-directory'

const entries: X402DirectoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
  resource: `https://example.com/tool/${i}/:id`, title: `Tool ${i}`, description: `Description ${i}`,
  protocol: i === 19 ? 'mcp' : 'http', provider: 'example.com', prices: [], metadataJson: '{}',
}))
type Props = ComponentProps<typeof AeX402Directory>
function show(search: Props['search'] = { offset: 20 }, items = entries, extra: Partial<Omit<Props, 'search'>> = {}) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/market' }),
    createRoute({ getParentRoute: () => root, path: '/tools/$toolRef' }),
  ]), history: createMemoryHistory({ initialEntries: ['/market'] }) })
  const result = render(<RouterContextProvider router={router}><AeX402Directory
    page={{ kind: 'ok', items, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
    {...extra} search={search} /></RouterContextProvider>)
  return { ...result, router, updatePage(nextPage: Props['page']) {
    result.rerender(<RouterContextProvider router={router}><AeX402Directory
      {...extra} page={nextPage} search={search} /></RouterContextProvider>)
  }, updateSearch(nextSearch: Props['search']) {
    result.rerender(<RouterContextProvider router={router}><AeX402Directory
      page={{ kind: 'ok', items, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
      {...extra} search={nextSearch} /></RouterContextProvider>)
  } }
}
// Every place that used to open the retired Tool detail dialog now navigates
// straight to the one Tool detail surface, `/tools/$toolRef`.
function toolOpener(title: string) {
  return screen.getByRole('link', { name: title })
}
function toolHref(link: HTMLElement) { return new URL(link.getAttribute('href')!, 'https://aecon.ai') }
afterEach(() => { cleanup(); localStorage.clear() })
describe('native x402 catalogue', () => {
  it('shows the complete upstream page and pagination, linking every Tool to its detail page', () => {
    show()
    expect(screen.getByText('14,455 Tools')).toBeTruthy()
    expect(screen.getByText('Showing 21–40 of 14,455')).toBeTruthy()
    for (const entry of entries) {
      const href = toolHref(screen.getByRole('link', { name: entry.title }))
      expect(decodeURIComponent(href.pathname.replace('/tools/', ''))).toBe(x402PendingToolRef(entry.resource))
    }
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toContain('offset=40')
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toContain('offset=0')
  })
  it('opens the selected Tool at the one Tool detail surface, preserving the return context', () => {
    const search = { query: 'research', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005 }
    show(search)
    const href = toolHref(toolOpener('Tool 0'))
    expect(decodeURIComponent(href.pathname.replace('/tools/', ''))).toBe(x402PendingToolRef(entries[0]!.resource))
    expect(href.searchParams.get('from')).toBe(buildMarketReturnContext(search, 'tools'))
  })
})

it('compares published facts and links straight to the one Tool detail surface from the comparison table', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC` }], outputSummary: `Output ${index}` }))
  show(undefined, priced)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  expect((screen.getByRole('button', { name: 'Compare Tools' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare Tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare Tools' })
  expect(within(comparison).getByText('1 USDC')).toBeTruthy()
  expect(within(comparison).getByText('2 USDC')).toBeTruthy()
  expect(within(comparison).getByText('Output 0')).toBeTruthy()
  const inspect = within(comparison).getAllByRole('link', { name: 'Inspect Tool' })[0]!
  expect(decodeURIComponent(toolHref(inspect).pathname.replace('/tools/', ''))).toBe(x402PendingToolRef(priced[0]!.resource))
})
it('groups the provider view by exact hostname and opens that provider filter', async () => {
  const { router } = show({ view: 'providers', query: 'research', network: 'eip155:8453', maxUsdPrice: 0.01 }, entries.map((entry, index) => ({ ...entry, provider: index === 19 ? 'other.example.com' : entry.provider })))
  expect(screen.getByText('19 Tools in these results')).toBeTruthy()
  expect(screen.getByText('1 Tool in these results')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from example.com' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ provider: 'example.com', query: 'research', network: 'eip155:8453', maxUsdPrice: 0.01 }))
})
it('inspects a saved Tool through the same one Tool detail surface', async () => {
  const savedSearch = { query: 'original search', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.02 }
  localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, JSON.stringify({ version: 1, items: [{ entry: entries[0], search: savedSearch }] }))
  show({ view: 'saved', query: 'different search' }, [])
  const link = await screen.findByRole('link', { name: 'Tool 0' })
  expect(decodeURIComponent(toolHref(link).pathname.replace('/tools/', ''))).toBe(x402PendingToolRef(entries[0]!.resource))
})

it('keeps comparison choices when a new search is submitted and results refresh', async () => {
  const { router, updateSearch } = show()
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Tools' }), { target: { value: 'new research' } })
  expect(fireEvent.submit(screen.getByRole('search'))).toBe(false)
  await waitFor(() => expect(router.state.location.search).toMatchObject({ query: 'new research' }))
  updateSearch({ query: 'new research' })
  expect(screen.getByText('2 of 4 selected')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Compare Tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare Tools' })
  expect(within(comparison).getByText('Tool 0')).toBeTruthy()
  expect(within(comparison).getByText('Tool 1')).toBeTruthy()
})
it('returns focus to Compare after dismissing the comparison dialog', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  const opener = screen.getByRole('button', { name: 'Compare Tools' })
  opener.focus()
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(document.activeElement).toBe(opener))
})

const coverage = { source: 'coinbase' as const, generation: 'generation-1', indexedTotal: 14455, reportedTotal: 14455, reportedTotalAtStart: 14455, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 145, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' as const }
const indexedPage = { kind: 'ok' as const, items: entries.slice(0, 2), offset: 0, limit: 20 }
const indexedCatalogue = { kind: 'ok' as const, source: 'index' as const, page: indexedPage, coverage, searchMethod: 'native_index' as const, indexCursor: 'generation-1:next/page+cursor', isDone: false }
const overview = { kind: 'ok' as const, coverage, categories: [{ key: 'research', label: 'Research', count: 201 }, { key: 'media', label: 'Media', count: 405 }], providers: [], networks: [], popular: [], recentlyUpdated: [] }
const nativeFilters = { view: 'tools' as const, network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005, directoryCategory: 'research' }
function pageLinkSearch(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai').searchParams }
function expectNativeFilters(search: URLSearchParams) {
  for (const [key, value] of Object.entries(nativeFilters)) expect(search.get(key)).toBe(String(value))
}

describe('indexed x402 catalogue controls', () => {
  it.each([
    { query: 'weather', sort: 'relevance' as const },
    { sort: 'updated' as const },
  ])('preserves native filters and sort in cursor navigation: %j', sorting => {
    show({ ...nativeFilters, ...sorting, indexCursor: 'generation-1:current' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    const next = pageLinkSearch('Next page')
    expectNativeFilters(next)
    expect(next.get('indexCursor')).toBe(indexedCatalogue.indexCursor)
    expect(next.get('sort')).toBe(sorting.sort)
    expect(next.get('query')).toBe('query' in sorting ? sorting.query : null)
    expect(next.has('offset')).toBe(false)
    const first = pageLinkSearch('First page')
    expectNativeFilters(first)
    expect(first.get('sort')).toBe(sorting.sort)
    expect(first.has('indexCursor')).toBe(false)
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull()
  })
  it('changes category through its control while preserving filters and clearing the old cursor', async () => {
    const { router } = show({ ...nativeFilters, query: 'weather', sort: 'relevance', indexCursor: 'generation-1:current' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: 'Media 405' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, query: 'weather', sort: 'relevance', directoryCategory: 'media' }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
  })
  it('changes sort through its control while preserving filters and clearing the old cursor', async () => {
    const { router } = show({ ...nativeFilters, sort: 'popular', indexCursor: 'generation-1:current' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort Tools' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: 'Recently updated' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, sort: 'updated' }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
  })
  it('separates the catalogue total from the number of filtered Tools on the current page', () => {
    show({ ...nativeFilters, query: 'weather', sort: 'relevance' }, undefined, { page: { ...indexedPage, total: coverage.indexedTotal }, catalogue: indexedCatalogue, overview })
    expect(screen.getByText('14,455 Tools in the catalogue')).toBeTruthy()
    expect(screen.getByText('2 Tools on this page')).toBeTruthy()
    expect(screen.queryByText('14,455 matching Tools')).toBeNull()
    expect(screen.queryByText('2 matching Tools')).toBeNull()
    expect(screen.getByText('Keyword search across the catalogue')).toBeTruthy()
  })
  it('keeps next-page navigation for an empty portion when the index has more entries', () => {
    const empty = { ...indexedPage, items: [] }
    show(nativeFilters, [], { page: empty, catalogue: { ...indexedCatalogue, page: empty } })
    expect(screen.getByRole('heading', { name: 'More of the catalogue remains' })).toBeTruthy()
    expect(screen.getByText('No matches in this portion. Continue to the next page to check the remaining Tools.')).toBeTruthy()
    expect(pageLinkSearch('Next page').get('indexCursor')).toBe(indexedCatalogue.indexCursor)
    expect(screen.queryByRole('heading', { name: 'No matching Tools' })).toBeNull()
  })
  it('refreshes a stale cursor from the first page with the same query and native filters', () => {
    show({ ...nativeFilters, query: 'weather', sort: 'relevance', indexCursor: 'old-generation:cursor' }, [], { page: { kind: 'unavailable', reason: 'source_unavailable' }, catalogue: { kind: 'unavailable', reason: 'cursor_invalid' } })
    const refresh = pageLinkSearch('Refresh results')
    expectNativeFilters(refresh)
    expect(refresh.get('query')).toBe('weather')
    expect(refresh.get('sort')).toBe('relevance')
    expect(refresh.has('indexCursor')).toBe(false)
    expect(screen.getByText('This catalogue page could not be loaded. Refresh results to start again with the same search and filters.')).toBeTruthy()
  })
})

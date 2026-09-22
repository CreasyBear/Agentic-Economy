/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, useRouterState } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { DIRECTORY_SAVED_TOOLS_STORAGE_KEY } from '@/modules/market/saved-tools.contracts'
import type { ComponentProps } from 'react'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const readX402DirectoryCatalogueServer = vi.fn()
vi.mock('@/modules/market/x402-directory-index.functions', () => ({
  readX402DirectoryCatalogueServer: (...args: unknown[]) => readX402DirectoryCatalogueServer(...args),
}))

const entries: X402DirectoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
  resource: `https://example.com/tool/${i}/:id`, title: `Tool ${i}`, description: `Description ${i}`,
  protocol: i === 19 ? 'mcp' : 'http', provider: 'example.com', prices: [], metadataJson: '{}', slug: `tool-${i}`,
}))
type Props = ComponentProps<typeof AeX402Directory>
// Mirrors the route: the URL's search is what the page receives, so URL-held
// state (Compare selection) follows navigations exactly as in production.
function Directory({ search, ...rest }: Props) {
  const urlSearch = useRouterState({ select: (state) => state.location.search }) as Partial<Props['search']>
  return <AeX402Directory {...rest} search={{ ...search, ...urlSearch }} />
}
function show(search: Props['search'] = { offset: 20 }, items = entries, extra: Partial<Omit<Props, 'search'>> = {}) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/market' }),
    createRoute({ getParentRoute: () => root, path: '/owner/market' }),
    createRoute({ getParentRoute: () => root, path: '/tools/$providerHost/$slug' }),
  ]), history: createMemoryHistory({ initialEntries: [extra.marketPath ?? '/market'] }) })
  const result = render(<RouterContextProvider router={router}><Directory
    page={{ kind: 'ok', items, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
    compareEntries={[]} {...extra} search={search} /></RouterContextProvider>)
  return { ...result, router, updatePage(nextPage: Props['page']) {
    result.rerender(<RouterContextProvider router={router}><Directory
      compareEntries={[]} {...extra} page={nextPage} search={search} /></RouterContextProvider>)
  }, updateSearch(nextSearch: Props['search']) {
    result.rerender(<RouterContextProvider router={router}><Directory
      page={{ kind: 'ok', items, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
      compareEntries={[]} {...extra} search={nextSearch} /></RouterContextProvider>)
  }, updateCatalogue(nextSearch: Props['search'], nextPage: Props['page'], nextCatalogue: NonNullable<Props['catalogue']>) {
    result.rerender(<RouterContextProvider router={router}><Directory
      compareEntries={[]} {...extra} page={nextPage} catalogue={nextCatalogue} search={nextSearch} /></RouterContextProvider>)
  } }
}
// Every place that used to open the retired Tool detail dialog now navigates
// straight to the one Tool detail surface, `/tools/<providerHost>/<slug>`.
function toolOpener(title: string) {
  return screen.getByRole('link', { name: title })
}
function toolHref(link: HTMLElement) { return new URL(link.getAttribute('href')!, 'https://aecon.ai') }
afterEach(() => { cleanup(); localStorage.clear(); readX402DirectoryCatalogueServer.mockReset() })
describe('native x402 catalogue', () => {
  it('shows the complete upstream page and pagination, linking every Tool to its canonical detail page', () => {
    show()
    expect(screen.getByText('14,455 Tools')).toBeTruthy()
    expect(screen.getByText('Showing 21–40 of 14,455')).toBeTruthy()
    for (const entry of entries) {
      const href = toolHref(screen.getByRole('link', { name: entry.title }))
      expect(href.pathname).toBe(`/tools/${entry.provider}/${entry.slug}`)
    }
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toContain('offset=40')
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toContain('offset=0')
  })
  it('opens the selected Tool at the one canonical Tool detail surface, tagging the navigation so Back can use browser history', async () => {
    const search = { query: 'research', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005 }
    const { router } = show(search)
    const href = toolHref(toolOpener('Tool 0'))
    expect(href.pathname).toBe(`/tools/${entries[0]!.provider}/${entries[0]!.slug}`)
    // No `from=` search param: the canonical URL carries only the Tool
    // reference, and "came from the market" travels as history `state`
    // (MARKET_LINK_STATE) instead of a URL parameter.
    expect(href.search).toBe('')
    fireEvent.click(toolOpener('Tool 0'))
    await waitFor(() => expect(router.state.location.pathname).toBe(href.pathname))
    expect(router.state.location.state.fromMarket).toBe(true)
  })
})

it('compares published facts and links straight to the one canonical Tool detail surface from the comparison table', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC` }], outputSummary: `Output ${index}` }))
  show(undefined, priced)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  expect((screen.getByRole('button', { name: 'Compare Tools' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare Tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare Tools' })
  expect(within(comparison).getByText('Preliminary comparison.')).toBeTruthy()
  expect(within(comparison).getByText('1 USDC')).toBeTruthy()
  expect(within(comparison).getByText('2 USDC')).toBeTruthy()
  expect(within(comparison).getByText('Output 0')).toBeTruthy()
  expect(within(comparison).getByText('Category')).toBeTruthy()
  expect(within(comparison).getByText('Provider-listed price')).toBeTruthy()
  expect(within(comparison).queryByText('Base')).toBeNull()
  const inspect = within(comparison).getAllByRole('link', { name: 'Inspect Tool' })[0]!
  expect(toolHref(inspect).pathname).toBe(`/tools/${priced[0]!.provider}/${priced[0]!.slug}`)
  expect(inspect.closest('th')).not.toBeNull()
  expect(within(comparison).getByRole('columnheader', { name: 'Fact' }).className).toContain('left-0')
  expect(within(comparison).getAllByRole('row')).toHaveLength(8)
})
it('labels the card comparison control visibly and preserves its pressed state', () => {
  show(undefined, entries)

  const compare = screen.getByRole('button', { name: 'Add Tool 0 to comparison' })
  expect(compare.textContent).toContain('Compare')
  expect(compare.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(compare)

  const selected = screen.getByRole('button', { name: 'Remove Tool 0 from comparison' })
  expect(selected.textContent).toContain('Compare')
  expect(selected.getAttribute('aria-pressed')).toBe('true')
})
it('keeps Provider price evidence secondary and settlement networks off Tool cards', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC`, decimalAmount: String(index + 1), symbol: 'USDC' }] }))
  show(undefined, priced)

  expect(screen.getAllByText('Provider-listed price')).toHaveLength(priced.length)
  expect(screen.getAllByText('Provider price per Call')).toHaveLength(priced.length)
  expect(screen.getByText('1 USDC')).toBeTruthy()
  expect(screen.queryByText('Base')).toBeNull()
})
it('groups the provider view by exact hostname and opens that provider filter', async () => {
  const { router } = show({ view: 'providers', query: 'research', network: 'eip155:8453', maxUsdPrice: 0.01 }, entries.map((entry, index) => ({ ...entry, provider: index === 19 ? 'other.example.com' : entry.provider })))
  expect(screen.getByText('19 Tools in these results')).toBeTruthy()
  expect(screen.getByText('1 Tool in these results')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from example.com' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ provider: 'example.com', query: 'research', network: 'eip155:8453', maxUsdPrice: 0.01 }))
})
it('inspects a saved Tool through the same one canonical Tool detail surface', async () => {
  const savedSearch = { query: 'original search', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.02 }
  localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, JSON.stringify({ version: 1, items: [{ entry: entries[0], search: savedSearch }] }))
  show({ view: 'saved', query: 'different search' }, [])
  const link = await screen.findByRole('link', { name: 'Tool 0' })
  expect(toolHref(link).pathname).toBe(`/tools/${entries[0]!.provider}/${entries[0]!.slug}`)
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
it('keeps a selected Tool hydrated across pages and a reload-style render', () => {
  const selected = entries[19]!
  const compareEntries = [{ resource: selected.resource, entry: selected }]
  const { updatePage } = show({ offset: 20 }, entries, { compareEntries })
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 19 to comparison' }))

  updatePage({ kind: 'ok', items: entries.slice(0, 2), total: 14455, offset: 0, limit: 20, nextOffset: 20 })
  expect(screen.getByText('Tool 19')).toBeTruthy()

  cleanup()
  show({ compare: selected.resource }, entries.slice(0, 2), { compareEntries })
  expect(screen.getByText('Tool 19')).toBeTruthy()
})
it('keeps comparison refs when clearing filters and using offset pagination', () => {
  const compare = entries[19]!.resource
  show({ query: 'weather', offset: 20, provider: 'example.com', compare }, entries, {
    compareEntries: [{ resource: compare, entry: entries[19]! }],
  })

  expect(toolHref(screen.getByRole('link', { name: 'Clear search & filters' })).searchParams.get('compare')).toBe(compare)
  expect(toolHref(screen.getByRole('link', { name: 'Next page' })).searchParams.get('compare')).toBe(compare)
  expect(toolHref(screen.getByRole('link', { name: 'Previous page' })).searchParams.get('compare')).toBe(compare)
})
it('shows an unavailable selected Tool with a remove control', async () => {
  const resource = 'https://example.com/tool/removed'
  const { router } = show({ compare: resource }, entries.slice(0, 2), {
    compareEntries: [{ resource, missing: true }],
  })

  expect(screen.getByText('Tool no longer available')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove unavailable Tool from comparison' }))
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty('compare'))
})
it('does not call an URL selection unavailable while its loader hydration is pending', () => {
  const resource = 'https://example.com/tool/loading'
  show({ compare: resource }, entries.slice(0, 2))

  expect(screen.getByText('Loading selected Tool…')).toBeTruthy()
  expect(screen.queryByText('Tool no longer available')).toBeNull()
})
it('keeps workspace searches and pagination inside the authenticated Market route', async () => {
  const { router } = show({ offset: 20 }, entries, { workspace: true, marketPath: '/owner/market' })
  expect(screen.getByRole('heading', { level: 2, name: 'Explore capabilities.' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toContain('/owner/market')

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Tools' }), { target: { value: 'new research' } })
  fireEvent.submit(screen.getByRole('search'))

  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/market'))
  expect(router.state.location.search).toMatchObject({ query: 'new research', view: 'tools' })
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
it('docks the comparison tray in document flow below results without sticky overlay', () => {
  show(undefined, entries.slice(0, 4))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  const tray = document.querySelector('[data-compare-tray="flow"]')
  expect(tray).toBeTruthy()
  expect(tray!.className).not.toContain('sticky')
  expect(tray!.className).not.toContain('fixed')
  expect(tray!.className).not.toContain('shadow-float')
  const cataloguePages = screen.getByRole('navigation', { name: 'Catalogue pages' })
  expect(tray!.compareDocumentPosition(cataloguePages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

const coverage = { source: 'coinbase' as const, generation: 'generation-1', indexedTotal: 14455, reportedTotal: 14455, reportedTotalAtStart: 14455, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 145, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' as const }
const indexedPage = { kind: 'ok' as const, items: entries.slice(0, 2), offset: 0, limit: 20 }
const indexedCatalogue = { kind: 'ok' as const, source: 'index' as const, page: indexedPage, coverage, searchMethod: 'native_index' as const, indexCursor: 'generation-1:next/page+cursor', isDone: false }
const overview = { kind: 'ok' as const, coverage, categories: [{ key: 'research', label: 'Research', count: 201 }, { key: 'media', label: 'Media', count: 405 }], providers: [], networks: [{ key: 'eip155:8453', label: 'Base', count: 14455 }], popular: [], recentlyUpdated: [] }
const nativeFilters = { view: 'tools' as const, network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005, directoryCategory: 'research' }
function pageLinkSearch(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai').searchParams }
function expectNativeFilters(search: URLSearchParams) {
  for (const [key, value] of Object.entries(nativeFilters)) expect(search.get(key)).toBe(String(value))
}

describe('indexed x402 catalogue controls', () => {
  it('keeps the buyer-facing refinements visible and places provider metadata behind Advanced filters', () => {
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    expect(screen.getByRole('group', { name: 'Provider category' })).toBeTruthy()
    expect(screen.getByText('Listed price')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Advanced filters' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group', { name: 'Network' })).toBeNull()
    expect(screen.queryByLabelText('Provider')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Advanced filters' }))
    expect(screen.getByRole('group', { name: 'Network' })).toBeTruthy()
    expect(screen.getByLabelText('Provider')).toBeTruthy()
    expect(screen.getByText('Published details')).toBeTruthy()
  })

  it('opens Advanced filters when an advanced refinement is already active', () => {
    show({ view: 'tools', network: 'eip155:8453' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    expect(screen.getByRole('button', { name: 'Advanced filters 1 active' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: 'Network' })).toBeTruthy()
  })

  it('never puts the Convex page cursor in the market URL and offers Load more instead', () => {
    show({ ...nativeFilters, sort: 'relevance', query: 'weather' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'First page' })).toBeNull()
    for (const link of screen.getAllByRole('link')) expect(new URL(link.getAttribute('href')!, 'https://aecon.ai').searchParams.has('indexCursor')).toBe(false)
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
  })
  it('appends the next page in place on Load more, calling the server function with the current cursor and filters', async () => {
    const nextItems = entries.slice(2, 4)
    readX402DirectoryCatalogueServer.mockResolvedValue({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { kind: 'ok', items: nextItems, offset: 0, limit: 20 }, isDone: true,
    })
    show({ ...nativeFilters, sort: 'relevance', query: 'weather' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.getByText(/2 Tools loaded/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const { view: _view, ...filtersWithoutView } = nativeFilters
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: { ...filtersWithoutView, sort: 'relevance', query: 'weather', indexCursor: indexedCatalogue.indexCursor } })
    await waitFor(() => expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy())
    expect(screen.getByText(/4 Tools loaded/)).toBeTruthy()
    // The server reported isDone this time, so Load more is gone.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })
  it('keeps loaded Tools and the cursor available when Load more fails, then retries the same continuation', async () => {
    const nextItems = entries.slice(2, 4)
    readX402DirectoryCatalogueServer
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' })
      .mockResolvedValueOnce({
        kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
        page: { kind: 'ok', items: nextItems, offset: 0, limit: 20 }, isDone: true,
      })
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const failure = await screen.findByRole('alert')
    expect(failure.textContent).toContain('More Tools could not be loaded')
    expect(failure.className).toContain('text-muted-foreground')
    expect(failure.className).not.toContain('text-destructive')
    expect(screen.getByText(/2 Tools loaded/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try loading more again' }))
    await waitFor(() => expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy())
    expect(readX402DirectoryCatalogueServer).toHaveBeenNthCalledWith(2, { data: { indexCursor: indexedCatalogue.indexCursor } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/4 Tools loaded/)).toBeTruthy()
  })
  it('ignores a stale Load more response after a new search has supplied an authoritative first page', async () => {
    let resolveContinuation: (value: unknown) => void = () => undefined
    readX402DirectoryCatalogueServer.mockImplementation(() => new Promise(resolve => { resolveContinuation = resolve }))
    const { updateCatalogue } = show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const replacementPage = { ...indexedPage, items: entries.slice(4, 6) }
    const replacementCatalogue = { ...indexedCatalogue, page: replacementPage, indexCursor: 'generation-1:new-search-cursor' }
    updateCatalogue({ view: 'tools', query: 'replacement' }, replacementPage, replacementCatalogue)
    expect(await screen.findByRole('link', { name: 'Tool 4' })).toBeTruthy()

    resolveContinuation({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { ...indexedPage, items: entries.slice(2, 4) }, isDone: true,
    })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Tool 2' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Tool 4' })).toBeTruthy()
  })
  it('changes category through its control while preserving filters, without ever adding a cursor', async () => {
    const { router } = show({ ...nativeFilters, query: 'weather', sort: 'relevance' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: 'Media 405' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, query: 'weather', sort: 'relevance', directoryCategory: 'media' }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
  })
  it('changes sort through its control while preserving filters, without ever adding a cursor', async () => {
    const { router } = show({ ...nativeFilters, sort: 'popular' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort Tools' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: 'Recently updated' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, sort: 'updated' }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
  })
  it('separates the catalogue total from the number of Tools loaded so far', () => {
    show({ ...nativeFilters, query: 'weather', sort: 'relevance' }, undefined, { page: { ...indexedPage, total: coverage.indexedTotal }, catalogue: indexedCatalogue, overview })
    expect(screen.getByText('14,455 Tools in the catalogue')).toBeTruthy()
    expect(screen.getByText(/2 Tools loaded/)).toBeTruthy()
    expect(screen.queryByText('14,455 matching Tools')).toBeNull()
    expect(screen.queryByText('2 matching Tools')).toBeNull()
    expect(screen.getByText(/Keyword search across the catalogue/)).toBeTruthy()
  })
  it('keeps Load more available for an empty portion when the index has more entries', () => {
    const empty = { ...indexedPage, items: [] }
    show(nativeFilters, [], { page: empty, catalogue: { ...indexedCatalogue, page: empty } })
    expect(screen.getByRole('heading', { name: 'More of the catalogue remains' })).toBeTruthy()
    expect(screen.getByText('No matches in this portion. Continue to the next page to check the remaining Tools.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No matching Tools' })).toBeNull()
  })
  it('shows a plain Try again when the initial indexed load is unavailable - there is no cursor to carry, since the URL never held one', () => {
    show({ ...nativeFilters, query: 'weather', sort: 'relevance' }, [], { page: { kind: 'unavailable', reason: 'source_unavailable' }, catalogue: { kind: 'unavailable', reason: 'source_unavailable' } })
    const tryAgain = pageLinkSearch('Try again')
    expectNativeFilters(tryAgain)
    expect(tryAgain.get('query')).toBe('weather')
    expect(tryAgain.get('sort')).toBe('relevance')
    expect(tryAgain.has('indexCursor')).toBe(false)
    expect(screen.getByText('The discovery service could not be reached. Try again.')).toBeTruthy()
  })
})

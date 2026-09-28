/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, useRouterState } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import type { ComponentProps } from 'react'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { SearchResult, ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { PublicToolRegistrySchemaVersion, type PublicToolRef } from '@/modules/capability-supply/public'
import { marketLoaderDeps, validateMarketSearch } from '@/modules/market/market-route-data'
import type * as DemandFunctions from '@/modules/market-demand/market-demand.functions'
const owner = vi.hoisted(() => ({ userId: 'alice' as string | null }))
const listSavedToolsForOwner = vi.hoisted(() => vi.fn())
const saveToolForOwner = vi.hoisted(() => vi.fn())
const recordOwnerMarketDemand = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market-demand/market-demand.functions', async importOriginal => ({
  ...(await importOriginal<typeof DemandFunctions>()),
  recordOwnerMarketDemand,
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: owner.userId !== null, userId: owner.userId }) }))
vi.mock('@/modules/market/saved-tools.functions', () => ({
  listSavedToolsForOwner,
  saveToolForOwner,
  removeToolForOwner: vi.fn(),
}))

const readX402DirectoryCatalogueServer = vi.fn()
vi.mock('@/modules/market/x402-directory-index.functions', () => ({
  readX402DirectoryCatalogueServer: (...args: unknown[]) => readX402DirectoryCatalogueServer(...args),
}))
const searchMarketToolsServer = vi.fn()
vi.mock('@/modules/market/market-tool-search.functions', () => ({
  searchMarketToolsServer: (...args: unknown[]) => searchMarketToolsServer(...args),
}))
const captureRouteException = vi.fn()
vi.mock('@/lib/observability/capture-route-exception', () => ({
  captureRouteException: (...args: unknown[]) => captureRouteException(...args),
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
    createRoute({ getParentRoute: () => root, path: '/t/new' }),
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
beforeEach(() => { listSavedToolsForOwner.mockResolvedValue({ kind: 'available', items: [] }) })
afterEach(() => { cleanup(); owner.userId = 'alice'; listSavedToolsForOwner.mockReset(); saveToolForOwner.mockReset(); recordOwnerMarketDemand.mockReset(); readX402DirectoryCatalogueServer.mockReset(); searchMarketToolsServer.mockReset(); captureRouteException.mockReset() })
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
    const search = { network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005 }
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

it('compares Provider-listed source prices and Coinbase activity without a sideways mobile table', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC` }], outputSummary: `Output ${index}`, ...(index === 0 ? { activity: { calls30d: 66 } } : {}) }))
  show(undefined, priced)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  expect((screen.getByRole('button', { name: 'Compare Tools' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare Tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare Tools' })
  const cards = within(comparison).getAllByRole('article')
  expect(within(cards[0]!).getByText(/Provider lists 1 USDC/)).toBeTruthy()
  expect(within(cards[1]!).getByText(/Provider lists 2 USDC/)).toBeTruthy()
  expect(within(cards[0]!).getByText('Coinbase Bazaar reported calls · 30 days')).toBeTruthy()
  expect(within(cards[0]!).getByText('66')).toBeTruthy()
  expect(within(comparison).getByText('Output 0')).toBeTruthy()
  expect(within(cards[0]!).getByText('Category')).toBeTruthy()
  expect(within(comparison).queryByText('Base')).toBeNull()
  const inspect = within(comparison).getAllByRole('link', { name: 'Inspect Tool' })[0]!
  expect(toolHref(inspect).pathname).toBe(`/tools/${priced[0]!.provider}/${priced[0]!.slug}`)
  expect(inspect.closest('article')).not.toBeNull()
  expect(within(comparison).queryByRole('table')).toBeNull()
  expect(cards).toHaveLength(2)
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

  expect(screen.getByRole('columnheader', { name: 'Price' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Coinbase Bazaar calls · 30 days' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Access' })).toBeTruthy()
  expect(screen.queryByRole('columnheader', { name: 'Volume' })).toBeNull()
  const row = screen.getByRole('link', { name: 'Tool 0' }).closest('tr')
  expect(row?.textContent).toContain('External listing · inspect')
  const priceCell = row?.querySelectorAll('td')[2]
  const [buyerPrice, sourcePrice] = priceCell?.querySelectorAll('p') ?? []
  expect(buyerPrice?.textContent).toMatch(/AUD.*unavailable/i)
  expect(buyerPrice?.textContent).not.toContain('USDC')
  expect(sourcePrice?.textContent).toMatch(/Provider.*1 USDC/)
  expect(screen.queryByText('Base')).toBeNull()
})
it('never promotes recipient transfer totals into the Tool-choice hierarchy', () => {
  const payTo = '0xabababababababababababababababababababab'
  const priced = [0, 1].map(index => ({
    ...entries[index]!,
    activity: { calls30d: index === 0 ? 66 : 3, payers30d: 2 },
    prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '1 USDC', decimalAmount: '1', symbol: 'USDC', payTo }],
  }))
  show(undefined, priced)
  expect(screen.getByRole('table', { name: 'Tools' })).toBeTruthy()
  expect(screen.queryByRole('table', { name: 'Settled USDC recipients' })).toBeNull()
  expect(screen.queryByRole('columnheader', { name: 'Volume' })).toBeNull()
})
it('groups the provider view by exact hostname and opens that provider filter', async () => {
  const { router } = show({ view: 'providers', network: 'eip155:8453', maxUsdPrice: 0.01 }, entries.map((entry, index) => ({ ...entry, provider: index === 19 ? 'other.example.com' : entry.provider })))
  expect(screen.getByTitle('19 Tools in these results')).toBeTruthy()
  expect(screen.getByTitle('1 Tool in these results')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from example.com' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ provider: 'example.com', network: 'eip155:8453', maxUsdPrice: 0.01 }))
})
it('opens an account-saved Bazaar Tool through the current canonical Tool detail surface', async () => {
  listSavedToolsForOwner.mockResolvedValue({ kind: 'available', items: [{ identity: { kind: 'external_listing', resource: entries[0]!.resource }, createdAt: 1, detail: { kind: 'found', entry: entries[0]! } }] })
  show({ view: 'saved', query: 'different search' }, [])
  const link = await screen.findByRole('link', { name: 'Tool 0' })
  expect(toolHref(link).pathname).toBe(`/tools/${entries[0]!.provider}/${entries[0]!.slug}`)
})

it('opens a chat from the Market hero with the trimmed question and no catalogue filters', async () => {
  const { router } = show({ view: 'tools', network: 'eip155:8453' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Ask about any tool or service' }), { target: { value: '  find me a weather API for Sydney  ' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Start a conversation' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/t/new'))
  expect(router.state.location.search).toEqual({ q: 'find me a weather API for Sydney' })
})
it('opens an empty new chat when the Market hero question is blank', async () => {
  const { router } = show()
  fireEvent.submit(screen.getByRole('form', { name: 'Start a conversation' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/t/new'))
  expect(router.state.location.search).toEqual({})
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
  show({ offset: 20, provider: 'example.com', compare }, entries, {
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
it('opens a chat from the workspace Market without carrying Market filters', async () => {
  const { router } = show({ offset: 20, network: 'eip155:8453' }, entries, { workspace: true, marketPath: '/owner/market' })
  expect(screen.getByRole('heading', { level: 2, name: 'Explore capabilities.' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toContain('/owner/market')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Ask about any tool or service' }), { target: { value: '  compare weather  ' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Start a conversation' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/t/new'))
  expect(router.state.location.search).toEqual({ q: 'compare weather' })
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

it('validates alternative identity and preserves it in Market loader dependencies', () => {
  const search = validateMarketSearch({ view: 'tools', query: 'weather forecast', alternativeTo: ' source-route:current ' })
  expect(search.alternativeTo).toBe('source-route:current')
  expect(marketLoaderDeps(search).alternativeTo).toBe('source-route:current')
  expect(() => validateMarketSearch({ view: 'tools', alternativeTo: 'source-route:current' })).toThrow()
  expect(() => validateMarketSearch({ view: 'tools', query: 'weather', alternativeTo: '   ' })).toThrow()
})

it('keeps alternative search in the admitted catalogue instead of sending it to mixed canonical search', () => {
  const other = {
    ...entries[1]!,
    choice: { access: 'ae_callable' as const, toolRef: `operation:v1:${'c'.repeat(64)}`, sourceRouteRef: 'source-route:other' },
    audEstimate: 'A$0.01',
    prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.000001 USDC', decimalAmount: '0.000001', symbol: 'USDC' }],
  }
  const page = { ...indexedPage, items: [other] }
  show({ view: 'tools', query: 'weather forecast', alternativeTo: 'source-route:current' }, [], {
    page, catalogue: { ...indexedCatalogue, page, indexCursor: 'more-alternatives', isDone: false }, overview,
  })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  expect(screen.getByText('Callable alternatives for “weather forecast”')).toBeTruthy()
  const row = screen.getByRole('link', { name: 'Tool 1' }).closest('tr')
  expect(row?.textContent).toContain('AE callable')
  expect(row?.textContent).toContain('A$0.01')
  expect(row?.textContent).toContain('0.000001 USDC')
  expect(screen.getByText(/more results remain to check/)).toBeTruthy()
  expect(screen.queryByText(/No other callable Tool/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy()
})

it('shows no callable alternative only after the indexed assessment is complete', () => {
  const page = { ...indexedPage, items: [] }
  show({ view: 'tools', query: 'weather forecast', alternativeTo: 'source-route:current' }, [], {
    page, catalogue: { ...indexedCatalogue, page, isDone: true }, overview,
  })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  expect(screen.getByText('No other callable Tool in the assessed catalogue')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
})

it('discloses verified recipients beside chat and Market search', () => {
  show({ view: 'tools' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview, chatRecipient: 'OpenRouter', jevRecipient: 'TypeSafe (api.typesafe.ai)' })
  expect(screen.getByRole('form', { name: 'Start a conversation' }).nextElementSibling?.textContent).toContain('OpenRouter')
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(screen.getByRole('searchbox', { name: 'Search Tools' }).closest('form')?.textContent).toContain('TypeSafe (api.typesafe.ai)')
})

describe('indexed x402 catalogue controls', () => {
  it('keeps the buyer-facing refinements visible and places provider metadata behind Advanced filters', () => {
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    expect(screen.getByRole('group', { name: 'Provider category' })).toBeTruthy()
    expect(screen.getByText('Provider-listed price · USDC')).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Filters 1' }))

    expect(screen.getByRole('button', { name: 'Advanced filters 1 active' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('group', { name: 'Network' })).toBeTruthy()
  })

  it('never puts the Convex page cursor in the market URL and offers a next page instead', () => {
    show({ ...nativeFilters, sort: 'relevance' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'First page' })).toBeNull()
    for (const link of screen.getAllByRole('link')) expect(new URL(link.getAttribute('href')!, 'https://aecon.ai').searchParams.has('indexCursor')).toBe(false)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull()
    const ordering = screen.getByRole('group', { name: 'Catalogue ordering and display' })
    expect(ordering.className).toContain('grid-cols-[minmax(0,1fr)_auto]')
    expect(ordering.className).not.toContain('flex-wrap')
    expect(within(ordering).getByRole('combobox', { name: 'Sort Tools' }).className).toContain('h-11!')
    expect(within(ordering).getByRole('button', { name: /^Filters/ }).className).toContain('h-11')
    const pages = screen.getByRole('navigation', { name: 'Catalogue pages' })
    expect(pages.className).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')
  })
  it('replaces the list with the next page, then returns to the first page without another request', async () => {
    const nextItems = entries.slice(2, 4)
    readX402DirectoryCatalogueServer.mockResolvedValue({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { kind: 'ok', items: nextItems, offset: 0, limit: 20 }, indexCursor: 'generation-1:page-3', isDone: false,
    })
    show({ ...nativeFilters, sort: 'relevance' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.getByText(/2 Tools on this page/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const { view: _view, ...filtersWithoutView } = nativeFilters
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: { ...filtersWithoutView, sort: 'relevance', indexCursor: indexedCatalogue.indexCursor } })
    await waitFor(() => expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    expect(screen.getByText(/2 Tools on this page/)).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByRole('link', { name: 'Tool 0' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: nextItems[0]!.title })).toBeNull()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)
  })
  it('keeps the current page when the next page fails, then retries the same continuation', async () => {
    const nextItems = entries.slice(2, 4)
    readX402DirectoryCatalogueServer
      .mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' })
      .mockResolvedValueOnce({
        kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
        page: { kind: 'ok', items: nextItems, offset: 0, limit: 20 }, isDone: true,
      })
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const failure = await screen.findByRole('alert')
    expect(failure.textContent).toContain('The next page could not be loaded')
    expect(failure.className).toContain('text-muted-foreground')
    expect(failure.className).not.toContain('text-destructive')
    expect(screen.getByRole('link', { name: 'Tool 0' })).toBeTruthy()
    expect(screen.getByText(/2 Tools on this page/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next page. Try again.' }))
    await waitFor(() => expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy())
    expect(readX402DirectoryCatalogueServer).toHaveBeenNthCalledWith(2, { data: { indexCursor: indexedCatalogue.indexCursor } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
  })
  it('ignores a stale next-page response after a new search has supplied an authoritative first page', async () => {
    let resolveContinuation: (value: unknown) => void = () => undefined
    readX402DirectoryCatalogueServer.mockImplementation(() => new Promise(resolve => { resolveContinuation = resolve }))
    const { updateCatalogue } = show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const replacementPage = { ...indexedPage, items: entries.slice(4, 6) }
    const replacementCatalogue = { ...indexedCatalogue, page: replacementPage, indexCursor: 'generation-1:new-search-cursor' }
    updateCatalogue({ view: 'tools', directoryCategory: 'media' }, replacementPage, replacementCatalogue)
    expect(await screen.findByRole('link', { name: 'Tool 4' })).toBeTruthy()

    resolveContinuation({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { ...indexedPage, items: entries.slice(2, 4) }, isDone: true,
    })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Tool 2' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Tool 4' })).toBeTruthy()
  })
  it('changes category through its control while preserving filters, without ever adding a cursor', async () => {
    searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'scoped', results: [], reason: 'More pages remain.' })
    const { router } = show({ ...nativeFilters, query: 'weather', sort: 'relevance' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: /Filters \d+/u }))
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
  it('keeps 12 providers on each page by reading further into the sorted Tool list', async () => {
    const hosts = Array.from({ length: 14 }, (_, index) => ({
      ...entries[0]!,
      resource: `https://host-${index}.example/tool`,
      provider: `host-${index}.example`,
      title: `Host ${index}`,
      slug: `host-${index}`,
    }))
    const firstPage = [hosts[0]!, hosts[0]!, hosts[1]!, hosts[1]!]
    readX402DirectoryCatalogueServer.mockResolvedValue({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { kind: 'ok', items: hosts.slice(2), offset: 0, limit: 12 },
      indexCursor: 'generation-1:providers-3',
      isDone: true,
    })
    show({ view: 'providers' }, undefined, {
      page: { ...indexedPage, items: firstPage },
      catalogue: { ...indexedCatalogue, page: { ...indexedPage, items: firstPage }, isDone: false },
      overview,
    })

    await waitFor(() => expect(screen.getAllByRole('button', { name: /View Tools from host-/ })).toHaveLength(12))
    expect(screen.getByText('12 Providers on this page')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'View Tools from host-12.example' })).toBeNull()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(screen.getByText('2 Providers on this page')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'View Tools from host-12.example' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View Tools from host-13.example' })).toBeTruthy()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getAllByRole('button', { name: /View Tools from host-/ })).toHaveLength(12)
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)
  })
  it('separates the catalogue total from the number of Tools on a browse page', () => {
    show(nativeFilters, undefined, { page: { ...indexedPage, total: coverage.indexedTotal }, catalogue: indexedCatalogue, overview })
    expect(screen.getByText('14,455 Tools in the catalogue')).toBeTruthy()
    expect(screen.getByText(/2 Tools on this page/)).toBeTruthy()
    expect(screen.queryByText('14,455 matching Tools')).toBeNull()
  })
  it('keeps the next page available for an empty portion when the index has more entries', () => {
    const empty = { ...indexedPage, items: [] }
    show(nativeFilters, [], { page: empty, catalogue: { ...indexedCatalogue, page: empty } })
    expect(screen.getByRole('heading', { name: 'More of the catalogue remains' })).toBeTruthy()
    expect(screen.getByText('No matches in this portion. Continue to the next page to check the remaining Tools.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'No matching Tools' })).toBeNull()
  })
  it('shows a plain Try again when the initial indexed browse is unavailable', () => {
    show(nativeFilters, [], { page: { kind: 'unavailable', reason: 'source_unavailable' }, catalogue: { kind: 'unavailable', reason: 'source_unavailable' } })
    const tryAgain = pageLinkSearch('Try again')
    expectNativeFilters(tryAgain)
    expect(tryAgain.has('indexCursor')).toBe(false)
    expect(screen.getByText('The discovery service could not be reached. Try again.')).toBeTruthy()
  })
})

const admittedRef = `operation:v1:${'a'.repeat(64)}` as PublicToolRef
const directoryId = `registry:${'b'.repeat(64)}`
const searchRows = [
  {
    id: admittedRef, source: 'current', access: 'ae_callable', toolRef: admittedRef,
    title: 'Weather Forecast', summary: 'Forecast for a city', provider: 'Weather Co',
    actionClass: 'retrieve', objectClass: 'data', readiness: 'ready',
    price: { kind: 'indicative', label: 'A$0.01' }, detailRef: admittedRef,
    next: [{ action: 'describe', args: { toolRef: admittedRef }, authority: 'public' }],
    freshness: { source: 'supply_projection', state: 'fresh', completedAt: Date.UTC(2026, 8, 27), staleAfterMs: 10800000 },
  },
  {
    id: directoryId, source: 'coinbase', access: 'external_listing',
    title: 'External Forecast', summary: 'Published weather endpoint', provider: 'example.com',
    actionClass: 'retrieve', objectClass: 'data', readiness: 'unverified',
    price: { kind: 'unavailable' }, detailRef: `/api/v1/registry/detail?id=${directoryId}`,
    next: [{ action: 'describe-external', args: { id: directoryId }, authority: 'public' }],
    freshness: { source: 'x402_directory', state: 'stale', completedAt: Date.UTC(2026, 8, 26), staleAfterMs: 10800000 },
  },
] satisfies SearchResult[]
const searchMeta = {
  schemaVersion: PublicToolRegistrySchemaVersion,
  query: 'weather', partialResults: true,
  assessed: { source: 'all', scope: 'page', examined: 8, coverage: 'partial', generation: 'generation-1', completedAt: Date.UTC(2026, 8, 26) },
  pagination: { limit: 8, nextCursor: 'opaque-next', hasMore: true },
  next: [{ action: 'next-page', args: { query: 'weather', cursor: 'opaque-next' }, authority: 'public' }],
} satisfies Pick<Extract<ToolChoiceSearchOutput, { kind: 'match' }>, 'schemaVersion' | 'query' | 'partialResults' | 'assessed' | 'pagination' | 'next'>

describe('canonical Market search', () => {
  it('replaces directory results with one mixed page, uses exact detail links, row-source freshness and an executable filtered cursor', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    const second = { ...searchMeta, kind: 'scoped', results: [searchRows[1]!], reason: 'More catalogue entries remain.', pagination: { limit: 8, hasMore: false }, next: [{ action: 'broaden', args: { query: 'weather' }, authority: 'public' }] } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    show({ view: 'tools', query: 'weather', directoryCategory: 'research', provider: 'example.com', network: 'eip155:8453', priceBand: 'lt_0_01', maxUsdPrice: 0.05 },
      entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    expect(toolHref(screen.getByRole('link', { name: 'Weather Forecast' })).pathname).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(toolHref(screen.getByRole('link', { name: 'External Forecast' })).pathname).toBe('/api/v1/registry/detail')
    expect(screen.getByText('AE-callable · ready')).toBeTruthy()
    expect(screen.getByText('External listing · not AE-callable')).toBeTruthy()
    expect(screen.getByText('Indicative AUD · A$0.01')).toBeTruthy()
    expect(screen.getByText('AUD estimate unavailable')).toBeTruthy()
    expect(screen.getByText(/AE supply projection · fresh/)).toBeTruthy()
    expect(screen.getByText(/Coinbase Bazaar index · stale/)).toBeTruthy()
    expect(screen.getByText(/not applied to this search/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(2, { data: { query: 'weather', limit: 8, filters: { category: 'research', provider: 'example.com', networkId: 'eip155:8453', priceBand: 'lt_0_01' }, cursor: 'opaque-next' } })
    expect(await screen.findByText('Search assessed a limited scope', { exact: false })).toBeTruthy()
    expect(screen.getByText('More catalogue entries remain.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Weather Forecast' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(2)
  })

  it('shows scoped continuation with no candidates instead of claiming no match, then a genuine no-match can broaden', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'scoped', results: [], reason: 'Unassessed pages remain.' })
    const { updateSearch, router } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByText('Unassessed pages remain.')).toBeTruthy()
    expect(screen.queryByText('No matching Tool in the assessed catalogue')).toBeNull()
    searchMarketToolsServer.mockResolvedValueOnce({
      ...searchMeta, kind: 'noMatch', results: [], reason: 'No eligible Tools matched.',
      assessed: { source: 'current', scope: 'complete', examined: 12, coverage: 'complete' },
      pagination: { limit: 8, hasMore: false }, next: [{ action: 'broaden', args: { query: 'impossible' }, authority: 'public' }],
      query: 'impossible',
    })
    updateSearch({ view: 'tools', query: 'impossible' })
    expect(await screen.findByText('No eligible Tools matched.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Browse all Tools' }))
    await waitFor(() => expect(router.state.location.search.query).toBeUndefined())
  })

  it('renders unavailable without stale recommendations and retries the same query', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'unavailable', results: [], reason: 'source_unavailable', pagination: { limit: 8, hasMore: false }, next: [{ action: 'retry', args: { query: 'weather' }, authority: 'public' }] })
      .mockResolvedValueOnce({ ...searchMeta, kind: 'match', results: searchRows })
    show({ view: 'tools', query: 'weather' }, entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByText('No recommendation was made.', { exact: false })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(2, { data: { query: 'weather', limit: 8 } })
  })

  it('reports failed search and retry with their causes while preserving the query and unavailable state', async () => {
    const initialFailure = new Error('initial search failed')
    const retryFailure = new Error('retry search failed')
    searchMarketToolsServer.mockRejectedValueOnce(initialFailure).mockRejectedValueOnce(retryFailure)
      .mockResolvedValueOnce({ ...searchMeta, kind: 'match', results: searchRows })
    show({ view: 'tools', query: 'weather' }, entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByText('Search is unavailable')).toBeTruthy()
    expect(captureRouteException).toHaveBeenCalledWith(initialFailure, { degraded: 'useCanonicalMarketSearch.initial', reason: 'source_unavailable' }, 'warning')
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
    await waitFor(() => expect(captureRouteException).toHaveBeenCalledWith(retryFailure, { degraded: 'useCanonicalMarketSearch.retry', reason: 'source_unavailable' }, 'warning'))
    expect(screen.getByText('Search is unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(3, { data: { query: 'weather', limit: 8 } })
  })

  it('reports next-page failure without replacing the current result and permits the same cursor to retry', async () => {
    const nextPageFailure = new Error('next page failed')
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValueOnce(first).mockRejectedValueOnce(nextPageFailure).mockResolvedValueOnce(first)
    show({ view: 'tools', query: 'weather' }, entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The next page could not load; this page is unchanged. Try Next page again.')
    expect(screen.getByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(captureRouteException).toHaveBeenCalledWith(nextPageFailure, { degraded: 'useCanonicalMarketSearch.nextPage', reason: 'source_unavailable' }, 'warning')
    fireEvent.click(screen.getByRole('button', { name: 'Next page. Retry' }))
    await waitFor(() => expect(screen.getByText('Page 2')).toBeTruthy())
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(3, { data: { query: 'weather', limit: 8, cursor: 'opaque-next' } })
  })
  it('distinguishes admitted setup from an external listing and names the exact source price and ranking recipient', async () => {
    const setup = {
      ...searchRows[0]!,
      id: `registry:${'e'.repeat(64)}`, source: 'coinbase' as const, access: 'setup_required' as const,
      title: 'Connect Weather', readiness: 'unverified' as const,
      sourcePrice: '0.000001 USDC', price: { kind: 'indicative' as const, label: 'A$0.01' },
    }
    searchMarketToolsServer.mockResolvedValueOnce({
      ...searchMeta, kind: 'match', results: [setup, searchRows[1]!],
      recipient: { label: 'TypeSafe', host: 'custom-gateway.example', data: 'query and candidate summaries' },
    } satisfies ToolChoiceSearchOutput)
    show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const inspect = await screen.findByRole('link', { name: 'Connect Weather' })
    expect(toolHref(inspect).pathname).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(screen.getByText('Connect to call')).toBeTruthy()
    expect(screen.getByText('Indicative AUD · A$0.01')).toBeTruthy()
    expect(screen.getByText('Provider-listed source · 0.000001 USDC')).toBeTruthy()
    expect(screen.getByText(/Search query and candidate Tool text went to TypeSafe \(custom-gateway.example\)/)).toBeTruthy()
    expect(screen.getByText('External listing · not AE-callable')).toBeTruthy()
  })
  it('saves exact admitted and Bazaar search identities without retaining listed prices', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput)
    saveToolForOwner.mockImplementation(async ({ data }: { data: { kind: string; toolRef?: string; id?: string } }) => ({
      kind: 'saved', identity: data.toolRef ? data : { kind: 'external_listing', resource: 'https://example.com/weather' }, createdAt: 1,
    }))
    show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const admitted = (await screen.findByRole('link', { name: 'Weather Forecast' })).closest('li')
    const external = screen.getByRole('link', { name: 'External Forecast' }).closest('li')
    if (!admitted || !external) throw new Error('Missing canonical search result row')
    await waitFor(() => expect(within(admitted).getByRole('button', { name: 'Save Tool' })).toHaveProperty('disabled', false))
    fireEvent.click(within(admitted).getByRole('button', { name: 'Save Tool' }))
    await waitFor(() => expect(saveToolForOwner).toHaveBeenCalledWith({ data: { kind: 'ae_callable', toolRef: admittedRef } }))
    fireEvent.click(within(external).getByRole('button', { name: 'Save Tool' }))
    await waitFor(() => expect(saveToolForOwner).toHaveBeenCalledWith({ data: { kind: 'external_listing', id: directoryId } }))
  })

  it('saves only an exhaustive no-match with its original search filters, never a scoped assessment', async () => {
    const filters = { view: 'tools' as const, query: 'missing-need', directoryCategory: 'weather' }
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, query: 'missing-need', kind: 'scoped', results: [], reason: 'More catalogue remains.' })
      .mockResolvedValueOnce({
        ...searchMeta, kind: 'noMatch', query: 'missing-need', results: [], reason: 'No matching Tool.',
        partialResults: false, assessed: { source: 'all', scope: 'complete', examined: 30, coverage: 'complete' },
        pagination: { limit: 8, hasMore: false }, next: [{ action: 'broaden', args: { query: 'missing-need' }, authority: 'public' }],
      } satisfies ToolChoiceSearchOutput)
    recordOwnerMarketDemand.mockResolvedValue({ kind: 'recorded', requestRef: 'request-1', query: 'missing-need', createdAt: 1 })
    const { updateSearch } = show(filters, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    await screen.findByText('More catalogue remains.')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    updateSearch({ ...filters, provider: 'example.com' })
    await screen.findByText('No matching Tool.')
    fireEvent.click(screen.getByRole('button', { name: 'Save this need' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Need saved' })).toHaveProperty('disabled', true))
    expect(recordOwnerMarketDemand).toHaveBeenCalledOnce()
    expect(recordOwnerMarketDemand).toHaveBeenCalledWith({ data: {
      query: 'missing-need', filters: { category: 'weather', provider: 'example.com' }, idempotencyKey: expect.any(String),
    } })
  })

  it('keys unmet need saves by canonical source and filters, reusing a retry key without disabling a different scope', async () => {
    const verdict = {
      ...searchMeta, kind: 'noMatch', query: 'unserved', results: [], reason: 'No matching Tool.',
      partialResults: false, assessed: { source: 'all', scope: 'complete', examined: 30, coverage: 'complete' },
      pagination: { limit: 8, hasMore: false }, next: [{ action: 'broaden', args: { query: 'unserved' }, authority: 'public' }],
    } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValue(verdict)
    recordOwnerMarketDemand.mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-a', query: 'unserved', createdAt: 1 })
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-b', query: 'unserved', createdAt: 2 })
    const { updateSearch } = show({ view: 'tools', query: 'unserved', provider: 'first.example.com' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const firstButton = await screen.findByRole('button', { name: 'Save this need' })
    fireEvent.click(firstButton)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Need saved' })).toHaveProperty('disabled', true))
    const firstCall = recordOwnerMarketDemand.mock.calls[0]
    if (firstCall === undefined) throw new Error('First need Save did not run')
    const firstKey = firstCall[0].data.idempotencyKey
    updateSearch({ view: 'tools', query: 'unserved', provider: 'second.example.com' })
    const secondButton = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(secondButton).toHaveProperty('disabled', false))
    fireEvent.click(secondButton)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Save this need' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Need saved' })).toHaveProperty('disabled', true))
    expect(recordOwnerMarketDemand).toHaveBeenCalledTimes(3)
    const secondCall = recordOwnerMarketDemand.mock.calls[1]
    const retryCall = recordOwnerMarketDemand.mock.calls[2]
    if (secondCall === undefined || retryCall === undefined) throw new Error('Second need Save or retry did not run')
    const secondKey = secondCall[0].data.idempotencyKey
    expect(secondKey).not.toBe(firstKey)
    expect(retryCall[0].data).toEqual({
      query: 'unserved', filters: { provider: 'second.example.com' }, idempotencyKey: secondKey,
    })
    updateSearch({ view: 'tools', query: 'unserved', provider: 'second.example.com', maxUsdPrice: 0.01 })
    expect(screen.getByRole('button', { name: 'Need saved' })).toHaveProperty('disabled', true)
  })

})

/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { DIRECTORY_SAVED_TOOLS_STORAGE_KEY } from '@/components/ae/market/DirectorySavedTools'
import type { ComponentProps } from 'react'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const { resolve, readDetail } = vi.hoisted(() => ({ resolve: vi.fn(), readDetail: vi.fn() }))
vi.mock('@/modules/market/x402-directory.functions', () => ({ prepareX402DirectoryResourceServer: resolve }))
vi.mock('@/modules/registry/tool-detail-route.functions', () => ({ readPublicToolDetailRouteServer: readDetail }))

const entries: X402DirectoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
  resource: `https://example.com/tool/${i}/:id`, title: `Tool ${i}`, description: `Description ${i}`,
  protocol: i === 19 ? 'mcp' : 'http', provider: 'example.com', prices: [], metadataJson: '{}',
}))
type Props = ComponentProps<typeof AeX402Directory>
function show(search: Props['search'] = { window: '30d', offset: 20 }, items = entries, extra: Partial<Omit<Props, 'search'>> = {}) {
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
function toolOpener(title: string) {
  const table = screen.queryByRole('table', { name: 'Tool comparison table' })
  return table === null ? screen.getByRole('button', { name: title }) : within(table).getByRole('button', { name: `View Tool: ${title}` })
}
beforeEach(() => { readDetail.mockResolvedValue({ kind: 'source_unavailable', toolRef: 'operation:v1:example' }) })
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks() })
describe('native x402 catalogue', () => {
  it('shows the complete upstream page and pagination without resolving unseen Tools', () => {
    show()
    expect(screen.getByText('14,455 Tools')).toBeTruthy()
    expect(screen.getByText('Showing 21–40 of 14,455')).toBeTruthy()
    for (const entry of entries) expect(screen.getByRole('button', { name: entry.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toContain('offset=40')
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toContain('offset=0')
    expect(resolve).not.toHaveBeenCalled()
    expect(readDetail).not.toHaveBeenCalled()
  })
  it('automatically resolves the selected endpoint and provides its existing one-command Call', async () => {
    resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
    show()
    fireEvent.click(toolOpener('Tool 0'))
    await waitFor(() => expect(screen.getByRole('link', { name: 'View input contract' })).toBeTruthy())
    expect(resolve).toHaveBeenCalledWith({ data: { resource: entries[0]?.resource, offset: 20 } })
    expect(readDetail).toHaveBeenCalledWith({ data: { toolRef: 'operation:v1:example' } })
    expect(screen.getByText("ae call operation:v1:example --input '<input-json>' --json")).toBeTruthy()
  })
})

it('resolves selection with all original native filters and preserves them in the return link', async () => {
  resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
  const search = { window: '30d' as const, query: 'research', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005 }
  show(search)
  fireEvent.click(toolOpener('Tool 0'))
  const link = await screen.findByRole('link', { name: 'View input contract' })
  expect(resolve).toHaveBeenCalledWith({ data: { resource: entries[0]?.resource, query: 'research', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005 } })
  const href = decodeURIComponent(link.getAttribute('href') ?? '')
  expect(href).toContain('network=eip155%3A8453')
  expect(href).toContain('provider=example.com')
  expect(href).toContain('maxUsdPrice=0.005')
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Contract' }))
  const listingLink = screen.getByText(text => text.startsWith(`${window.location.origin}/market?`)).textContent
  const shareUrl = new URL(listingLink ?? '')
  expect(shareUrl.searchParams.get('resource')).toBe(entries[0]?.resource)
  expect(shareUrl.searchParams.get('network')).toBe('eip155:8453')
  expect(shareUrl.searchParams.get('provider')).toBe('example.com')
  expect(shareUrl.searchParams.get('maxUsdPrice')).toBe('0.005')
})
it('compares published facts without preparing a Tool until inspection', async () => {
  resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
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
  expect(resolve).not.toHaveBeenCalled()
  fireEvent.click(within(comparison).getAllByRole('button', { name: 'Inspect Tool' })[0]!)
  await screen.findByRole('link', { name: 'View input contract' })
  expect(resolve).toHaveBeenCalledTimes(1)
})
it('groups the provider view by exact hostname and opens that provider filter', async () => {
  const { router } = show({ window: '30d', view: 'providers', query: 'research', network: 'eip155:8453', maxUsdPrice: 0.01 }, entries.map((entry, index) => ({ ...entry, provider: index === 19 ? 'other.example.com' : entry.provider })))
  expect(screen.getByText('19 Tools in these results')).toBeTruthy()
  expect(screen.getByText('1 Tool in these results')).toBeTruthy()
  expect(resolve).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from example.com' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ provider: 'example.com', query: 'research', network: 'eip155:8453', maxUsdPrice: 0.01 }))
})
it('inspects a saved Tool using its saved source filters rather than the current page', async () => {
  resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
  const savedSearch = { query: 'original search', network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.02 }
  localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, JSON.stringify({ version: 1, items: [{ entry: entries[0], search: savedSearch }] }))
  show({ window: '30d', view: 'saved', query: 'different search' }, [])
  fireEvent.click(await screen.findByRole('button', { name: 'Tool 0' }))
  await screen.findByRole('link', { name: 'View input contract' })
  expect(resolve).toHaveBeenCalledWith({ data: { resource: entries[0]?.resource, ...savedSearch } })
})

it('keeps comparison choices when a new search is submitted and results refresh', async () => {
  const { router, updateSearch } = show()
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Tools' }), { target: { value: 'new research' } })
  expect(fireEvent.submit(screen.getByRole('search'))).toBe(false)
  await waitFor(() => expect(router.state.location.search).toMatchObject({ query: 'new research' }))
  updateSearch({ window: '30d', query: 'new research' })
  expect(screen.getByText('2 of 4 selected')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Compare Tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare Tools' })
  expect(within(comparison).getByText('Tool 0')).toBeTruthy()
  expect(within(comparison).getByText('Tool 1')).toBeTruthy()
  expect(resolve).not.toHaveBeenCalled()
})
it('returns focus to a Tool opener when its detail dialog closes', async () => {
  resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
  show()
  const opener = toolOpener('Tool 0')
  opener.focus()
  fireEvent.click(opener)
  await screen.findByRole('link', { name: 'View input contract' })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(document.activeElement).toBe(opener))
})
it('returns focus to Compare after dismissing comparison and after inspecting a compared Tool', async () => {
  resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  const opener = screen.getByRole('button', { name: 'Compare Tools' })
  opener.focus()
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(document.activeElement).toBe(opener))
  fireEvent.click(opener)
  fireEvent.click(screen.getAllByRole('button', { name: 'Inspect Tool' })[0]!)
  await screen.findByRole('link', { name: 'View input contract' })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(document.activeElement).toBe(opener))
})

const coverage = { source: 'coinbase' as const, generation: 'generation-1', indexedTotal: 14455, reportedTotal: 14455, reportedTotalAtStart: 14455, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 145, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' as const }
const indexedPage = { kind: 'ok' as const, items: entries.slice(0, 2), offset: 0, limit: 20 }
const indexedCatalogue = { kind: 'ok' as const, source: 'index' as const, page: indexedPage, coverage, searchMethod: 'native_index' as const, indexCursor: 'generation-1:next/page+cursor', isDone: false }
const overview = { kind: 'ok' as const, coverage, categories: [{ key: 'research', label: 'Research', count: 201 }, { key: 'media', label: 'Media', count: 405 }], providers: [], networks: [], popular: [], recentlyUpdated: [] }
const nativeFilters = { window: '7d' as const, view: 'tools' as const, network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005, directoryCategory: 'research' }
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
  it('opens an exact selected entry outside the current results page', async () => {
    resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:linked' })
    const selectedEntry = { ...entries[10]!, title: 'Directly linked Tool' }
    show({ ...nativeFilters, resource: selectedEntry.resource }, undefined, { page: indexedPage, catalogue: indexedCatalogue, selectedEntry })
    await screen.findByRole('dialog', { name: 'Directly linked Tool' })
    await screen.findByRole('link', { name: 'View input contract' })
    expect(screen.queryByRole('button', { name: 'Directly linked Tool' })).toBeNull()
    expect(resolve).toHaveBeenCalledWith({ data: { resource: selectedEntry.resource, network: nativeFilters.network, provider: nativeFilters.provider, maxUsdPrice: nativeFilters.maxUsdPrice } })
  })
  it('does not open a supplied entry when it differs from the selected resource', () => {
    show({ ...nativeFilters, resource: entries[11]!.resource }, undefined, { page: indexedPage, catalogue: indexedCatalogue, selectedEntry: entries[10]! })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(resolve).not.toHaveBeenCalled()
  })
  it('preserves an open Playground and edited request when the catalogue page refreshes', async () => {
    resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
    readDetail.mockResolvedValue({ kind: 'found', tool: { contract: {
      inputJsonSchema: { type: 'object', properties: { query: { type: 'string', title: 'Search query' } }, required: ['query'] },
      inputExamples: [{ input: { query: 'initial request' } }],
    } } })
    const { updatePage } = show(nativeFilters, undefined, { page: indexedPage, catalogue: indexedCatalogue })
    fireEvent.click(toolOpener('Tool 0'))
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare request' }))
    const input = await screen.findByRole('textbox', { name: /Search query/u })
    fireEvent.change(input, { target: { value: 'keep this edited request' } })
    updatePage({ ...indexedPage, items: indexedPage.items.map(entry => ({ ...entry })) })
    expect(screen.getByRole('dialog', { name: 'Tool 0' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: /Search query/u }) as HTMLInputElement).value).toBe('keep this edited request')
    expect(screen.getByText('ae call \'operation:v1:example\' --input \'{"query":"keep this edited request"}\' --json')).toBeTruthy()
    expect(resolve).toHaveBeenCalledTimes(1)
  })
  it('closes a manually selected Tool when navigation changes the search query', async () => {
    resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
    const { updateSearch } = show(nativeFilters, undefined, { page: indexedPage, catalogue: indexedCatalogue })
    fireEvent.click(toolOpener('Tool 0'))
    await screen.findByRole('link', { name: 'View input contract' })
    updateSearch({ ...nativeFilters, query: 'a different request' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('switches URL-selected Tools and closes the detail when resource navigation is cleared', async () => {
    resolve.mockResolvedValue({ kind: 'ready', toolRef: 'operation:v1:example' })
    const { updateSearch } = show({ ...nativeFilters, resource: entries[0]!.resource }, undefined, { page: indexedPage, catalogue: indexedCatalogue })
    await screen.findByRole('dialog', { name: 'Tool 0' })
    updateSearch({ ...nativeFilters, resource: entries[1]!.resource })
    await screen.findByRole('dialog', { name: 'Tool 1' })
    expect(screen.queryByRole('dialog', { name: 'Tool 0' })).toBeNull()
    updateSearch(nativeFilters)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

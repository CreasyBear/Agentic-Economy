/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, useRouterState } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { Route as ProductionMarketRoute } from '@/routes/market'
import type { ComponentProps } from 'react'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { SearchResult, ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { PublicToolRegistrySchemaVersion, type PublicToolRef } from '@/modules/capability-supply/public'
import { loadMarketRouteData, marketLoaderDeps, validateMarketSearch } from '@/modules/market/market-route-data'
import type * as DemandFunctions from '@/modules/market-demand/market-demand.functions'
// The rate-limit setup preloads degrade and its telemetry dependency. Reload
// that graph so this file's capture mock observes the real degrade calls.
vi.hoisted(() => vi.resetModules())
const owner = vi.hoisted(() => ({ userId: 'alice' as string | null }))
const recordProductJourney = vi.hoisted(() => vi.fn())
vi.mock('@/lib/observability/product-journey', () => ({ recordProductJourney }))
const listSavedToolsForOwner = vi.hoisted(() => vi.fn())
const saveToolForOwner = vi.hoisted(() => vi.fn())
const recordOwnerMarketDemand = vi.hoisted(() => vi.fn())
const findOwnerActiveMarketDemand = vi.hoisted(() => vi.fn())
const getOwnerMarketDemandStatus = vi.hoisted(() => vi.fn())
vi.mock('@/modules/market-demand/market-demand.functions', async importOriginal => ({
  ...(await importOriginal<typeof DemandFunctions>()),
  recordOwnerMarketDemand,
  findOwnerActiveMarketDemand,
  getOwnerMarketDemandStatus,
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: owner.userId !== null, userId: owner.userId }) }))
vi.mock('@/modules/market/market.functions', async importOriginal => ({
  ...await importOriginal<typeof import('@/modules/market/market.functions')>(),
  listSavedToolsForOwner,
  saveToolForOwner,
  removeToolForOwner: vi.fn(),
}))

const readX402DirectoryCatalogueServer = vi.fn()
const readX402DirectoryCatalogueOverviewServer = vi.fn()
vi.mock('@/modules/market/x402-directory-index.functions', () => ({
  readX402DirectoryCatalogueServer: (...args: unknown[]) => readX402DirectoryCatalogueServer(...args),
  readX402DirectoryCatalogueOverviewServer: (...args: unknown[]) => readX402DirectoryCatalogueOverviewServer(...args),
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
type MarketRouteLoader = (deps: ReturnType<typeof marketLoaderDeps>) => unknown | Promise<unknown>
// Mirrors the route: the URL's search is what the page receives, so URL-held
// state (Compare selection) follows navigations exactly as in production.
function Directory({ search: _search, ...rest }: Props) {
  const urlSearch = useRouterState({ select: (state) => state.location.search }) as Props['search']
  return <AeX402Directory {...rest} search={urlSearch} />
}
function show(search: Props['search'] = { offset: 20 }, items = entries, extra: Partial<Omit<Props, 'search'>> = {}, routeLoader?: MarketRouteLoader) {
  const root = createRootRoute()
  const marketRouteBase = { getParentRoute: () => root, path: '/market' as const, validateSearch: validateMarketSearch }
  const marketRoute = routeLoader === undefined
    ? createRoute(marketRouteBase)
    : createRoute({
      ...marketRouteBase,
      loaderDeps: ({ search }) => marketLoaderDeps(search),
      loader: ({ deps }) => routeLoader(deps),
      ...(ProductionMarketRoute.options.staleTime === undefined ? {} : { staleTime: ProductionMarketRoute.options.staleTime }),
      ...(ProductionMarketRoute.options.preloadStaleTime === undefined ? {} : { preloadStaleTime: ProductionMarketRoute.options.preloadStaleTime }),
    })
  const router = createRouter({ defaultViewTransition: true, routeTree: root.addChildren([
    marketRoute,
    createRoute({ getParentRoute: () => root, path: '/t/new' }),
    createRoute({ getParentRoute: () => root, path: '/owner/market', validateSearch: validateMarketSearch }),
    createRoute({ getParentRoute: () => root, path: '/tools/$providerHost/$slug' }),
  ]), history: createMemoryHistory({ initialEntries: [`${extra.marketPath ?? '/market'}?${new URLSearchParams(Object.entries(search).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)]))}`] }) })
  const result = render(<RouterContextProvider router={router}><Directory
    page={{ kind: 'ok', items, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
    compareEntries={[]} {...extra} search={search} /></RouterContextProvider>)
  return { ...result, router, updatePage(nextPage: Props['page']) {
    result.rerender(<RouterContextProvider router={router}><Directory
      compareEntries={[]} {...extra} page={nextPage} search={search} /></RouterContextProvider>)
  }, updateSearch(nextSearch: Props['search']) {
    void router.navigate({ to: extra.marketPath ?? '/market', search: nextSearch })
    result.rerender(<RouterContextProvider router={router}><Directory
      page={{ kind: 'ok', items, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
      compareEntries={[]} {...extra} search={nextSearch} /></RouterContextProvider>)
  }, updateCatalogue(nextSearch: Props['search'], nextPage: Props['page'], nextCatalogue: NonNullable<Props['catalogue']>) {
    void router.navigate({ to: extra.marketPath ?? '/market', search: nextSearch })
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
beforeEach(() => {
  listSavedToolsForOwner.mockResolvedValue({ kind: 'available', items: [] })
  findOwnerActiveMarketDemand.mockReset().mockResolvedValue({ kind: 'not_found' })
  getOwnerMarketDemandStatus.mockReset().mockImplementation(({ data }: { data: { requestRef: string } }) => Promise.resolve({ kind: 'open', requestRef: data.requestRef, query: 'unserved', createdAt: 1, matchedCount: 0 }))
})
afterEach(() => { cleanup(); owner.userId = 'alice'; listSavedToolsForOwner.mockReset(); saveToolForOwner.mockReset(); recordOwnerMarketDemand.mockReset(); recordProductJourney.mockReset(); readX402DirectoryCatalogueServer.mockReset(); readX402DirectoryCatalogueOverviewServer.mockReset(); searchMarketToolsServer.mockReset(); captureRouteException.mockReset() })
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
  it('switches market views rapidly with one current panel and no catalogue panel measurement', async () => {
    const { router } = show({ view: 'tools' })
    const observedTargets: Element[] = []
    const observe = vi.spyOn(ResizeObserver.prototype, 'observe').mockImplementation(target => { observedTargets.push(target) })
    let panelRectCalls = 0
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'tabpanel') panelRectCalls += 1
      return originalGetBoundingClientRect.call(this)
    })
    try {
      const cases = [
        { view: 'providers', label: 'Directory Hosts', check: () => expect(screen.getByRole('button', { name: 'View Tools from example.com' })).toBeTruthy() },
        { view: 'discover', label: 'Explore', check: () => expect(screen.getByRole('heading', { name: 'Explore Tools' })).toBeTruthy() },
        { view: 'tools', label: 'Tools', check: () => expect(screen.getByRole('table', { name: 'Tools' })).toBeTruthy() },
      ] as const

      for (const item of cases) {
        fireEvent.click(screen.getByRole('tab', { name: item.label }))
        await waitFor(() => expect(router.state.location.search.view).toBe(item.view))

        const panels = screen.getAllByRole('tabpanel')
        expect(panels).toHaveLength(1)
        expect(panels[0]!.getAttribute('data-state')).toBe('active')
        expect(screen.getAllByRole('tab').filter(tab => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1)
        expect(screen.getByRole('tab', { name: item.label }).getAttribute('aria-selected')).toBe('true')
        item.check()
      }

      expect(observedTargets.some(target => target.getAttribute('role') === 'tabpanel')).toBe(false)
      expect(panelRectCalls).toBe(0)
    } finally {
      getBoundingClientRect.mockRestore()
      observe.mockRestore()
    }
  })
  it('uses real tab links with scoped owner-market destinations and reads Saved once across tab changes', async () => {
    listSavedToolsForOwner.mockReturnValue(new Promise(() => {}))
    const compare = entries[0]!.resource
    const search = { view: 'tools' as const, provider: 'example.com', network: 'eip155:8453', maxUsdPrice: 0.005, layout: 'grid' as const, compare }
    const { router } = show(search, entries, { marketPath: '/owner/market' })
    const tabUrl = (name: string | RegExp) => {
      const tab = screen.getByRole('tab', { name })
      expect(tab.tagName).toBe('A')
      return new URL((tab as HTMLAnchorElement).href)
    }

    const discover = tabUrl('Collections')
    expect(discover.pathname).toBe('/owner/market')
    expect(discover.searchParams.get('view')).toBe('discover')
    expect(discover.searchParams.get('compare')).toBe(compare)
    expect(discover.searchParams.get('layout')).toBe('grid')
    expect(discover.searchParams.has('provider')).toBe(false)
    expect(discover.searchParams.has('network')).toBe(false)

    const tools = tabUrl('Tools')
    expect(tools.pathname).toBe('/owner/market')
    expect(tools.searchParams.get('view')).toBe('tools')
    expect(tools.searchParams.get('provider')).toBe('example.com')
    expect(tools.searchParams.get('network')).toBe('eip155:8453')
    expect(tools.searchParams.get('maxUsdPrice')).toBe('0.005')
    expect(tools.searchParams.get('compare')).toBe(compare)
    expect(tools.searchParams.get('layout')).toBe('grid')

    const providers = tabUrl('Directory Hosts')
    expect(providers.pathname).toBe('/owner/market')
    expect(providers.searchParams.get('view')).toBe('providers')
    expect(providers.searchParams.get('provider')).toBe('example.com')
    expect(providers.searchParams.get('network')).toBe('eip155:8453')
    expect(providers.searchParams.get('maxUsdPrice')).toBe('0.005')
    expect(providers.searchParams.get('compare')).toBe(compare)

    const saved = tabUrl(/Saved/)
    expect(saved.pathname).toBe('/owner/market')
    expect(saved.searchParams.get('view')).toBe('saved')
    expect(saved.searchParams.get('compare')).toBe(compare)
    expect(saved.searchParams.get('layout')).toBe('grid')
    expect(saved.searchParams.has('provider')).toBe(false)
    expect(saved.searchParams.has('network')).toBe(false)

    await waitFor(() => expect(listSavedToolsForOwner).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('tab', { name: /Saved/ }), { button: 0, ctrlKey: true })
    expect(router.state.location.pathname).toBe('/owner/market')
    expect(router.state.location.search.view).toBe('tools')

    fireEvent.click(screen.getByRole('tab', { name: /Saved/ }))
    await waitFor(() => expect(router.state.location.search.view).toBe('saved'))
    const savedLoading = screen.getByRole('status', { name: 'Loading saved Tools' })
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(Array.from(savedLoading.children).filter(child => child.getAttribute('aria-hidden') === 'true')).toHaveLength(3)

    fireEvent.click(screen.getByRole('tab', { name: 'Directory Hosts' }))
    await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
    fireEvent.click(screen.getByRole('tab', { name: /Saved/ }))
    await waitFor(() => expect(router.state.location.search.view).toBe('saved'))
    expect(listSavedToolsForOwner).toHaveBeenCalledTimes(1)
  })
  it('preloads the Market loader once on hover and arrow focus, reuses it on Enter or Space, and skips whole-page transitions', async () => {
    expect(ProductionMarketRoute.options.staleTime).toBe(30_000)
    expect(ProductionMarketRoute.options.preloadStaleTime).toBe(30_000)
    const originalTransitionDescriptor = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
    const startViewTransition = vi.fn((callback: () => void) => {
      callback()
      return { finished: Promise.resolve() }
    })
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition })
    try {
      const routeLoader = vi.fn((_deps: ReturnType<typeof marketLoaderDeps>) => undefined)
      const { router } = show({ view: 'tools' }, entries, {}, routeLoader)
      await router.load()
      expect(routeLoader).toHaveBeenCalledTimes(1)
      routeLoader.mockClear()
      startViewTransition.mockClear()

      const toolsTab = screen.getByRole('tab', { name: 'Tools' })
      const providersTab = screen.getByRole('tab', { name: 'Directory Hosts' })
      fireEvent.mouseEnter(providersTab)
      await waitFor(() => expect(routeLoader).toHaveBeenCalledTimes(1))
      toolsTab.focus()
      fireEvent.keyDown(toolsTab, { key: 'ArrowRight' })
      await waitFor(() => expect(document.activeElement).toBe(providersTab))
      expect(toolsTab.getAttribute('aria-selected')).toBe('true')
      expect(router.state.location.search.view).toBe('tools')
      expect(routeLoader).toHaveBeenCalledTimes(1)

      fireEvent.keyDown(providersTab, { key: 'Enter' })
      // JSDOM does not synthesize the native anchor click that a browser fires for Enter.
      fireEvent.click(providersTab)
      await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
      expect(routeLoader).toHaveBeenCalledTimes(1)
      expect(startViewTransition).not.toHaveBeenCalled()

      const savedTab = screen.getByRole('tab', { name: /Saved/ })
      fireEvent.keyDown(providersTab, { key: 'ArrowRight' })
      await waitFor(() => expect(document.activeElement).toBe(savedTab))
      expect(providersTab.getAttribute('aria-selected')).toBe('true')
      expect(router.state.location.search.view).toBe('providers')
      await waitFor(() => expect(routeLoader).toHaveBeenCalledTimes(2))
      fireEvent.keyDown(savedTab, { key: ' ' })
      await waitFor(() => expect(router.state.location.search.view).toBe('saved'))
      expect(routeLoader).toHaveBeenCalledTimes(2)
      expect(startViewTransition).not.toHaveBeenCalled()
    } finally {
      if (originalTransitionDescriptor === undefined) Reflect.deleteProperty(document, 'startViewTransition')
      else Object.defineProperty(document, 'startViewTransition', originalTransitionDescriptor)
    }
  })
  it('keeps BaseUI manual keyboard activation and replaces rapid pending views with their loaded data', async () => {
    const { rerender, router } = show({ view: 'discover' }, entries, { pendingView: 'tools' })
    const renderRoute = (search: Props['search'], pendingView?: Props['pendingView']) => rerender(
      <RouterContextProvider router={router}><Directory
        page={{ kind: 'ok', items: entries, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
        compareEntries={[]} search={search} {...(pendingView === undefined ? {} : { pendingView })} /></RouterContextProvider>,
    )

    expect(screen.getByRole('tab', { name: 'Tools' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Loading Tools…')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('tabpanel').querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()
    expect(screen.queryByText('14,455 Tools')).toBeNull()
    expect(searchMarketToolsServer).not.toHaveBeenCalled()
    expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()

    renderRoute({ view: 'discover' }, 'providers')
    expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Loading Providers…')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'View Tools from example.com' })).toBeNull()
    expect(searchMarketToolsServer).not.toHaveBeenCalled()
    expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()

    renderRoute({ view: 'discover' }, 'discover')
    expect(screen.getByRole('tab', { name: 'Explore' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('Loading market…')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()

    renderRoute({ view: 'discover' }, 'saved')
    expect(screen.getByRole('tab', { name: /Saved/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toBe('Loading saved Tools…')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()

    renderRoute({ view: 'discover' }, 'providers')
    await router.navigate({ to: '/market', search: { view: 'providers' } })
    renderRoute({ view: 'providers' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'View Tools from example.com' })).toBeTruthy())
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).not.toBe('true')
    expect(screen.queryByRole('status', { name: 'Loading Providers…' })).toBeNull()

    const providersTab = screen.getByRole('tab', { name: 'Directory Hosts' })
    providersTab.focus()
    fireEvent.keyDown(providersTab, { key: 'ArrowRight' })
    const savedTab = screen.getByRole('tab', { name: /Saved/ })
    expect(savedTab.getAttribute('tabindex')).toBe('0')
    expect(providersTab.getAttribute('aria-selected')).toBe('true')
    expect(router.state.location.search.view).toBe('providers')
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

it('compares sourced prices and activity in an Arc matrix while retaining material facts in differences mode', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC`, decimalAmount: String(index + 1), symbol: 'USDC' }], outputSummary: `Output ${index}`, ...(index === 0 ? { activity: { calls30d: 66 } } : {}) }))
  show(undefined, priced)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  expect((screen.getByRole('button', { name: 'Compare Tools' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare Tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare Tools' })
  const matrix = within(comparison).getByRole('table', { name: 'Find the better fit' })
  expect(within(matrix).getByText(/Provider lists 1 USDC/)).toBeTruthy()
  expect(within(matrix).getByText(/Provider lists 2 USDC/)).toBeTruthy()
  expect(within(matrix).getByText('Coinbase Bazaar reported calls · 30 days')).toBeTruthy()
  expect(within(matrix).getByText('66')).toBeTruthy()
  expect(within(matrix).getByText('Not reported')).toBeTruthy()
  expect(within(matrix).getByText('Output 0')).toBeTruthy()
  expect(within(matrix).getByText('Category or capability')).toBeTruthy()
  const inspect = within(matrix).getAllByRole('link', { name: 'Inspect Tool' })
  expect(inspect).toHaveLength(2)
  expect(toolHref(inspect[0]!).pathname).toBe(`/tools/${priced[0]!.provider}/${priced[0]!.slug}`)
  expect(toolHref(inspect[1]!).pathname).toBe(`/tools/${priced[1]!.provider}/${priced[1]!.slug}`)
  fireEvent.click(within(comparison).getByRole('switch', { name: 'Only differences' }))
  expect(within(matrix).queryByText('Category or capability')).toBeNull()
  expect(within(matrix).getByText('Access')).toBeTruthy()
  expect(within(matrix).getByText('Price context')).toBeTruthy()
  expect(within(matrix).getByText(/Provider lists 1 USDC/)).toBeTruthy()
  expect(within(matrix).getAllByText('Metadata provenance not stated')).toHaveLength(2)
})
it('accumulates rapid comparison selections and keeps the current collection view', async () => {
  const { router } = show({ view: 'discover' }, entries, { home: { observedAt: '2026-10-01', rails: [{ id: 'adoption', title: 'Most used', subtitle: 'Most used', sort: 'adoption', items: entries.slice(0, 6) }] } })
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: `Add Tool ${i} to comparison` }))
  await waitFor(() => expect(router.state.location.search.compare).toBe(entries.slice(0, 4).map(entry => entry.resource).join(',')))
  expect(router.state.location.search.view).toBe('discover')
})
it('keeps the latest tab and filters when a comparison control outlives navigation', async () => {
  const { router } = show({ view: 'tools' })
  const compare = screen.getByRole('button', { name: 'Add Tool 0 to comparison' })
  void router.navigate({ to: '/market', search: { view: 'providers', network: 'eip155:8453' } })
  fireEvent.click(compare)
  await waitFor(() => expect(router.state.location.search.compare).toBe(entries[0]!.resource))
  expect(router.state.location.search.view).toBe('providers')
  expect(router.state.location.search.network).toBe('eip155:8453')
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
  expect(buyerPrice?.textContent).toBe('US$1')
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

it('submits a trimmed catalogue query while preserving refinements and comparison', async () => {
  searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'match', results: [] })
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', network: 'eip155:8453', compare, layout: 'grid' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Tools' }), { target: { value: '  weather forecasts  ' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Search the Tool market' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ query: 'weather forecasts', sort: 'relevance', network: 'eip155:8453', compare, layout: 'grid' }))
  expect(router.state.location.pathname).toBe('/market')
})
it('refuses an oversized catalogue query and returns focus without navigating', () => {
  const { router } = show({ view: 'tools' })
  const input = screen.getByRole('searchbox', { name: 'Search Tools' })
  fireEvent.change(input, { target: { value: 'x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1) } })
  fireEvent.submit(screen.getByRole('form', { name: 'Search the Tool market' }))
  expect(screen.getByRole('alert').textContent).toContain(`Use ${SEARCH_QUERY_MAX_LENGTH} characters or fewer`)
  expect(document.activeElement).toBe(input)
  expect((input as HTMLInputElement).value).toBe('x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1))
  expect(router.state.location.search).not.toHaveProperty('query')
})
it('explicitly sends the latest need and constraints to chat without deleting the previous guest session', async () => {
  searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'match', results: [] })
  window.sessionStorage.setItem('ae.chat.anonymous.active', 'previous')
  window.sessionStorage.setItem('ae.chat.anonymous.previous', 'history')
  const { router } = show({ network: 'eip155:8453', query: 'weather' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search Tools' }), { target: { value: 'A forecast for Perth' } })
  fireEvent.click(screen.getByRole('link', { name: 'Send to Agent' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/t/new'))
  expect(router.state.location.search.q).toContain('A forecast for Perth')
  expect(router.state.location.search.q).toContain('eip155:8453')
  expect(router.state.location.search.q).toContain('not permission to make a purchase')
  expect(window.sessionStorage.getItem('ae.chat.anonymous.active')).toBe('previous')
  expect(window.sessionStorage.getItem('ae.chat.anonymous.previous')).toBe('history')
})
it('preserves the guest session when the Agent link opens in another tab', () => {
  window.sessionStorage.setItem('ae.chat.anonymous.active', 'previous')
  show()
  const stopNavigation = (event: MouseEvent) => event.preventDefault()
  document.body.addEventListener('click', stopNavigation)
  try {
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) fireEvent.click(screen.getByRole('link', { name: 'Ask an Agent' }), { [modifier]: true })
    expect(window.sessionStorage.getItem('ae.chat.anonymous.active')).toBe('previous')
  } finally { document.body.removeEventListener('click', stopNavigation); window.sessionStorage.clear() }
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

  expect(screen.getByText('Selected Tool unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove unavailable Tool from comparison' }))
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty('compare'))
})
it('does not call an URL selection unavailable while its loader hydration is pending', () => {
  const resource = 'https://example.com/tool/loading'
  show({ compare: resource }, entries.slice(0, 2))

  expect(screen.getByText('Loading selected Tool…')).toBeTruthy()
  expect(screen.queryByText('Selected Tool unavailable')).toBeNull()
})
it('carries workspace discovery constraints into chat without catalogue pagination', async () => {
  const { router } = show({ offset: 20, network: 'eip155:8453' }, entries, { workspace: true, marketPath: '/owner/market' })
  expect(screen.getByRole('heading', { level: 2, name: 'Find a Tool for the job.' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toContain('/owner/market')
  fireEvent.click(screen.getByRole('link', { name: 'Ask an Agent' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/t/new'))
  expect(router.state.location.search.q).toContain('eip155:8453')
  expect(router.state.location.search.q).not.toContain('offset')
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
  expect(cataloguePages.compareDocumentPosition(tray!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

const coverage = { source: 'coinbase' as const, generation: 'generation-1', indexedTotal: 14455, reportedTotal: 14455, reportedTotalAtStart: 14455, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 145, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' as const }
const indexedPage = { kind: 'ok' as const, items: entries.slice(0, 2), offset: 0, limit: 20 }
const indexedCatalogue = { kind: 'ok' as const, source: 'index' as const, page: indexedPage, coverage, searchMethod: 'native_index' as const, indexCursor: 'generation-1:next/page+cursor', isDone: false }
const overview = { kind: 'ok' as const, coverage, categories: [{ key: 'research', label: 'Research', count: 201 }, { key: 'media', label: 'Media', count: 405 }], providers: [], networks: [{ key: 'eip155:8453', label: 'Base', count: 14455 }], popular: [], recentlyUpdated: [] }
const nativeFilters = { view: 'tools' as const, network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005, directoryCategory: 'research' }

it('loads Provider keyword results from the indexed catalogue with their refinements', async () => {
  readX402DirectoryCatalogueServer.mockResolvedValue(indexedCatalogue)
  readX402DirectoryCatalogueOverviewServer.mockResolvedValue(overview)
  const search = validateMarketSearch({ ...nativeFilters, view: 'providers', query: 'research', sort: 'relevance', layout: 'grid' })
  const result = await loadMarketRouteData(marketLoaderDeps(search))
  expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: {
    network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005, directoryCategory: 'research', query: 'research', sort: 'relevance',
  } })
  expect(result.catalogue).toBe(indexedCatalogue)
  expect(result.page).toBe(indexedPage)
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('presents Provider keyword matches as Providers and explains the indexed search', async () => {
  show({ view: 'providers', query: 'research', sort: 'relevance' }, [], {
    page: indexedPage, catalogue: { ...indexedCatalogue, isDone: true }, overview, jevRecipient: 'TypeSafe (api.typesafe.ai)',
  })
  expect(await screen.findByRole('button', { name: 'View Tools from example.com' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Directory Host results' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Directory Hosts matching “research”' })).toBeTruthy()
  expect(screen.getByText('Matching published listings, grouped by Provider.')).toBeTruthy()
  expect(screen.getByText('Search matches directory Host names and published listing descriptions in the catalogue.')).toBeTruthy()
  expect(screen.queryByText(/go to TypeSafe/)).toBeNull()
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it.each([false, true])('submits Provider search to the selected view, including a pending view: %s', async pending => {
  const compare = entries[0]!.resource
  const { router } = show({ view: pending ? 'tools' : 'providers', network: 'eip155:8453', compare, layout: 'grid' }, [], {
    ...(pending ? { pendingView: 'providers' } : {}),
    page: indexedPage, catalogue: { ...indexedCatalogue, isDone: true }, overview,
  })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search directory Hosts' }), { target: { value: '  research  ' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Search the Tool market' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({
    view: 'providers', query: 'research', sort: 'relevance', network: 'eip155:8453', compare, layout: 'grid',
  }))
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('continues an empty Provider keyword page with the same filters before declaring no matches', async () => {
  const emptyPage = { ...indexedPage, items: [] }
  readX402DirectoryCatalogueServer.mockResolvedValueOnce({ ...indexedCatalogue, page: emptyPage, indexCursor: 'generation-1:empty-1' })
  readX402DirectoryCatalogueServer.mockResolvedValue({ ...indexedCatalogue, page: indexedPage, isDone: true })
  show({ view: 'providers', query: 'research', sort: 'relevance', network: 'eip155:8453' }, [], {
    page: emptyPage, catalogue: { ...indexedCatalogue, page: emptyPage }, overview,
  })
  expect(screen.getByText('More of the catalogue remains')).toBeTruthy()
  expect(screen.queryByText('No matching directory Hosts')).toBeNull()
  await waitFor(() => expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByRole('button', { name: 'View Tools from example.com' })).toBeTruthy()
  expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: {
    query: 'research', sort: 'relevance', network: 'eip155:8453', indexCursor: 'generation-1:empty-1',
  } })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('declares no matching Providers only after the indexed search is complete', () => {
  const page = { ...indexedPage, items: [] }
  show({ view: 'providers', query: 'research', sort: 'relevance' }, [], {
    page, catalogue: { ...indexedCatalogue, page, isDone: true }, overview,
  })
  expect(screen.getByText('No matching directory Hosts')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

function pageLinkSearch(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai').searchParams }
function expectNativeFilters(search: URLSearchParams) {
  for (const [key, value] of Object.entries(nativeFilters)) expect(search.get(key)).toBe(String(value))
}

it.each([true, false, undefined])('routes reviewed-provider keyword search through the filtered catalogue only when enabled: %s', async reviewedProvidersOnly => {
  readX402DirectoryCatalogueServer.mockResolvedValue(indexedCatalogue)
  readX402DirectoryCatalogueOverviewServer.mockResolvedValue(overview)
  const search = validateMarketSearch({ view: 'tools', query: 'research', reviewedProvidersOnly })
  const result = await loadMarketRouteData(marketLoaderDeps(search))
  if (reviewedProvidersOnly === true) {
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: { query: 'research', reviewedProvidersOnly: true } })
    expect(result.catalogue).toBe(indexedCatalogue)
  } else {
    expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
    expect(result.catalogue).toEqual({ kind: 'unavailable', reason: 'canonical_search' })
  }
})

it.each([false, true])('continues reviewed-provider keyword pages without mixed search, including an empty native page: %s', async emptyPage => {
  const page = { ...indexedPage, items: emptyPage ? [] : [entries[0]!] }
  const nextPage = { ...indexedPage, items: [entries[1]!] }
  readX402DirectoryCatalogueServer.mockResolvedValue({ ...indexedCatalogue, page: nextPage, isDone: true })
  show({ view: 'tools', query: 'research', reviewedProvidersOnly: true }, [], {
    page, catalogue: { ...indexedCatalogue, page, searchMethod: 'native_full_text' }, overview, jevRecipient: 'TypeSafe (api.typesafe.ai)',
  })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  if (emptyPage) expect(screen.getByText('More of the catalogue remains')).toBeTruthy()
  else expect(screen.getByRole('link', { name: 'Tool 0' })).toBeTruthy()
  expect(screen.getByText('Published listings from reviewed providers')).toBeTruthy()
  expect(screen.getByText('Search matches published listings from reviewed providers.')).toBeTruthy()
  expect(screen.queryByText(/not applied to this search/)).toBeNull()
  expect(screen.queryByText(/go to TypeSafe/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByRole('link', { name: 'Tool 1' })).toBeTruthy()
  expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: {
    query: 'research', reviewedProvidersOnly: true, indexCursor: indexedCatalogue.indexCursor,
  } })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('validates alternative identity and preserves it in Market loader dependencies', () => {
  const search = validateMarketSearch({ view: 'tools', query: 'weather forecast', alternativeTo: ' source-route:current ' })
  expect(search.alternativeTo).toBe('source-route:current')
  expect(marketLoaderDeps(search).alternativeTo).toBe('source-route:current')
  expect(validateMarketSearch({ view: 'tools', alternativeTo: 'source-route:current' })).toEqual({ view: 'tools' })
  expect(validateMarketSearch({ view: 'tools', query: 'weather', alternativeTo: '   ' })).toEqual({ view: 'tools', query: 'weather' })
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

it('discloses the Market search recipient once beside the header field', () => {
  show({ view: 'tools' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview, chatRecipient: 'OpenRouter', jevRecipient: 'TypeSafe (api.typesafe.ai)' })
  expect(screen.getByText('Search query and candidate Tool text go to TypeSafe (api.typesafe.ai).')).toBeTruthy()
  expect(screen.getAllByRole('searchbox', { name: 'Search Tools' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(within(screen.getByRole('dialog', { name: 'Refine Tools' })).queryByRole('searchbox', { name: 'Search Tools' })).toBeNull()
})

describe('indexed x402 catalogue controls', () => {
  it('keeps category, price and directory Host refinements visible while networks and published details remain advanced', () => {
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    expect(screen.getByRole('combobox', { name: 'Provider category' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Provider-listed price · USDC' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Advanced filters' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('combobox', { name: 'Network' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Directory Hosts' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Advanced filters' }))
    expect(screen.getByRole('combobox', { name: 'Network' })).toBeTruthy()
    expect(screen.getByLabelText('Directory Hosts')).toBeTruthy()
    expect(screen.getByText('Published details')).toBeTruthy()
  })

  it('opens Advanced filters when an advanced refinement is already active', () => {
    show({ view: 'tools', network: 'eip155:8453' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: 'Filters 1' }))

    expect(screen.getByRole('button', { name: 'Advanced filters 1 active' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('combobox', { name: 'Network' })).toBeTruthy()
  })

  it('never puts the Convex page cursor in the market URL and offers a next page instead', () => {
    show({ ...nativeFilters, sort: 'adoption' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'First page' })).toBeNull()
    for (const link of screen.getAllByRole('link')) expect(new URL(link.getAttribute('href')!, 'https://aecon.ai').searchParams.has('indexCursor')).toBe(false)
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull()
    const ordering = screen.getByRole('group', { name: 'Catalogue ordering and display' })
    expect(within(ordering).getByRole('combobox', { name: /Sort results/ }).textContent).toContain('Most used')
    expect(within(ordering).getByRole('group', { name: 'Result layout' })).toBeTruthy()
    expect(within(ordering).getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('group', { name: 'Applied catalogue filters' })).getByRole('button', { name: /^Filters/ })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Catalogue pages' })).toBeTruthy()
  })
  it('replaces the list with the next page, then returns to the first page without another request', async () => {
    const nextItems = entries.slice(2, 4)
    readX402DirectoryCatalogueServer.mockResolvedValue({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { kind: 'ok', items: nextItems, offset: 0, limit: 20 }, indexCursor: 'generation-1:page-3', isDone: false,
    })
    const { router } = show({ ...nativeFilters, sort: 'relevance' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.getByText(/2 Tools on this page/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const { view: _view, ...filtersWithoutView } = nativeFilters
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith({ data: { ...filtersWithoutView, sort: 'relevance', indexCursor: indexedCatalogue.indexCursor } })
    await waitFor(() => expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    expect(screen.getByText(/2 Tools on this page/)).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: 2 }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByRole('link', { name: 'Tool 0' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: nextItems[0]!.title })).toBeNull()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(router.state.location.search.page).toBeUndefined())

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)
  })

  it('walks forward to a shared page number without putting the index cursor in the URL', async () => {
    const nextItems = entries.slice(2, 4)
    readX402DirectoryCatalogueServer.mockResolvedValue({
      kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
      page: { kind: 'ok', items: nextItems, offset: 0, limit: 20 }, indexCursor: 'generation-1:page-3', isDone: false,
    })
    const { router } = show({ view: 'tools', page: 2 }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    await waitFor(() => expect(screen.getByRole('link', { name: nextItems[0]!.title })).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
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
  it('does not publish an old catalogue page into the URL while another tab is pending', async () => {
    let resolveContinuation: (value: unknown) => void = () => undefined
    readX402DirectoryCatalogueServer.mockImplementation(() => new Promise(resolve => { resolveContinuation = resolve }))
    const { router, rerender } = show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)

    rerender(<RouterContextProvider router={router}><Directory
      page={indexedPage} compareEntries={[]} search={{ view: 'tools' }} pendingView="providers" catalogue={indexedCatalogue} overview={overview} /></RouterContextProvider>)
    expect(screen.getByRole('status').textContent).toBe('Loading Providers…')

    await act(async () => {
      resolveContinuation({
        kind: 'ok', source: 'index', coverage, searchMethod: 'native_index',
        page: { ...indexedPage, items: entries.slice(2, 4) }, indexCursor: 'generation-1:page-3', isDone: true,
      })
    })
    expect(screen.getByRole('status').textContent).toBe('Loading Providers…')
    expect(router.state.location.search).toMatchObject({ view: 'tools' })
    expect(router.state.location.search).not.toHaveProperty('page')
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledTimes(1)
  })
  it('changes category through its control while preserving filters, without ever adding a cursor', async () => {
    searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'scoped', results: [], reason: 'More pages remain.' })
    const { router } = show({ ...nativeFilters, query: 'weather', sort: 'relevance' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: /Filters \d+/u }))
    fireEvent.focus(screen.getByRole('combobox', { name: 'Provider category' }))
    fireEvent.click(screen.getByRole('option', { name: 'Media' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, query: 'weather', sort: 'relevance', directoryCategory: 'media' }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
  })
  it('changes catalogue sort through the Arc select while preserving filters, without ever adding a cursor', async () => {
    const { router } = show({ ...nativeFilters, sort: 'popular' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('combobox', { name: /Sort results/ }))
    const option = await screen.findByRole('option', { name: 'Recently paid' })
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.click(option, { detail: 1 })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, sort: 'active' }))
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
    next: [{ action: 'registry.tools.describe', args: { toolRef: admittedRef }, authority: 'public' }],
    freshness: { source: 'supply_projection', state: 'fresh', completedAt: Date.UTC(2026, 8, 27), staleAfterMs: 10800000 },
  },
  {
    id: directoryId, source: 'coinbase', access: 'external_listing',
    title: 'External Forecast', summary: 'Published weather endpoint', provider: 'example.com',
    actionClass: 'retrieve', objectClass: 'data', readiness: 'unverified',
    sourcePrice: '1 USDC',
    price: { kind: 'indicative', label: 'US$1' }, detailRef: `/api/v1/registry/detail?id=${directoryId}`,
    next: [],
    freshness: { source: 'x402_directory', state: 'stale', completedAt: Date.UTC(2026, 8, 26), staleAfterMs: 10800000 },
  },
] satisfies SearchResult[]
const searchMeta = {
  schemaVersion: PublicToolRegistrySchemaVersion,
  query: 'weather', partialResults: true,
  assessed: { source: 'all', scope: 'page', examined: 8, coverage: 'partial', generation: 'generation-1', completedAt: Date.UTC(2026, 8, 26) },
  pagination: { limit: 8, nextCursor: 'opaque-next', hasMore: true },
  next: [{ action: 'registry.tools.search', args: { query: 'weather', cursor: 'opaque-next' }, authority: 'public' }],
} satisfies Pick<Extract<ToolChoiceSearchOutput, { kind: 'match' }>, 'schemaVersion' | 'query' | 'partialResults' | 'assessed' | 'pagination' | 'next'>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('canonical Market search', () => {
  it('keeps the initial canonical-search skeleton decorative inside its named status', () => {
    searchMarketToolsServer.mockReturnValue(new Promise(() => {}))
    show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const status = screen.getByRole('status', { name: 'Searching admitted Tools and Coinbase Bazaar' })
    expect(status.textContent).toContain('Searching admitted Tools and Coinbase Bazaar…')
    expect(status.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.getAllByRole('status').filter(region => region.getAttribute('aria-busy') === 'true')).toHaveLength(1)
    expect(within(status).queryByRole('status')).toBeNull()
  })
  it('keeps a successful canonical result across a Providers tab round trip without searching again', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValue(first)
    const { router, updateSearch } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })

    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    updateSearch({ view: 'providers', query: 'weather' })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'providers', query: 'weather' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByRole('button', { name: 'View Tools from example.com' })).toBeTruthy()

    updateSearch({ view: 'tools', query: 'weather' })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'tools', query: 'weather' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Tools' }).getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(1)
    expect(recordProductJourney.mock.calls.filter(([event]) => event.action === 'search_observed')).toEqual([
      [{ action: 'search_observed', phase: 'observed', surface: 'market', queryLength: 7, resultCount: searchRows.length }],
    ])
  })
  it('reuses a still-pending initial query across a Providers tab round trip', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    const pending = deferred<ToolChoiceSearchOutput>()
    searchMarketToolsServer.mockReturnValue(pending.promise)
    const { router, updateSearch } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    await waitFor(() => expect(searchMarketToolsServer).toHaveBeenCalledTimes(1))

    updateSearch({ view: 'providers', query: 'weather' })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'providers', query: 'weather' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true'))
    updateSearch({ view: 'tools', query: 'weather' })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'tools', query: 'weather' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Tools' }).getAttribute('aria-selected')).toBe('true'))
    const callsWhilePending = searchMarketToolsServer.mock.calls.length

    await act(async () => { pending.resolve(first) })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(callsWhilePending).toBe(1)
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(1)
  })
  it('ignores a rejected initial search after the Market component unmounts', async () => {
    const pending = deferred<ToolChoiceSearchOutput>()
    const failure = new Error('unmounted initial search failed')
    searchMarketToolsServer.mockReturnValue(pending.promise)
    const { unmount } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    await waitFor(() => expect(searchMarketToolsServer).toHaveBeenCalledTimes(1))

    unmount()
    await act(async () => { pending.reject(failure) })

    expect(captureRouteException).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Weather Forecast' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(recordProductJourney.mock.calls.filter(([event]) => event.action === 'search_observed')).toEqual([])
  })
  it('restores the second loaded search page after a fresh tab round trip without another fetch', async () => {
    const first = { ...searchMeta, kind: 'match', results: [searchRows[0]!] } satisfies ToolChoiceSearchOutput
    const second = { ...searchMeta, kind: 'scoped', results: [searchRows[1]!], reason: 'More catalogue entries remain.' } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValue(first)
    const { router, updateSearch } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByRole('link', { name: 'External Forecast' })).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()

    updateSearch({ view: 'providers', query: 'weather' })
    await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true'))
    updateSearch({ view: 'tools', query: 'weather' })
    await waitFor(() => expect(router.state.location.search.view).toBe('tools'))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Tools' }).getAttribute('aria-selected')).toBe('true'))

    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'External Forecast' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Weather Forecast' })).toBeNull()
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(2)
  })
  it('admits one continuation when Next page is activated twice in the same batch', async () => {
    const first = { ...searchMeta, kind: 'match', results: [searchRows[0]!] } satisfies ToolChoiceSearchOutput
    const second = {
      ...searchMeta, kind: 'match', results: [searchRows[1]!],
      pagination: { limit: 8, hasMore: false }, next: [],
    } satisfies ToolChoiceSearchOutput
    const pendingNext = deferred<ToolChoiceSearchOutput>()
    searchMarketToolsServer.mockResolvedValue(first).mockResolvedValueOnce(first).mockReturnValueOnce(pendingNext.promise)
    show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    const nextPage = screen.getByRole('button', { name: 'Next page' })

    await act(async () => {
      fireEvent.click(nextPage)
      fireEvent.click(nextPage)
    })
    await waitFor(() => expect(searchMarketToolsServer).toHaveBeenCalledTimes(2))
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(2, { data: { query: 'weather', limit: 8, cursor: 'opaque-next' } })

    await act(async () => { pendingNext.resolve(second) })
    expect(await screen.findByRole('link', { name: 'External Forecast' })).toBeTruthy()
    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(screen.queryByText('Page 3')).toBeNull()
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(2)
  })
  it('retains known rows while an expired search refreshes, then replaces them with the refreshed first page', async () => {
    const first = { ...searchMeta, kind: 'match', results: [searchRows[0]!] } satisfies ToolChoiceSearchOutput
    const refreshed = { ...searchMeta, kind: 'match', results: [{ ...searchRows[0]!, title: 'Fresh Weather' }] } satisfies ToolChoiceSearchOutput
    const pendingRefresh = deferred<ToolChoiceSearchOutput>()
    const start = Date.UTC(2026, 9, 5)
    let now = start
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    searchMarketToolsServer.mockResolvedValueOnce(first).mockReturnValueOnce(pendingRefresh.promise)
    const { router, updateSearch } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    try {
      expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
      now += 30_001

      updateSearch({ view: 'providers', query: 'weather' })
      await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true'))
      updateSearch({ view: 'tools', query: 'weather' })
      await waitFor(() => expect(router.state.location.search.view).toBe('tools'))
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Tools' }).getAttribute('aria-selected')).toBe('true'))
      expect(await screen.findByRole('status', { name: 'Refreshing search results' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
      expect(searchMarketToolsServer).toHaveBeenCalledTimes(2)

      await act(async () => { pendingRefresh.resolve(refreshed) })
      expect(await screen.findByRole('link', { name: 'Fresh Weather' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Weather Forecast' })).toBeNull()
    } finally {
      nowSpy.mockRestore()
    }
  })
  it.each(['rejected', 'unavailable'] as const)('keeps known rows after an expired refresh is %s and lets Retry search replace them', async failureKind => {
    const first = { ...searchMeta, kind: 'match', results: [searchRows[0]!] } satisfies ToolChoiceSearchOutput
    const unavailable = {
      ...searchMeta, kind: 'unavailable', results: [], reason: 'source_unavailable',
      pagination: { limit: 8, hasMore: false }, next: [{ action: 'registry.tools.search', args: { query: 'weather' }, authority: 'public' }],
    } satisfies ToolChoiceSearchOutput
    const refreshed = { ...searchMeta, kind: 'match', results: [{ ...searchRows[0]!, title: 'Fresh Weather' }] } satisfies ToolChoiceSearchOutput
    const refreshFailure = new Error('refresh failed')
    const start = Date.UTC(2026, 9, 5)
    let now = start
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    searchMarketToolsServer.mockResolvedValueOnce(first)
    if (failureKind === 'rejected') searchMarketToolsServer.mockRejectedValueOnce(refreshFailure)
    else searchMarketToolsServer.mockResolvedValueOnce(unavailable)
    searchMarketToolsServer.mockResolvedValueOnce(refreshed)
    const { router, updateSearch } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    try {
      expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
      now += 30_001

      updateSearch({ view: 'providers', query: 'weather' })
      await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true'))
      updateSearch({ view: 'tools', query: 'weather' })
      await waitFor(() => expect(router.state.location.search.view).toBe('tools'))
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Tools' }).getAttribute('aria-selected')).toBe('true'))

      const failure = await screen.findByRole('alert')
      expect(failure.textContent).toMatch(/refresh/i)
      expect(screen.getByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Retry search' }))
      expect(await screen.findByRole('link', { name: 'Fresh Weather' })).toBeTruthy()
      expect(screen.queryByRole('link', { name: 'Weather Forecast' })).toBeNull()
      expect(searchMarketToolsServer).toHaveBeenCalledTimes(3)
    } finally {
      nowSpy.mockRestore()
    }
  })
  it.each(['resolve', 'reject'] as const)('ignores an obsolete next-page A request that completes by %s after an A-to-B-to-A search', async completion => {
    const firstA = { ...searchMeta, kind: 'match', results: [searchRows[0]!] } satisfies ToolChoiceSearchOutput
    const obsoletePage = { ...searchMeta, kind: 'match', results: [{ ...searchRows[1]!, title: 'Obsolete Weather' }] } satisfies ToolChoiceSearchOutput
    const resultB = { ...searchMeta, query: 'storm', kind: 'match', results: [{ ...searchRows[0]!, title: 'Storm Alert' }] } satisfies ToolChoiceSearchOutput
    const newestA = { ...searchMeta, kind: 'match', results: [{ ...searchRows[0]!, title: 'Newest Weather' }] } satisfies ToolChoiceSearchOutput
    const pendingNext = deferred<ToolChoiceSearchOutput>()
    const obsoleteFailure = new Error('obsolete next page failed')
    searchMarketToolsServer.mockResolvedValueOnce(firstA).mockReturnValueOnce(pendingNext.promise)
      .mockResolvedValueOnce(resultB).mockResolvedValueOnce(newestA)
    const { router, updateSearch } = show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })

    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(searchMarketToolsServer).toHaveBeenCalledTimes(2))
    updateSearch({ view: 'tools', query: 'storm' })
    await waitFor(() => expect(router.state.location.search.query).toBe('storm'))
    expect(await screen.findByRole('link', { name: 'Storm Alert' })).toBeTruthy()
    updateSearch({ view: 'tools', query: 'weather' })
    await waitFor(() => expect(router.state.location.search.query).toBe('weather'))
    expect(await screen.findByRole('link', { name: 'Newest Weather' })).toBeTruthy()

    if (completion === 'resolve') await act(async () => { pendingNext.resolve(obsoletePage) })
    else await act(async () => { pendingNext.reject(obsoleteFailure) })

    expect(screen.getByRole('link', { name: 'Newest Weather' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Obsolete Weather' })).toBeNull()
    expect(screen.getByText('Page 1')).toBeTruthy()
    expect(screen.queryByText('Page 2')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(captureRouteException).not.toHaveBeenCalled()
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(4)
  })
  it('replaces directory results with one mixed page, uses exact detail links, row-source freshness and an executable filtered cursor', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    const second = { ...searchMeta, kind: 'scoped', results: [searchRows[1]!], reason: 'More catalogue entries remain.', pagination: { limit: 8, hasMore: false }, next: [] } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    show({ view: 'tools', query: 'weather', directoryCategory: 'research', provider: 'example.com', network: 'eip155:8453', priceBand: 'lt_0_01' },
      entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Tool 0' })).toBeNull()
    expect(toolHref(screen.getByRole('link', { name: 'Weather Forecast' })).pathname).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(toolHref(screen.getByRole('link', { name: 'External Forecast' })).pathname).toBe('/api/v1/registry/detail')
    expect(screen.getByText('AE-callable · ready')).toBeTruthy()
    expect(screen.getByText('External listing · not AE-callable')).toBeTruthy()
    expect(screen.getByText('Indicative AUD · A$0.01')).toBeTruthy()
    expect(screen.getByText('Provider price · US$1')).toBeTruthy()
    expect(screen.getByText(/AE supply projection · fresh/)).toBeTruthy()
    expect(screen.getByText(/Coinbase Bazaar index · stale/)).toBeTruthy()
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(1, { data: { query: 'weather', limit: 8, filters: { category: 'research', provider: 'example.com', networkId: 'eip155:8453', priceBand: 'lt_0_01' } } })
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
      pagination: { limit: 8, hasMore: false }, next: [],
      query: 'impossible',
    })
    updateSearch({ view: 'tools', query: 'impossible' })
    expect(await screen.findByText('No eligible Tools matched.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Browse all Tools' }))
    await waitFor(() => expect(router.state.location.search.query).toBeUndefined())
  })

  it('renders unavailable without stale recommendations and retries the same query', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'unavailable', results: [], reason: 'source_unavailable', pagination: { limit: 8, hasMore: false }, next: [{ action: 'registry.tools.search', args: { query: 'weather' }, authority: 'public' }] })
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
  it('retains the current Market page when a continuation resolves unavailable and lets Next page retry', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    const unavailable = { ...searchMeta, kind: 'unavailable', results: [], reason: 'source_unavailable',
      pagination: { limit: 8, hasMore: false }, next: [{ action: 'registry.tools.search', args: { query: 'weather' }, authority: 'public' }] } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValueOnce(first).mockResolvedValueOnce(unavailable).mockResolvedValueOnce({
      ...searchMeta, kind: 'match', results: [searchRows[1]!], pagination: { limit: 8, hasMore: false },
      next: [],
    } satisfies ToolChoiceSearchOutput)
    show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The next page could not load; this page is unchanged. Try Next page again.')
    expect(screen.getByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next page. Retry' }))
    expect(await screen.findByText('Page 2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'External Forecast' })).toBeTruthy()
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
    const table = await screen.findByRole('table', { name: 'Canonical search results' })
    const setupRow = within(table).getByRole('row', { name: /Connect Weather/ })
    const inspect = within(setupRow).getByRole('link', { name: 'Connect Weather' })
    expect(toolHref(inspect).pathname).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    fireEvent.click(within(setupRow).getByRole('button', { name: 'Inspect Connect Weather' }))
    const details = await screen.findByRole('dialog')
    expect(within(details).getByText('Connect to call')).toBeTruthy()
    expect(within(details).getByText('Indicative AUD · A$0.01')).toBeTruthy()
    const listedPrice = within(details).getByText('Provider-listed source')
    expect(listedPrice.nextElementSibling?.textContent).toBe('0.000001 USDC')
    expect(screen.getByText(/Search query and candidate Tool text went to TypeSafe \(custom-gateway.example\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    const externalRow = within(table).getByRole('row', { name: /External Forecast/ })
    fireEvent.click(within(externalRow).getByRole('button', { name: 'Inspect External Forecast' }))
    expect(within(await screen.findByRole('dialog')).getByText('External listing · not AE-callable')).toBeTruthy()
  })
  it('saves exact admitted and Bazaar search identities without retaining listed prices', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput)
    saveToolForOwner.mockImplementation(async ({ data }: { data: { kind: string; toolRef?: string; id?: string } }) => ({
      kind: 'saved', identity: data.toolRef ? data : { kind: 'external_listing', resource: 'https://example.com/weather' }, createdAt: 1,
    }))
    show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const table = await screen.findByRole('table', { name: 'Canonical search results' })
    const admittedLink = within(table).getByRole('link', { name: 'Weather Forecast' })
    const externalLink = within(table).getByRole('link', { name: 'External Forecast' })
    const admitted = admittedLink.closest('tr')
    const external = externalLink.closest('tr')
    if (admitted === null || external === null) throw new Error('Missing canonical search result row')
    await waitFor(() => expect(within(admitted).getByRole('button', { name: 'Save Tool' })).toHaveProperty('disabled', false))
    fireEvent.click(within(admitted).getByRole('button', { name: 'Save Tool' }))
    await waitFor(() => expect(saveToolForOwner).toHaveBeenCalledWith({ data: { kind: 'ae_callable', toolRef: admittedRef } }))
    await waitFor(() => expect(within(external).getByRole('button', { name: 'Save Tool' })).toHaveProperty('disabled', false))
    fireEvent.click(within(external).getByRole('button', { name: 'Save Tool' }))
    await waitFor(() => expect(saveToolForOwner).toHaveBeenCalledWith({ data: { kind: 'external_listing', id: directoryId } }))
  })

  it('saves only an exhaustive no-match with its original search filters, never a scoped assessment', async () => {
    const filters = { view: 'tools' as const, query: 'missing-need', directoryCategory: 'weather' }
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, query: 'missing-need', kind: 'scoped', results: [], reason: 'More catalogue remains.' })
      .mockResolvedValueOnce({
        ...searchMeta, kind: 'noMatch', query: 'missing-need', results: [], reason: 'No matching Tool.',
        partialResults: false, assessed: { source: 'all', scope: 'complete', examined: 30, coverage: 'complete' },
        pagination: { limit: 8, hasMore: false }, next: [],
      } satisfies ToolChoiceSearchOutput)
    recordOwnerMarketDemand.mockResolvedValue({ kind: 'recorded', requestRef: 'request-1', query: 'missing-need', createdAt: 1 })
    const { updateSearch } = show(filters, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    await screen.findByText('More catalogue remains.')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    updateSearch({ ...filters, provider: 'example.com' })
    await screen.findByText('No matching Tool.')
    const saveNeed = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(saveNeed).toHaveProperty('disabled', false))
    fireEvent.click(saveNeed)
    await screen.findByText('Waiting for matching supply')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    expect(recordOwnerMarketDemand).toHaveBeenCalledOnce()
    expect(recordOwnerMarketDemand).toHaveBeenCalledWith({ data: {
      query: 'missing-need', filters: { category: 'weather', provider: 'example.com' }, idempotencyKey: expect.any(String),
    } })
  })

  it('keys unmet need saves by canonical source and filters, reusing a retry key without disabling a different scope', async () => {
    const verdict = {
      ...searchMeta, kind: 'noMatch', query: 'unserved', results: [], reason: 'No matching Tool.',
      partialResults: false, assessed: { source: 'all', scope: 'complete', examined: 30, coverage: 'complete' },
      pagination: { limit: 8, hasMore: false }, next: [],
    } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValue(verdict)
    const failure = new Error('temporary failure')
    recordOwnerMarketDemand.mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-a', query: 'unserved', createdAt: 1 })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-b', query: 'unserved', createdAt: 2 })
    const { updateSearch } = show({ view: 'tools', query: 'unserved', provider: 'first.example.com' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const firstButton = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(firstButton).toHaveProperty('disabled', false))
    fireEvent.click(firstButton)
    await screen.findByText('Waiting for matching supply')
    expect(screen.getByText('need-a')).toBeTruthy()
    const firstCall = recordOwnerMarketDemand.mock.calls[0]
    if (firstCall === undefined) throw new Error('First need Save did not run')
    const firstKey = firstCall[0].data.idempotencyKey
    updateSearch({ view: 'tools', query: 'unserved', provider: 'second.example.com' })
    const secondButton = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(secondButton).toHaveProperty('disabled', false))
    fireEvent.click(secondButton)
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain('Saving could not be confirmed. Check status before retrying.')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    expect(recordOwnerMarketDemand).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }))
    const retryButton = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(retryButton).toHaveProperty('disabled', false))
    fireEvent.click(retryButton)
    await screen.findByText('Waiting for matching supply')
    expect(screen.getByText('need-b')).toBeTruthy()
    expect(recordOwnerMarketDemand).toHaveBeenCalledTimes(3)
    const secondCall = recordOwnerMarketDemand.mock.calls[1]
    const retryCall = recordOwnerMarketDemand.mock.calls[2]
    if (secondCall === undefined || retryCall === undefined) throw new Error('Second need Save or retry did not run')
    const secondKey = secondCall[0].data.idempotencyKey
    expect(secondKey).not.toBe(firstKey)
    expect(retryCall[0].data).toEqual({
      query: 'unserved', filters: { provider: 'second.example.com' }, idempotencyKey: secondKey,
    })
    updateSearch({ view: 'tools', query: 'unserved', provider: 'second.example.com', compare: entries[0]!.resource })
    expect(screen.getByText('need-b')).toBeTruthy()
    expect(recordOwnerMarketDemand).toHaveBeenCalledTimes(3)
  })

})


it('switches Arc table and gallery presentation without requesting another catalogue page or losing comparison', async () => {
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', network: 'eip155:8453', compare }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
  expect(screen.getByRole('table', { name: 'Tools' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ layout: 'grid', compare, network: 'eip155:8453' }))
  expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Remove Tool 0 from comparison' })).toBeTruthy()
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Table' }))
  await waitFor(() => expect(screen.getByRole('table', { name: 'Tools' })).toBeTruthy())
  expect(router.state.location.search).toMatchObject({ layout: 'table', compare, network: 'eip155:8453' })
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
})


it('clears an unsubmitted search draft and restores input focus without changing the catalogue URL', () => {
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', compare })
  const input = screen.getByRole('searchbox', { name: 'Search Tools' })
  fireEvent.change(input, { target: { value: 'weather' } })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(input).toHaveProperty('value', '')
  expect(document.activeElement).toBe(input)
  expect(router.state.location.search).toMatchObject({ view: 'tools', compare })
  expect(router.state.location.search).not.toHaveProperty('query')
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('restores the gallery and its comparison context through history and a fresh render', async () => {
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', network: 'eip155:8453', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
  expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Table' }))
  await waitFor(() => expect(router.state.location.search.layout).toBe('table'))
  router.history.back()
  // This fixture supplies only RouterContextProvider; emulate RouterProvider loading the history location.
  await router.load()
  await waitFor(() => expect(router.state.location.search.layout).toBe('grid'))
  expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()
  expect(router.state.location.search).toMatchObject({ compare, network: 'eip155:8453' })
  cleanup()
  show({ view: 'tools', network: 'eip155:8453', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
  expect(screen.getByRole('button', { name: 'Remove Tool 0 from comparison' })).toBeTruthy()
  expect(screen.queryByRole('table', { name: 'Tools' })).toBeNull()
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
})


describe('visible Arc catalogue facets', () => {
  it('keeps category selection and applied filters beside results with query, comparison and layout intact', async () => {
    searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'scoped', results: [], reason: 'More pages remain.' })
    const compare = entries[0]!.resource
    const { router } = show({ ...nativeFilters, query: 'weather', sort: 'relevance', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    const categories = screen.getByRole('group', { name: 'Browse by Provider category' })
    expect(within(categories).getByRole('button', { name: 'Research' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(categories).getByRole('button', { name: 'Media' }))
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...nativeFilters, query: 'weather', sort: 'relevance', directoryCategory: 'media', compare, layout: 'grid' }))
    const applied = screen.getByRole('group', { name: 'Applied catalogue filters' })
    fireEvent.click(within(applied).getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ view: 'tools', query: 'weather', sort: 'relevance', compare, layout: 'grid' }))
    expect(screen.queryByRole('dialog', { name: 'Refine Tools' })).toBeNull()
  })

  it('accumulates independent rapid facet writes on the latest Provider route without losing comparison or layout', async () => {
    const compare = entries[0]!.resource
    const { router } = show({ view: 'providers', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: /^Filters(?: \d+)?$/u }))
    const dialog = screen.getByRole('dialog', { name: 'Refine Directory Hosts' })
    act(() => within(dialog).getByRole('combobox', { name: 'Provider category' }).focus())
    const category = within(dialog).getByRole('option', { name: 'Media' })
    const price = within(dialog).getByRole('button', { name: 'Under 0.01 Provider-listed USDC' })
    act(() => {
      fireEvent.click(category)
      fireEvent.click(price)
    })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'providers', directoryCategory: 'media', priceBand: 'lt_0_01', compare, layout: 'grid' }))
    expect(router.state.location.search).not.toHaveProperty('page')
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
    expect(router.state.location.search).not.toHaveProperty('offset')
  })
})

it('drops unrelated route context when changing the market layout while retaining exact comparison and filters', async () => {
  const first = entries[0]
  if (first === undefined) throw new Error('Expected catalogue fixture')
  const compare = first.resource
  const routeContext = { view: 'tools' as const, provider: 'example.com', layout: 'table' as const, compare, sort: 'adoption' as const, accountRef: 'other-route-account', q: 'owner-inventory-search' }
  const { router } = show(routeContext)
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }))
  await waitFor(() => expect(router.state.location.search.layout).toBe('grid'))
  expect(router.state.location.search.provider).toBe('example.com')
  expect(router.state.location.search.compare).toBe(compare)
  expect(router.state.location.search.sort).toBe('adoption')
  expect(router.state.location.search).not.toHaveProperty('accountRef')
  expect(router.state.location.search).not.toHaveProperty('q')
})

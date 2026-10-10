/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, useRouterState } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { SEARCH_QUERY_MAX_LENGTH } from '@/modules/common/search-query'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { Route as ProductionMarketRoute } from '@/routes/market'
import type { ComponentProps } from 'react'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
import type { SearchResult, ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { PublicToolRegistrySchemaVersion, type PublicToolRef } from '@/modules/capability-supply/public'
import { loadCanonicalMarketSearch, loadMarketRouteData, marketLoaderDeps, marketUsesCanonicalSearch, validateMarketSearch } from '@/modules/market/market-route-data'
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
const readX402DirectoryProvidersServer = vi.fn()
vi.mock('@/modules/market/x402-directory-index.functions', () => ({
  readX402DirectoryCatalogueServer: (...args: unknown[]) => readX402DirectoryCatalogueServer(...args),
  readX402DirectoryCatalogueOverviewServer: (...args: unknown[]) => readX402DirectoryCatalogueOverviewServer(...args),
  readX402DirectoryProvidersServer: (...args: unknown[]) => readX402DirectoryProvidersServer(...args),
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
  const canonicalSearch = useRouterState({ select: state => state.matches.find(match => match.routeId === '/market')?.loaderData }) as Props['canonicalSearch']
  return <AeX402Directory {...rest} {...(canonicalSearch === undefined ? {} : { canonicalSearch })} search={urlSearch} />
}
function show(search: Props['search'] = { offset: 20 }, items = entries, extra: Partial<Omit<Props, 'search'>> = {}, routeLoader?: MarketRouteLoader) {
  const root = createRootRoute()
  const marketRouteBase = { getParentRoute: () => root, path: '/market' as const, validateSearch: validateMarketSearch }
  const marketRoute = routeLoader === undefined
    ? createRoute({
      ...marketRouteBase,
      loaderDeps: ({ search }) => marketLoaderDeps(search),
      beforeLoad: ({ matches, routeId }) => ({ previousCanonicalSearch: matches.find(match => match.routeId === routeId)?.loaderData as Props['canonicalSearch'] }),
      loader: ({ deps }) => marketUsesCanonicalSearch(deps) && (deps.view === 'tools' || deps.view === undefined)
        ? loadCanonicalMarketSearch(deps) : undefined,
      staleTime: 30_000, preload: false,
    })
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
  void router.load()
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
// The grid card link reads "Title, provider, price"; the list row link reads just the title.
function toolOpener(title: string) {
  return screen.getByRole('link', { name: name => name === title || name.startsWith(`${title}, `) })
}
function toolHref(link: HTMLElement) { return new URL(link.getAttribute('href')!, 'https://aecon.ai') }
beforeEach(() => {
  listSavedToolsForOwner.mockResolvedValue({ kind: 'available', items: [] })
  findOwnerActiveMarketDemand.mockReset().mockResolvedValue({ kind: 'not_found' })
  getOwnerMarketDemandStatus.mockReset().mockImplementation(({ data }: { data: { requestRef: string } }) => Promise.resolve({ kind: 'open', requestRef: data.requestRef, query: 'unserved', createdAt: 1, matchedCount: 0 }))
})
afterEach(() => { cleanup(); owner.userId = 'alice'; listSavedToolsForOwner.mockReset(); saveToolForOwner.mockReset(); recordOwnerMarketDemand.mockReset(); recordProductJourney.mockReset(); readX402DirectoryCatalogueServer.mockReset(); readX402DirectoryCatalogueOverviewServer.mockReset(); readX402DirectoryProvidersServer.mockReset(); searchMarketToolsServer.mockReset(); captureRouteException.mockReset() })
const providersFixture = (
  page: Extract<X402DirectoryProvidersPage, { kind: 'ok' }>['page'] = [{ key: 'example.com', label: 'example.com', count: 19 }, { key: 'other.example.com', label: 'other.example.com', count: 1 }],
  extra: Partial<Extract<X402DirectoryProvidersPage, { kind: 'ok' }>> = {},
): X402DirectoryProvidersPage => ({ kind: 'ok', coverage, page, isDone: true, continueCursor: '', ...extra })
const browseNav = () => screen.getByRole('navigation', { name: 'Browse' })
const viewLink = (name: string) => within(browseNav()).getByRole('link', { name })
const currentViewLinks = () => within(browseNav()).getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page')
// Arc's search field keeps an empty live region; only statuses that say something count.
const visibleStatuses = () => screen.getAllByRole('status').filter(status => status.textContent !== '' || status.hasAttribute('aria-label'))

describe('native x402 catalogue', () => {
  it('shows the complete upstream page and pagination, linking every Tool to its canonical detail page', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'All tools' })).toBeTruthy()
    for (const entry of entries) {
      const href = toolHref(toolOpener(entry.title))
      expect(href.pathname).toBe(`/tools/${entry.provider}/${entry.slug}`)
    }
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toContain('offset=40')
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toContain('offset=0')
  })
  it('switches market views rapidly with one current view link', async () => {
    const { router } = show({ view: 'tools' }, entries, { providers: providersFixture() })
    const cases = [
      { view: 'providers', label: 'Providers', check: () => expect(screen.getByRole('link', { name: 'See 19 tools from example.com' })).toBeTruthy() },
      { view: 'saved', label: 'Saved', check: async () => expect(await screen.findByText('Nothing saved yet')).toBeTruthy() },
      { view: 'tools', label: 'Tools', check: () => expect(screen.getByRole('heading', { level: 1, name: 'All tools' })).toBeTruthy() },
    ] as const

    for (const item of cases) {
      fireEvent.click(within(browseNav()).getByRole('link', { name: item.label }))
      // No view in the URL is the Tools view.
      await waitFor(() => expect(router.state.location.search.view ?? 'tools').toBe(item.view))
      await waitFor(() => expect(viewLink(item.label).getAttribute('aria-current')).toBe('page'))
      expect(currentViewLinks()).toHaveLength(1)
      await item.check()
    }
  })
  it('uses real view links with scoped owner-market destinations and reads Saved once across view changes', async () => {
    listSavedToolsForOwner.mockReturnValue(new Promise(() => {}))
    const compare = entries[0]!.resource
    const search = { view: 'tools' as const, provider: 'example.com', network: 'eip155:8453', maxUsdPrice: 0.005, layout: 'grid' as const, compare }
    const { router } = show(search, entries, { marketPath: '/owner/market', providers: providersFixture() })
    const viewUrl = (name: string | RegExp) => {
      const link = within(browseNav()).getByRole('link', { name })
      expect(link.tagName).toBe('A')
      return new URL((link as HTMLAnchorElement).href)
    }

    const tools = viewUrl('Tools')
    expect(tools.pathname).toBe('/owner/market')
    expect(tools.searchParams.get('provider')).toBe('example.com')
    expect(tools.searchParams.get('network')).toBe('eip155:8453')
    expect(tools.searchParams.get('maxUsdPrice')).toBe('0.005')
    expect(tools.searchParams.get('compare')).toBe(compare)
    expect(tools.searchParams.get('layout')).toBe('grid')

    const providers = viewUrl('Providers')
    expect(providers.pathname).toBe('/owner/market')
    expect(providers.searchParams.get('view')).toBe('providers')
    expect(providers.searchParams.get('compare')).toBe(compare)
    expect(providers.searchParams.get('layout')).toBe('grid')
    expect(providers.searchParams.has('provider')).toBe(false)
    expect(providers.searchParams.has('network')).toBe(false)

    const saved = viewUrl(/Saved/)
    expect(saved.pathname).toBe('/owner/market')
    expect(saved.searchParams.get('view')).toBe('saved')
    expect(saved.searchParams.get('compare')).toBe(compare)
    expect(saved.searchParams.get('layout')).toBe('grid')
    expect(saved.searchParams.has('provider')).toBe(false)
    expect(saved.searchParams.has('network')).toBe(false)

    await waitFor(() => expect(listSavedToolsForOwner).toHaveBeenCalledTimes(1))
    fireEvent.click(within(browseNav()).getByRole('link', { name: /Saved/ }), { button: 0, ctrlKey: true })
    expect(router.state.location.pathname).toBe('/owner/market')
    expect(router.state.location.search.view).toBe('tools')

    fireEvent.click(within(browseNav()).getByRole('link', { name: /Saved/ }))
    await waitFor(() => expect(router.state.location.search.view).toBe('saved'))
    const savedLoading = screen.getByRole('status', { name: 'Loading saved tools' })
    expect(savedLoading.querySelector('[aria-hidden="true"]')).toBeTruthy()

    fireEvent.click(within(browseNav()).getByRole('link', { name: 'Providers' }))
    await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
    fireEvent.click(within(browseNav()).getByRole('link', { name: /Saved/ }))
    await waitFor(() => expect(router.state.location.search.view).toBe('saved'))
    expect(listSavedToolsForOwner).toHaveBeenCalledTimes(1)
  })
  it('skips whole-page transitions when a view link is activated', async () => {
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

      fireEvent.click(within(browseNav()).getByRole('link', { name: 'Providers' }))
      await waitFor(() => expect(router.state.location.search.view).toBe('providers'))
      await waitFor(() => expect(routeLoader).toHaveBeenCalledTimes(1))
      fireEvent.click(within(browseNav()).getByRole('link', { name: /Saved/ }))
      await waitFor(() => expect(router.state.location.search.view).toBe('saved'))
      expect(startViewTransition).not.toHaveBeenCalled()
    } finally {
      if (originalTransitionDescriptor === undefined) Reflect.deleteProperty(document, 'startViewTransition')
      else Object.defineProperty(document, 'startViewTransition', originalTransitionDescriptor)
    }
  })
  it('replaces rapid pending views with their loaded data', async () => {
    const providers = providersFixture()
    const { rerender, router } = show({ view: 'providers' }, entries, { pendingView: 'tools', providers })
    const renderRoute = (search: Props['search'], pendingView?: Props['pendingView']) => rerender(
      <RouterContextProvider router={router}><Directory
        page={{ kind: 'ok', items: entries, total: 14455, offset: 20, limit: 20, nextOffset: 40, previousOffset: 0 }}
        compareEntries={[]} providers={providers} search={search} {...(pendingView === undefined ? {} : { pendingView })} /></RouterContextProvider>,
    )

    expect(viewLink('Tools').getAttribute('aria-current')).toBe('page')
    expect(visibleStatuses()).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Loading tools' }).querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /^Tool 0/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'See 19 tools from example.com' })).toBeNull()
    expect(searchMarketToolsServer).not.toHaveBeenCalled()
    expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()

    renderRoute({ view: 'tools' }, 'providers')
    expect(viewLink('Providers').getAttribute('aria-current')).toBe('page')
    expect(visibleStatuses()).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Loading providers' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'See 19 tools from example.com' })).toBeNull()
    expect(searchMarketToolsServer).not.toHaveBeenCalled()
    expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()

    renderRoute({ view: 'tools' }, 'saved')
    expect(viewLink('Saved').getAttribute('aria-current')).toBe('page')
    expect(visibleStatuses()).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Loading saved tools' })).toBeTruthy()

    renderRoute({ view: 'tools' }, 'providers')
    await router.navigate({ to: '/market', search: { view: 'providers' } })
    renderRoute({ view: 'providers' })
    await waitFor(() => expect(screen.getByRole('link', { name: 'See 19 tools from example.com' })).toBeTruthy())
    expect(screen.queryByRole('status', { name: 'Loading providers' })).toBeNull()
    expect(viewLink('Providers').getAttribute('aria-current')).toBe('page')
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

// Compare controls live in the list layout, so these pass layout: 'table'.
it('compares sourced prices and activity in an Arc matrix while retaining material facts in differences mode', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC`, decimalAmount: String(index + 1), symbol: 'USDC' }], outputSummary: `Output ${index}`, ...(index === 0 ? { activity: { calls30d: 66 } } : {}) }))
  show({ offset: 20, layout: 'table' }, priced)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  expect((screen.getByRole('button', { name: 'Compare tools' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Compare tools' }))
  const comparison = screen.getByRole('dialog', { name: 'Compare tools' })
  const matrix = within(comparison).getByRole('table')
  expect(within(matrix).getByText(/Provider lists 1 USDC/)).toBeTruthy()
  expect(within(matrix).getByText(/Provider lists 2 USDC/)).toBeTruthy()
  expect(within(matrix).getByText('Calls, last 30 days')).toBeTruthy()
  expect(within(matrix).getByText('66')).toBeTruthy()
  expect(within(matrix).getByText('Not reported')).toBeTruthy()
  expect(within(matrix).getByText('Output 0')).toBeTruthy()
  expect(within(matrix).getByText('Category')).toBeTruthy()
  const inspect = within(matrix).getAllByRole('link', { name: /View tool/ })
  expect(inspect).toHaveLength(2)
  expect(toolHref(inspect[0]!).pathname).toBe(`/tools/${priced[0]!.provider}/${priced[0]!.slug}`)
  expect(toolHref(inspect[1]!).pathname).toBe(`/tools/${priced[1]!.provider}/${priced[1]!.slug}`)
  fireEvent.click(within(comparison).getByRole('switch', { name: 'Only differences' }))
  expect(within(matrix).queryByText('Category')).toBeNull()
  expect(within(matrix).getByText('Access')).toBeTruthy()
  expect(within(matrix).getByText('Price context')).toBeTruthy()
  expect(within(matrix).getByText(/Provider lists 1 USDC/)).toBeTruthy()
  expect(within(matrix).getAllByText('Not stated')).toHaveLength(2)
})
it('accumulates rapid comparison selections and keeps the current view', async () => {
  const { router } = show({ view: 'tools', layout: 'table' }, entries)
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: `Add Tool ${i} to comparison` }))
  await waitFor(() => expect(router.state.location.search.compare).toBe(entries.slice(0, 4).map(entry => entry.resource).join(',')))
  expect(router.state.location.search.view).toBe('tools')
})
it('keeps the latest view and filters when a comparison control outlives navigation', async () => {
  const { router } = show({ view: 'tools', layout: 'table' })
  const compare = screen.getByRole('button', { name: 'Add Tool 0 to comparison' })
  void router.navigate({ to: '/market', search: { view: 'providers', network: 'eip155:8453' } })
  fireEvent.click(compare)
  await waitFor(() => expect(router.state.location.search.compare).toBe(entries[0]!.resource))
  expect(router.state.location.search.view).toBe('providers')
  expect(router.state.location.search.network).toBe('eip155:8453')
})
it('labels the list comparison control visibly and preserves its pressed state', async () => {
  show({ offset: 20, layout: 'table' }, entries)

  const compare = screen.getByRole('button', { name: 'Add Tool 0 to comparison' })
  expect(compare.textContent).toContain('Compare')
  expect(compare.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(compare)

  const selected = within(toolOpener('Tool 0').closest('tr')!).getByRole('button', { name: 'Remove Tool 0 from comparison' })
  await waitFor(() => expect(selected.textContent).toBe('Added'))
  expect(selected.getAttribute('aria-pressed')).toBe('true')
})
it('keeps Provider price evidence secondary and settlement networks off Tool rows', () => {
  const priced = entries.map((entry, index) => ({ ...entry, prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: `${index + 1} USDC`, decimalAmount: String(index + 1), symbol: 'USDC' }] }))
  show({ offset: 20, layout: 'table' }, priced)

  expect(screen.getByRole('columnheader', { name: /Price per call/ })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: /Calls in 30 days/ })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Access' })).toBeTruthy()
  expect(screen.queryByRole('columnheader', { name: 'Volume' })).toBeNull()
  const row = toolOpener('Tool 0').closest('tr')
  expect(row?.textContent).toContain('Preview only')
  const priceCell = row?.querySelectorAll('td')[2]
  expect(priceCell?.textContent).toBe('US$1')
  expect(priceCell?.textContent).not.toContain('USDC')
  expect(priceCell?.querySelector('span')?.getAttribute('title')).toMatch(/Provider.*1 USDC/)
  expect(screen.queryByText('Base')).toBeNull()
})
it('labels every grid card with its readiness and marks an AUD estimate visibly with its source price', () => {
  const price = { network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '1 USDC', decimalAmount: '1', symbol: 'USDC' }
  const cards = [
    { ...entries[0]!, prices: [price], audEstimate: 'A$1.52' },
    { ...entries[1]!, prices: [price], choice: { access: 'ae_callable' as const, toolRef: `operation:v1:${'a'.repeat(64)}` } },
    { ...entries[2]!, prices: [price], choice: { access: 'setup_required' as const } },
  ] as X402DirectoryEntry[]
  show({ offset: 20, layout: 'grid' }, cards)
  const card = (title: string) => toolOpener(title).closest('.ae-tool-card')?.textContent ?? ''
  expect(card('Tool 0')).toContain('Preview only')
  expect(card('Tool 0')).toContain('est. A$1.52')
  expect(card('Tool 0')).toContain('1 USDC per call')
  expect(toolOpener('Tool 0').getAttribute('aria-label')).toContain('est. A$1.52 per call')
  expect(card('Tool 1')).toContain('Ready to call')
  expect(card('Tool 2')).toContain('Needs setup')
  expect(card('Tool 2')).not.toContain('est.')
})

it('never promotes recipient transfer totals into the Tool-choice hierarchy', () => {
  const payTo = '0xabababababababababababababababababababab'
  const priced = [0, 1].map(index => ({
    ...entries[index]!,
    activity: { calls30d: index === 0 ? 66 : 3, payers30d: 2 },
    prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '1 USDC', decimalAmount: '1', symbol: 'USDC', payTo }],
  }))
  show({ offset: 20, layout: 'table' }, priced)
  expect(screen.getByRole('table', { name: 'Tools on this page' })).toBeTruthy()
  expect(screen.queryByRole('table', { name: 'Settled USDC recipients' })).toBeNull()
  expect(screen.queryByRole('columnheader', { name: 'Volume' })).toBeNull()
})
it('groups the provider view by exact hostname and opens that provider filter', async () => {
  const { router } = show({ view: 'providers', layout: 'grid' }, [], { providers: providersFixture() })
  expect(screen.getByRole('link', { name: 'See 19 tools from example.com' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'See 1 tool from other.example.com' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'See 19 tools from example.com' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'tools', provider: 'example.com', layout: 'grid' }))
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
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search tools' }), { target: { value: '  weather forecasts  ' } })
  fireEvent.submit(screen.getByRole('search', { name: 'Search tools' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ query: 'weather forecasts', sort: 'relevance', network: 'eip155:8453', compare, layout: 'grid' }))
  expect(router.state.location.pathname).toBe('/market')
})
it('refuses an oversized catalogue query and returns focus without navigating', () => {
  const { router } = show({ view: 'tools' })
  const input = screen.getByRole('searchbox', { name: 'Search tools' })
  fireEvent.change(input, { target: { value: 'x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1) } })
  fireEvent.submit(screen.getByRole('search', { name: 'Search tools' }))
  expect(screen.getByRole('alert').textContent).toContain(`Use ${SEARCH_QUERY_MAX_LENGTH} characters or fewer`)
  expect(document.activeElement).toBe(input)
  expect((input as HTMLInputElement).value).toBe('x'.repeat(SEARCH_QUERY_MAX_LENGTH + 1))
  expect(router.state.location.search).not.toHaveProperty('query')
})
it('keeps a selected Tool hydrated across pages and a reload-style render', () => {
  const selected = entries[19]!
  const compareEntries = [{ resource: selected.resource, entry: selected }]
  const { updatePage } = show({ offset: 20, layout: 'table' }, entries, { compareEntries })
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 19 to comparison' }))

  updatePage({ kind: 'ok', items: entries.slice(0, 2), total: 14455, offset: 0, limit: 20, nextOffset: 20 })
  expect(screen.getByText('Tool 19')).toBeTruthy()

  cleanup()
  show({ compare: selected.resource }, entries.slice(0, 2), { compareEntries })
  expect(screen.getByText('Tool 19')).toBeTruthy()
})
it('keeps comparison refs when clearing filters and using offset pagination', () => {
  const compare = entries[19]!.resource
  const compareEntries = [{ resource: compare, entry: entries[19]! }]
  show({ offset: 20, provider: 'example.com', compare }, entries, { compareEntries })
  expect(toolHref(screen.getByRole('link', { name: 'Next' })).searchParams.get('compare')).toBe(compare)
  expect(toolHref(screen.getByRole('link', { name: 'Previous' })).searchParams.get('compare')).toBe(compare)

  cleanup()
  show({ provider: 'example.com', compare }, [], { compareEntries, page: { kind: 'ok', items: [], total: 0, offset: 0, limit: 20 } })
  expect(toolHref(screen.getByRole('link', { name: 'Clear search and filters' })).searchParams.get('compare')).toBe(compare)
})
it('shows an unavailable selected Tool with a remove control', async () => {
  const resource = 'https://example.com/tool/removed'
  const { router } = show({ compare: resource }, entries.slice(0, 2), {
    compareEntries: [{ resource, missing: true }],
  })

  expect(screen.getByText('Selected Tool unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remove unavailable tool from comparison' }))
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty('compare'))
})
it('does not call an URL selection unavailable while its loader hydration is pending', () => {
  const resource = 'https://example.com/tool/loading'
  show({ compare: resource }, entries.slice(0, 2))

  expect(screen.getByText('Loading selected Tool…')).toBeTruthy()
  expect(screen.queryByText('Selected Tool unavailable')).toBeNull()
})
it('keeps workspace pagination on the owner market path', () => {
  show({ offset: 20, network: 'eip155:8453' }, entries, { workspace: true, marketPath: '/owner/market' })
  expect(screen.getByRole('heading', { level: 2, name: 'All tools' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toContain('/owner/market')
})
it('returns focus to Compare after dismissing the comparison dialog', async () => {
  show({ offset: 20, layout: 'table' })
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 1 to comparison' }))
  const opener = screen.getByRole('button', { name: 'Compare tools' })
  opener.focus()
  fireEvent.click(opener)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(document.activeElement).toBe(opener))
})
it('docks the comparison tray in document flow below results without sticky overlay', () => {
  show({ offset: 20, layout: 'table' }, entries.slice(0, 4))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  const tray = document.querySelector('[data-compare-tray="flow"]')
  expect(tray).toBeTruthy()
  expect(tray!.className).not.toContain('sticky')
  expect(tray!.className).not.toContain('fixed')
  expect(tray!.className).not.toContain('shadow-float')
  const resultPages = screen.getByRole('navigation', { name: 'Result pages' })
  expect(resultPages.compareDocumentPosition(tray!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

const coverage = { source: 'coinbase' as const, generation: 'generation-1', indexedTotal: 14455, reportedTotal: 14455, reportedTotalAtStart: 14455, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 145, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' as const }
const indexedPage = { kind: 'ok' as const, items: entries.slice(0, 2), offset: 0, limit: 20 }
const indexedCatalogue = { kind: 'ok' as const, source: 'index' as const, page: indexedPage, coverage, searchMethod: 'native_index' as const, indexCursor: 'generation-1:next/page+cursor', isDone: false }
const overview = { kind: 'ok' as const, coverage, categories: [{ key: 'research', label: 'Research', count: 201 }, { key: 'media', label: 'Media', count: 405 }], providers: [], networks: [{ key: 'eip155:8453', label: 'Base', count: 14455 }], popular: [], recentlyUpdated: [] }
const nativeFilters = { view: 'tools' as const, network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 0.005, directoryCategory: 'research' }

it('loads Provider keyword results from the host index by address prefix', async () => {
  const providers = providersFixture([{ key: 'research.example.com', label: 'research.example.com', count: 3 }])
  readX402DirectoryProvidersServer.mockResolvedValue(providers)
  readX402DirectoryCatalogueOverviewServer.mockResolvedValue(overview)
  const search = validateMarketSearch({ ...nativeFilters, view: 'providers', query: 'research', sort: 'relevance', layout: 'grid' })
  const result = await loadMarketRouteData(marketLoaderDeps(search))
  expect(readX402DirectoryProvidersServer).toHaveBeenCalledWith(expect.objectContaining({ data: { providerPrefix: 'research' } }))
  expect(result.providers).toBe(providers)
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('presents a Provider search as a match on the start of each provider address', () => {
  show({ view: 'providers', query: 'research' }, [], {
    page: indexedPage, catalogue: { ...indexedCatalogue, isDone: true }, overview, providers: providersFixture([{ key: 'research.example.com', label: 'research.example.com', count: 3 }]),
  })
  expect(screen.getByRole('link', { name: 'See 3 tools from research.example.com' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Providers' })).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1, name: 'Providers' })).toBeTruthy()
  expect(screen.getByText('Providers whose address starts with “research”.')).toBeTruthy()
  expect(screen.getByRole('searchbox', { name: 'Search providers' })).toBeTruthy()
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it.each([false, true])('submits Provider search only after its view commits: pending %s', async pending => {
  const compare = entries[0]!.resource
  const { router } = show({ view: pending ? 'tools' : 'providers', network: 'eip155:8453', compare, layout: 'grid' }, [], {
    ...(pending ? { pendingView: 'providers' } : {}),
    page: indexedPage, catalogue: { ...indexedCatalogue, isDone: true }, overview, providers: providersFixture(),
  })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search providers' }), { target: { value: '  research  ' } })
  fireEvent.submit(screen.getByRole('search', { name: 'Search providers' }))
  if (pending) {
    expect(screen.getByRole('search', { name: 'Search providers' }).closest('[inert]')).toBeTruthy()
    expect(router.state.location.search.query).toBeUndefined()
    expect(searchMarketToolsServer).not.toHaveBeenCalled()
    return
  }
  await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'providers', query: 'research', compare, layout: 'grid' }))
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('continues an empty Provider page with its cursor before declaring no providers', () => {
  show({ view: 'providers', query: 'research' }, [], {
    providers: providersFixture([], { isDone: false, continueCursor: 'providers:next-1' }),
  })
  expect(screen.getByText('Nothing on this page')).toBeTruthy()
  expect(screen.queryByText(/No providers start with/)).toBeNull()
  expect(pageLinkSearch('Next').get('providerCursor')).toBe('providers:next-1')
  expect(pageLinkSearch('Next').get('query')).toBe('research')
  expect(pageLinkSearch('Next').get('view')).toBe('providers')
})

it('declares no matching Providers only after the host search is complete', () => {
  show({ view: 'providers', query: 'research' }, [], { providers: providersFixture([]) })
  expect(screen.getByText('No providers start with “research”')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Next' })).toBeNull()
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

function pageLinkSearch(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai').searchParams }
function expectNativeFilters(search: URLSearchParams) {
  // Page links carry the refinements; the default Tools view is implied, so `view` is not in the URL.
  const { view: _view, ...filters } = nativeFilters
  for (const [key, value] of Object.entries(filters)) expect(search.get(key)).toBe(String(value))
}

it.each([true, false, undefined])('routes reviewed-provider keyword search through the filtered catalogue only when enabled: %s', async reviewedProvidersOnly => {
  readX402DirectoryCatalogueServer.mockResolvedValue(indexedCatalogue)
  readX402DirectoryCatalogueOverviewServer.mockResolvedValue(overview)
  const search = validateMarketSearch({ view: 'tools', query: 'research', reviewedProvidersOnly })
  searchMarketToolsServer.mockResolvedValue({ ...searchMeta, query: 'research', kind: 'match', results: [] })
  const result = await loadMarketRouteData(marketLoaderDeps(search))
  // The keyword index is always read; the mixed ranking is added only without the reviewed-provider filter.
  expect(result.catalogue).toBe(indexedCatalogue)
  if (reviewedProvidersOnly === true) {
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith(expect.objectContaining({ data: { query: 'research', reviewedProvidersOnly: true } }))
    expect(result.canonicalSearch).toBeUndefined()
    expect(searchMarketToolsServer).not.toHaveBeenCalled()
  } else {
    expect(readX402DirectoryCatalogueServer).toHaveBeenCalledWith(expect.objectContaining({ data: { query: 'research', ...(reviewedProvidersOnly === false ? { reviewedProvidersOnly: false } : {}) } }))
    expect((await result.canonicalSearch)?.result).toMatchObject({ query: 'research', kind: 'match' })
  }
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
  show({ view: 'tools', query: 'weather forecast', alternativeTo: 'source-route:current', layout: 'table' }, [], {
    page, catalogue: { ...indexedCatalogue, page, indexCursor: 'more-alternatives', isDone: false }, overview,
  })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { level: 1, name: 'Ready-to-call alternatives for “weather forecast”' })).toBeTruthy()
  const row = screen.getByRole('link', { name: 'Tool 1' }).closest('tr')
  expect(row?.textContent).toContain('Ready to call')
  expect(row?.textContent).toContain('A$0.01')
  expect(screen.queryByText(/No other tool ready to call/)).toBeNull()
  expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toContain('indexCursor=more-alternatives')
})

it('shows no ready-to-call alternative only after the indexed assessment is complete', () => {
  const remaining = { ...indexedPage, items: [] }
  show({ view: 'tools', query: 'weather forecast', alternativeTo: 'source-route:current' }, [], {
    page: remaining, catalogue: { ...indexedCatalogue, page: remaining, indexCursor: 'more-alternatives', isDone: false }, overview,
  })
  expect(screen.getByText('Nothing on this page')).toBeTruthy()
  expect(screen.queryByText(/No other tool ready to call/)).toBeNull()
  cleanup()

  const page = { ...indexedPage, items: [] }
  show({ view: 'tools', query: 'weather forecast', alternativeTo: 'source-route:current' }, [], {
    page, catalogue: { ...indexedCatalogue, page, isDone: true }, overview,
  })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  expect(screen.getByText('No other tool ready to call for “weather forecast”')).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Next/ })).toBeNull()
})

it('discloses the Market search recipient once in the results footnote', async () => {
  searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'match', results: [] })
  show({ view: 'tools', query: 'weather' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview, jevRecipient: 'TypeSafe (api.typesafe.ai)' })
  expect(screen.getByText(/Your search is sent to TypeSafe \(api\.typesafe\.ai\) to sort results/)).toBeTruthy()
  expect(screen.getAllByText(/TypeSafe/)).toHaveLength(1)
  expect(screen.getAllByRole('searchbox', { name: 'Search tools' })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(within(screen.getByRole('dialog', { name: 'Filter tools' })).queryByRole('searchbox', { name: 'Search tools' })).toBeNull()
})

describe('indexed x402 catalogue controls', () => {
  it('offers price and provider refinements in the Filters drawer', () => {
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    const drawer = screen.getByRole('dialog', { name: 'Filter tools' })
    expect(within(drawer).getByRole('group', { name: 'Price per call' })).toBeTruthy()
    expect(within(drawer).getByRole('combobox', { name: 'Provider' })).toBeTruthy()
    expect(within(drawer).queryByRole('button', { name: /Advanced filters/ })).toBeNull()
    expect(within(drawer).queryByRole('combobox', { name: 'Network' })).toBeNull()
  })

  it('counts an active refinement on Filters and shows it as a removable applied filter', async () => {
    const { router } = show({ view: 'tools', network: 'eip155:8453' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.getByRole('button', { name: 'Filters, 1 applied' })).toBeTruthy()
    const applied = screen.getByRole('group', { name: 'Applied filters' })
    fireEvent.click(within(applied).getByRole('button', { name: /Remove Network/ }))
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('network'))
  })

  it('links pages by index cursor and page number, first page last', () => {
    show({ ...nativeFilters, sort: 'adoption' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.queryByRole('link', { name: 'First page' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull()
    const next = pageLinkSearch('Next')
    expect(next.get('indexCursor')).toBe(indexedCatalogue.indexCursor)
    expect(next.get('page')).toBe('2')
    expectNativeFilters(next)
    expect(screen.getByText('Page 1')).toBeTruthy()
    const arrange = screen.getByRole('group', { name: 'Arrange results' })
    expect(within(arrange).getByRole('combobox', { name: /Sort by/ }).textContent).toContain('Popular')
    expect(within(arrange).getByRole('group', { name: 'Layout' })).toBeTruthy()
    expect(within(arrange).getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: 'Applied filters' })).toBeTruthy()
  })
  it('marks only the index order on the list header and keeps the header in place across a server sort', async () => {
    const { router } = show({ view: 'tools', layout: 'table' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    const table = screen.getByRole('table', { name: 'Tools on this page' })
    // The default order is by buyers, which no column shows, so no header claims it.
    expect(within(table).getByRole('columnheader', { name: /Price per call/ }).getAttribute('aria-sort')).toBe('none')
    expect(within(table).getByRole('columnheader', { name: /Calls in 30 days/ }).hasAttribute('aria-sort')).toBe(false)
    expect(within(table).queryByRole('button', { name: /Sort by Calls/ })).toBeNull()
    const price = within(table).getByRole('button', { name: /Sort by Price per call/ })
    price.focus()
    fireEvent.click(price)
    await waitFor(() => expect(router.state.location.search.sort).toBe('price_asc'))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Price per call/ }).getAttribute('aria-sort')).toBe('ascending'))
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Sort by Price per call/)
    expect(screen.getByText('Sorted by Price per call, ascending')).toBeTruthy()
    // The index reads price one way only, so a second press keeps that order instead of reversing this page.
    fireEvent.click(screen.getByRole('button', { name: /Sort by Price per call/ }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Price per call/ }).getAttribute('aria-sort')).toBe('ascending'))
    expect(router.state.location.search.sort).toBe('price_asc')
  })
  it('offers no header sort where the index does not order the list', () => {
    show({ offset: 20, layout: 'table' }, entries)
    expect(screen.queryAllByRole('button', { name: /^Sort by/ })).toHaveLength(0)
  })
  it('walks to a shared page number by its cursor and returns to the first page without a cursor', () => {
    show({ ...nativeFilters, indexCursor: 'opaque:page2', page: 2 }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.getByText('Page 2')).toBeTruthy()
    const next = pageLinkSearch('Next')
    expect(next.get('indexCursor')).toBe(indexedCatalogue.indexCursor)
    expect(next.get('page')).toBe('3')
    const first = pageLinkSearch('First page')
    expect(first.has('indexCursor')).toBe(false)
    expect(first.has('page')).toBe(false)
    expectNativeFilters(first)
  })
  it('changes catalogue sort through the Arc select while preserving filters, without ever adding a cursor', async () => {
    const { router } = show({ ...nativeFilters, sort: 'adoption' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    fireEvent.click(screen.getByRole('combobox', { name: /Sort by/ }))
    const option = await screen.findByRole('option', { name: 'Recently called' })
    fireEvent.pointerDown(option, { pointerType: 'mouse' })
    fireEvent.click(option, { detail: 1 })
    const { view: _view, ...filters } = nativeFilters
    await waitFor(() => expect(router.state.location.search).toMatchObject({ ...filters, sort: 'active' }))
    expect(router.state.location.search).not.toHaveProperty('indexCursor')
  })
  it('states the catalogue total only on an unfiltered browse', () => {
    show({ view: 'tools' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.getByText('14,455 paid APIs, data feeds and services, each priced per call.')).toBeTruthy()
    cleanup()
    show(nativeFilters, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(screen.queryByText(/14,455 paid APIs/)).toBeNull()
    expect(screen.getByText(/Each tool is priced per call/)).toBeTruthy()
  })
  it('keeps the next page available for an empty portion when the index has more entries', () => {
    const empty = { ...indexedPage, items: [] }
    show(nativeFilters, [], { page: empty, catalogue: { ...indexedCatalogue, page: empty } })
    expect(screen.getByText('Nothing on this page')).toBeTruthy()
    expect(screen.getByText('More of the index is still to check.')).toBeTruthy()
    expect(pageLinkSearch('Next page').get('indexCursor')).toBe(indexedCatalogue.indexCursor)
    expect(screen.queryByText(/No tools match/)).toBeNull()
  })
  it('shows a plain Try again when the initial indexed browse is unavailable', () => {
    show(nativeFilters, [], { page: { kind: 'unavailable', reason: 'source_unavailable' }, catalogue: { kind: 'unavailable', reason: 'source_unavailable' } })
    const tryAgain = pageLinkSearch('Try again')
    expectNativeFilters(tryAgain)
    expect(tryAgain.has('indexCursor')).toBe(false)
    expect(screen.getByText('We couldn’t reach the tool index. Try again.')).toBeTruthy()
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

describe('canonical Market search', () => {
  const searchShow = (search: Props['search'], extra: Partial<Omit<Props, 'search'>> = {}) => show(search, [], { page: indexedPage, catalogue: indexedCatalogue, overview, ...extra })
  it('names the ranking status while best matches are pending, with a decorative spinner', () => {
    searchMarketToolsServer.mockReturnValue(new Promise(() => {}))
    searchShow({ view: 'tools', query: 'weather' }, { canonicalSearch: new Promise(() => {}) })
    const status = visibleStatuses()
    expect(status).toHaveLength(1)
    expect(status[0]!.textContent).toBe('Finding best matches')
    expect(status[0]!.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
  it('keeps a successful canonical result across a Providers view round trip without searching again', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValue(first)
    const { router, updateSearch } = searchShow({ view: 'tools', query: 'weather' })

    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    updateSearch({ view: 'providers', query: 'weather' })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'providers', query: 'weather' }))
    await waitFor(() => expect(viewLink('Providers').getAttribute('aria-current')).toBe('page'))

    updateSearch({ view: 'tools', query: 'weather' })
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'tools', query: 'weather' }))
    await waitFor(() => expect(viewLink('Tools').getAttribute('aria-current')).toBe('page'))
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(1)
    expect(recordProductJourney.mock.calls.filter(([event]) => event.action === 'search_observed')).toEqual([
      [{ action: 'search_observed', phase: 'observed', surface: 'market', queryLength: 7, resultCount: searchRows.length, callableCount: searchRows.filter(row => row.access === 'ae_callable').length }],
    ])
  })
  it('inserts best matches above the keyword results with exact detail links, readiness and one price line', async () => {
    const first = { ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput
    searchMarketToolsServer.mockResolvedValueOnce(first)
    show({ view: 'tools', query: 'weather', directoryCategory: 'research', provider: 'example.com', network: 'eip155:8453', priceBand: 'lt_0_01' },
      entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    expect(await screen.findByRole('link', { name: 'Weather Forecast' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Best matches' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'All keyword matches' })).toBeTruthy()
    expect(toolOpener('Tool 0')).toBeTruthy()
    expect(toolHref(screen.getByRole('link', { name: 'Weather Forecast' })).pathname).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(toolHref(screen.getByRole('link', { name: 'External Forecast' })).pathname).toBe('/api/v1/registry/detail')
    const matches = within(screen.getByRole('list', { name: 'Best matches' }))
    expect(matches.getByText('Ready to call')).toBeTruthy()
    expect(matches.getByText('Preview only')).toBeTruthy()
    expect(matches.getByText('A$0.01 per call')).toBeTruthy()
    expect(matches.getByText('US$1 per call').getAttribute('title')).toBe('Provider lists 1 USDC')
    expect(searchMarketToolsServer).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { query: 'weather', limit: 8, filters: { category: 'research', provider: 'example.com', networkId: 'eip155:8453', priceBand: 'lt_0_01' } } }))
    expect(searchMarketToolsServer).toHaveBeenCalledTimes(1)
  })

  it('says nothing and keeps the keyword results when the ranking is unavailable', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'unavailable', results: [], reason: 'source_unavailable', pagination: { limit: 8, hasMore: false }, next: [{ action: 'registry.tools.search', args: { query: 'weather' }, authority: 'public' }] })
    show({ view: 'tools', query: 'weather' }, entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    await waitFor(() => expect(searchMarketToolsServer).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('link', { name: /^Tool 0/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Best matches' })).toBeNull()
    expect(screen.queryByText('No recommendation was made.', { exact: false })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports a failed search with its cause and keeps the keyword results', async () => {
    const initialFailure = new Error('initial search failed')
    searchMarketToolsServer.mockRejectedValueOnce(initialFailure)
    show({ view: 'tools', query: 'weather' }, entries.slice(0, 2), { page: indexedPage, catalogue: indexedCatalogue, overview })
    await waitFor(() => expect(captureRouteException).toHaveBeenCalledWith(initialFailure, { degraded: 'marketCanonicalSearch', reason: 'source_unavailable' }, 'warning'))
    expect(screen.getByRole('link', { name: /^Tool 0/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Best matches' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
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
    } satisfies ToolChoiceSearchOutput)
    show({ view: 'tools', query: 'weather', layout: 'table' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview, jevRecipient: 'TypeSafe (custom-gateway.example)' })
    const table = await screen.findByRole('table', { name: 'Best matches' })
    const setupRow = within(table).getByRole('row', { name: /Connect Weather/ })
    expect(toolHref(within(setupRow).getByRole('link', { name: 'Connect Weather' })).pathname).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(within(setupRow).getByText('Needs setup')).toBeTruthy()
    expect(within(setupRow).getByText('A$0.01').getAttribute('title')).toBe('Provider lists 0.000001 USDC')
    const externalRow = within(table).getByRole('row', { name: /External Forecast/ })
    expect(within(externalRow).getByText('Preview only')).toBeTruthy()
    expect(within(externalRow).queryByText('Needs setup')).toBeNull()
    expect(within(externalRow).getByText('US$1').getAttribute('title')).toBe('Provider lists 1 USDC')
    expect(screen.getByText(/Your search is sent to TypeSafe \(custom-gateway.example\) to sort results/)).toBeTruthy()
  })
  it('saves exact admitted and Bazaar search identities without retaining listed prices', async () => {
    searchMarketToolsServer.mockResolvedValueOnce({ ...searchMeta, kind: 'match', results: searchRows } satisfies ToolChoiceSearchOutput)
    saveToolForOwner.mockImplementation(async ({ data }: { data: { kind: string; toolRef?: string; id?: string } }) => ({
      kind: 'saved', identity: data.toolRef ? data : { kind: 'external_listing', resource: 'https://example.com/weather' }, createdAt: 1,
    }))
    show({ view: 'tools', query: 'weather', layout: 'table' }, [], { page: indexedPage, catalogue: indexedCatalogue, overview })
    const table = await screen.findByRole('table', { name: 'Best matches' })
    const admitted = within(table).getByRole('link', { name: 'Weather Forecast' }).closest('tr')
    const external = within(table).getByRole('link', { name: 'External Forecast' }).closest('tr')
    if (admitted === null || external === null) throw new Error('Missing canonical search result row')
    await waitFor(() => expect(within(admitted).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false))
    fireEvent.click(within(admitted).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveToolForOwner).toHaveBeenCalledWith({ data: { kind: 'ae_callable', toolRef: admittedRef } }))
    await waitFor(() => expect(within(external).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false))
    fireEvent.click(within(external).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveToolForOwner).toHaveBeenCalledWith({ data: { kind: 'external_listing', id: directoryId } }))
  })

  const noMatch = (query: string) => ({
    ...searchMeta, kind: 'noMatch', query, results: [], reason: 'No matching Tool.',
    partialResults: false, assessed: { source: 'all', scope: 'complete', examined: 30, coverage: 'complete' },
    pagination: { limit: 8, hasMore: false }, next: [],
  }) satisfies ToolChoiceSearchOutput
  it('saves a need only once the keyword index is exhausted, with its original search filters', async () => {
    const filters = { view: 'tools' as const, query: 'missing-need', directoryCategory: 'weather' }
    searchMarketToolsServer.mockResolvedValue(noMatch('missing-need'))
    recordOwnerMarketDemand.mockResolvedValue({ kind: 'recorded', requestRef: 'request-1', query: 'missing-need', createdAt: 1 })
    const empty = { ...indexedPage, items: [] }
    const { updateCatalogue } = show(filters, [], { page: empty, catalogue: { ...indexedCatalogue, page: empty }, overview })
    await screen.findByText('Nothing on this page')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    updateCatalogue({ ...filters, provider: 'example.com' }, empty, { ...indexedCatalogue, page: empty, isDone: true })
    const saveNeed = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(saveNeed).toHaveProperty('disabled', false))
    fireEvent.click(saveNeed)
    await screen.findByText('No match yet')
    expect(screen.queryByRole('button', { name: 'Save this need' })).toBeNull()
    expect(recordOwnerMarketDemand).toHaveBeenCalledOnce()
    expect(recordOwnerMarketDemand).toHaveBeenCalledWith({ data: {
      query: 'missing-need', filters: { category: 'weather', provider: 'example.com' }, idempotencyKey: expect.any(String),
    } })
  })

  it('keys unmet need saves by search and filters, reusing a retry key without disabling a different scope', async () => {
    searchMarketToolsServer.mockResolvedValue(noMatch('unserved'))
    const failure = new Error('temporary failure')
    recordOwnerMarketDemand.mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-a', query: 'unserved', createdAt: 1 })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ kind: 'recorded', requestRef: 'need-b', query: 'unserved', createdAt: 2 })
    const empty = { ...indexedPage, items: [] }
    const { updateSearch } = show({ view: 'tools', query: 'unserved', provider: 'first.example.com' }, [], { page: empty, catalogue: { ...indexedCatalogue, page: empty, isDone: true }, overview })
    const firstButton = await screen.findByRole('button', { name: 'Save this need' })
    await waitFor(() => expect(firstButton).toHaveProperty('disabled', false))
    fireEvent.click(firstButton)
    await screen.findByText('No match yet')
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
    await screen.findByText('No match yet')
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
    expect(screen.getByText('No match yet')).toBeTruthy()
    expect(recordOwnerMarketDemand).toHaveBeenCalledTimes(3)
  })

})


it('switches Arc list and grid presentation without requesting another catalogue page or losing comparison', async () => {
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', network: 'eip155:8453', compare }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
  expect(screen.queryByRole('table', { name: 'Tools on this page' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Remove Tool 0 from comparison' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  await waitFor(() => expect(router.state.location.search).toMatchObject({ layout: 'table', compare, network: 'eip155:8453' }))
  expect(screen.getByRole('table', { name: 'Tools on this page' })).toBeTruthy()
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
  await waitFor(() => expect(screen.queryByRole('table', { name: 'Tools on this page' })).toBeNull())
  expect(router.state.location.search).toMatchObject({ layout: 'grid', compare, network: 'eip155:8453' })
  expect(screen.getByRole('button', { name: 'Remove Tool 0 from comparison' })).toBeTruthy()
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
})


it('clears an unsubmitted search draft and restores input focus without changing the catalogue URL', () => {
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', compare })
  const input = screen.getByRole('searchbox', { name: 'Search tools' })
  fireEvent.change(input, { target: { value: 'weather' } })
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(input).toHaveProperty('value', '')
  expect(document.activeElement).toBe(input)
  expect(router.state.location.search).toMatchObject({ view: 'tools', compare })
  expect(router.state.location.search).not.toHaveProperty('query')
  expect(searchMarketToolsServer).not.toHaveBeenCalled()
})

it('restores the list and its comparison context through history and a fresh render', async () => {
  const compare = entries[0]!.resource
  const { router } = show({ view: 'tools', network: 'eip155:8453', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
  expect(screen.queryByRole('table', { name: 'Tools on this page' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'List' }))
  await waitFor(() => expect(router.state.location.search.layout).toBe('table'))
  router.history.back()
  // This fixture supplies only RouterContextProvider; emulate RouterProvider loading the history location.
  await router.load()
  await waitFor(() => expect(router.state.location.search.layout).toBe('grid'))
  expect(screen.queryByRole('table', { name: 'Tools on this page' })).toBeNull()
  expect(router.state.location.search).toMatchObject({ compare, network: 'eip155:8453' })
  cleanup()
  show({ view: 'tools', network: 'eip155:8453', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
  expect(screen.getByRole('button', { name: 'Remove Tool 0 from comparison' })).toBeTruthy()
  expect(screen.queryByRole('table', { name: 'Tools on this page' })).toBeNull()
  expect(readX402DirectoryCatalogueServer).not.toHaveBeenCalled()
})


describe('visible Arc catalogue facets', () => {
  it('keeps popular searches and applied filters beside results with comparison and layout intact', async () => {
    searchMarketToolsServer.mockResolvedValue({ ...searchMeta, kind: 'scoped', results: [], reason: 'More pages remain.' })
    const compare = entries[0]!.resource
    const { router } = show({ ...nativeFilters, query: 'weather', sort: 'relevance', compare, layout: 'grid' }, undefined, { page: indexedPage, catalogue: indexedCatalogue, overview })
    const searches = screen.getByRole('navigation', { name: 'Popular searches' })
    expect(within(searches).getByRole('link', { name: 'Weather' }).getAttribute('aria-current')).toMatch(/^(page|true)$/u)
    expect(within(searches).getByRole('link', { name: 'News' }).getAttribute('aria-current')).toBeNull()
    const news = toolHref(within(searches).getByRole('link', { name: 'News' }))
    expect(news.searchParams.get('query')).toBe('news')
    expect(news.searchParams.get('sort')).toBe('relevance')
    expect(news.searchParams.get('compare')).toBe(compare)
    expect(news.searchParams.get('layout')).toBe('grid')
    expectNativeFilters(news.searchParams)
    const applied = screen.getByRole('group', { name: 'Applied filters' })
    fireEvent.click(within(applied).getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ query: 'weather', sort: 'relevance', compare, layout: 'grid' }))
    expect(screen.queryByRole('dialog', { name: 'Filter tools' })).toBeNull()
  })
})

it('drops unrelated route context when changing the market layout while retaining exact comparison and filters', async () => {
  const first = entries[0]
  if (first === undefined) throw new Error('Expected catalogue fixture')
  const compare = first.resource
  const routeContext = { view: 'tools' as const, provider: 'example.com', layout: 'table' as const, compare, sort: 'adoption' as const, accountRef: 'other-route-account', q: 'owner-inventory-search' }
  const { router } = show(routeContext)
  fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
  await waitFor(() => expect(router.state.location.search.layout).toBe('grid'))
  expect(router.state.location.search.provider).toBe('example.com')
  expect(router.state.location.search.compare).toBe(compare)
  expect(router.state.location.search.sort).toBe('adoption')
  expect(router.state.location.search).not.toHaveProperty('accountRef')
  expect(router.state.location.search).not.toHaveProperty('q')
})

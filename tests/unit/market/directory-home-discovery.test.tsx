/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryHomeDiscovery } from '@/components/ae/market/DirectoryHomeDiscovery'
import { validateMarketSearch } from '@/modules/market/market-route-data'
import { X402_MARKETPLACE_RAILS, type X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { MarketNavigationProvider, type MarketPath } from '@/components/ae/market/market-navigation-context'

const entryForRail = (id: string): X402DirectoryEntry => ({
  resource: `https://${id}.example.com/${id}`,
  title: `${id} Tool`,
  description: 'A useful tool.',
  provider: `${id}.example.com`,
  protocol: 'http',
  prices: [],
  metadataJson: '{}',
  slug: id,
})
const home: X402MarketplaceHome = {
  observedAt: '2026-09-08T13:00:00Z',
  rails: X402_MARKETPLACE_RAILS.map(rail => ({ ...rail, items: [entryForRail(rail.id)] })),
}
const noop = () => false
const compareRef = 'https://saved.example.com/one'
const initialSearch = `?view=providers&query=invoice&provider=old.example.com&maxUsdPrice=25&sort=relevance&compare=${encodeURIComponent(compareRef)}&layout=grid`
const emptyCollections: ReadonlyArray<Readonly<{ label: string; home: X402MarketplaceHome; marketPath: MarketPath }>> = [
  { label: 'no supplied rails at /market', home: { ...home, rails: [] }, marketPath: '/market' },
  { label: 'no supplied rails at /owner/market', home: { ...home, rails: [] }, marketPath: '/owner/market' },
  { label: 'supplied empty rails at /market', home: { ...home, rails: home.rails.map(rail => ({ ...rail, items: [] })) }, marketPath: '/market' },
  { label: 'supplied empty rails at /owner/market', home: { ...home, rails: home.rails.map(rail => ({ ...rail, items: [] })) }, marketPath: '/owner/market' },
]
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function show(data = home, options: Readonly<{ marketPath?: MarketPath; search?: string }> = {}) {
  const marketPath = options.marketPath ?? '/market'
  const root = createRootRoute()
  const marketRoute = { getParentRoute: () => root, validateSearch: validateMarketSearch }
  const router = createRouter({ defaultViewTransition: true, routeTree: root.addChildren([
    createRoute({ ...marketRoute, path: '/market' }),
    createRoute({ ...marketRoute, path: '/owner/market' }),
    createRoute({ getParentRoute: () => root, path: '/tools/$providerHost/$slug' }),
  ]), history: createMemoryHistory({ initialEntries: [`${marketPath}${options.search ?? initialSearch}`] }) })
  await router.load()
  const save = vi.fn(), compare = vi.fn()
  render(<RouterContextProvider router={router}><MarketNavigationProvider path={marketPath}><DirectoryHomeDiscovery home={data} onSave={save} onCompare={compare} isSaved={noop} isComparing={noop} compareDisabled={noop} /></MarketNavigationProvider></RouterContextProvider>)
  return { save, compare, router }
}
function seeAllUrl(name: string) {
  return new URL(screen.getByRole('link', { name }).getAttribute('href') ?? '/', 'https://aecon.ai')
}
it('renders evidence rails in order with scoped Tools links for each sort', async () => {
  const { save, compare } = await show()
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
    'Most used this month',
    'Recently paid',
    'Repeat buyers',
    'Cheapest proven',
  ])
  for (const [title, sort] of [['Most used this month', 'adoption'], ['Recently paid', 'active'], ['Repeat buyers', 'repeat'], ['Cheapest proven', 'price_asc']]) {
    const url = seeAllUrl(`See all ${title}`)
    expect(url.pathname).toBe('/market')
    expect(url.searchParams.get('view')).toBe('tools')
    expect(url.searchParams.get('sort')).toBe(sort)
    expect(url.searchParams.get('compare')).toBe(compareRef)
    expect(url.searchParams.get('layout')).toBe('grid')
    for (const filter of ['query', 'provider', 'maxUsdPrice']) expect(url.searchParams.has(filter)).toBe(false)
  }
  const entry = entryForRail('adoption')
  const toolUrl = new URL(screen.getByRole('link', { name: entry.title }).getAttribute('href') ?? '/', 'https://aecon.ai')
  expect(toolUrl.pathname).toBe(`/tools/${entry.provider}/${entry.slug}`)
  fireEvent.click(screen.getByRole('button', { name: `Save ${entry.title}` }))
  fireEvent.click(screen.getByRole('button', { name: `Add ${entry.title} to comparison` }))
  for (const callback of [save, compare]) expect(callback).toHaveBeenCalledWith({ entry, search: {} })
})
it('keeps ordinary clicks in the entered Market route without starting a browser view transition', async () => {
  const { router } = await show(home, { marketPath: '/owner/market' })
  const link = screen.getByRole('link', { name: 'See all Most used this month' })
  expect(seeAllUrl('See all Most used this month').pathname).toBe('/owner/market')

  const original = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  const startViewTransition = vi.fn((update: () => Promise<void>) => ({ updateCallbackDone: update() }))
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition })
  try {
    fireEvent.click(link)
    await waitFor(() => expect(router.state.location.pathname).toBe('/owner/market'))
    await waitFor(() => expect(router.state.location.search).toMatchObject({
      view: 'tools', sort: 'adoption', compare: compareRef, layout: 'grid',
    }))
    expect(router.state.location.search).not.toHaveProperty('query')
    expect(router.state.location.search).not.toHaveProperty('provider')
    expect(startViewTransition).not.toHaveBeenCalled()
  } finally {
    if (original === undefined) Reflect.deleteProperty(document, 'startViewTransition')
    else Object.defineProperty(document, 'startViewTransition', original)
  }
})
it('omits empty evidence rails', async () => {
  await show({ ...home, rails: home.rails.map(rail => rail.id === 'repeat' ? { ...rail, items: [] } : rail) })
  expect(screen.queryByRole('heading', { name: 'Repeat buyers' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'See all Repeat buyers' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Most used this month' })).toBeTruthy()
})
it.each(emptyCollections)('shows truthful empty Collections and a native browse destination for $label', async ({ home: emptyHome, marketPath }) => {
  const { save, compare, router } = await show(emptyHome, { marketPath })
  const browse = screen.getByRole('link', { name: 'Browse Tools' })
  const url = new URL(browse.getAttribute('href') ?? '/', 'https://aecon.ai')

  expect(screen.getByRole('heading', { name: 'Collections are taking shape' })).toBeTruthy()
  expect(screen.getAllByRole('heading')).toHaveLength(1)
  for (const rail of ['Most used this month', 'Recently paid', 'Repeat buyers', 'Cheapest proven']) {
    expect(screen.queryByText(rail)).toBeNull()
  }
  expect(screen.queryByRole('link', { name: /See all/ })).toBeNull()
  expect(screen.queryByText(/\b\d[\d,]*\s+(?:Tools|Providers|items?)\b/i)).toBeNull()
  expect(screen.getAllByRole('link')).toEqual([browse])
  expect(screen.queryByRole('button', { name: /save|compare/i })).toBeNull()

  expect(url.pathname).toBe(marketPath)
  expect(url.searchParams.get('view')).toBe('tools')
  expect(url.searchParams.get('compare')).toBe(compareRef)
  expect(url.searchParams.get('layout')).toBe('grid')
  for (const filter of ['query', 'provider', 'maxUsdPrice', 'sort']) expect(url.searchParams.has(filter)).toBe(false)

  const original = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  const startViewTransition = vi.fn((update: () => Promise<void>) => ({ updateCallbackDone: update() }))
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: startViewTransition })
  try {
    fireEvent.click(browse)
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: 'tools', compare: compareRef, layout: 'grid' }))
    expect(router.state.location.pathname).toBe(marketPath)
    for (const filter of ['query', 'provider', 'maxUsdPrice', 'sort']) expect(router.state.location.search).not.toHaveProperty(filter)
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(compare).not.toHaveBeenCalled()
  } finally {
    if (original === undefined) Reflect.deleteProperty(document, 'startViewTransition')
    else Object.defineProperty(document, 'startViewTransition', original)
  }
})
it('limits each rendered shelf to eight Tools', async () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    ...entryForRail('adoption'),
    title: `Adoption Tool ${index}`,
    resource: `https://adoption.example.com/${index}`,
  }))
  await show({ ...home, rails: home.rails.map(rail => rail.id === 'adoption' ? { ...rail, items } : rail) })
  for (let index = 0; index < 8; index++) expect(screen.getByRole('link', { name: `Adoption Tool ${index}` })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Adoption Tool 8' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Next Most used this month Tools' })).toBeTruthy()
})

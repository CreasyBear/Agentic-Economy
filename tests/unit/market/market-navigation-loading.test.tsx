/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeMarketPage, type AeMarketPageProps } from '@/components/ae/market/AeMarketPage'
import { AeX402Directory } from '@/components/ae/market/AeX402Directory'
import { Route as ProductionMarketRoute } from '@/routes/market'
import { validateMarketSearch } from '@/modules/market/market-route-data'

// This boundary records the catalogue passed to the existing Arc presenter.
// Its actual pending-panel and keyboard behavior has separate directory tests.
vi.mock('@/components/ae/market/AeX402Directory', () => ({
  AeX402Directory: ({ activeView, pendingView, page }: ComponentProps<typeof AeX402Directory>) => <div>
    <h1>Tool market</h1>
    <p>Selected: {pendingView ?? activeView}</p>
    {pendingView === undefined
      ? <p>Committed: {activeView} · {page.kind === 'ok' ? page.items.length : 'unavailable'}</p>
      : <p role="status">Loading {pendingView}</p>}
    <input aria-label="Retained market input" defaultValue="" />
  </div>,
}))
vi.mock('@/components/ae/layout/AePublicPage', () => ({ AePublicPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

afterEach(cleanup)

type Data = AeMarketPageProps['data']
type View = Data['view']
function data(view: View): Data {
  return {
    view, page: { kind: 'ok', items: [], offset: 0, limit: 24 },
    catalogue: { kind: 'ok', source: 'index', page: { kind: 'ok', items: [], offset: 0, limit: 24, mode: 'browse', appliedFilters: {} }, searchMethod: 'native_index', isDone: true },
    overview: { kind: 'unavailable', reason: 'source_unavailable' }, providers: undefined,
    home: undefined, compareEntries: [], jevRecipient: null, chatRecipient: null,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function market(loader: (view: View) => Promise<Data>, initial = '/market?view=tools') {
  const pendingMs = ProductionMarketRoute.options.pendingMs
  if (pendingMs === undefined) throw new Error('market_pending_policy_missing')
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root, path: '/market', validateSearch: validateMarketSearch,
    loaderDeps: ({ search }) => ({ view: search.view ?? 'discover' }),
    loader: ({ deps }) => loader(deps.view),
    pendingMs,
    pendingComponent: () => <p>Whole page pending</p>,
    component: () => <AeMarketPage data={route.useLoaderData()} search={route.useSearch()} />,
  })
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [initial] }) })
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

describe('market navigation loading boundary', () => {
  it('selects a requested view immediately, keeps its frame mounted through a slow load, and rejects an obsolete response', async () => {
    const providers = deferred<Data>()
    const collections = deferred<Data>()
    const router = await market(view => view === 'providers' ? providers.promise : view === 'discover' ? collections.promise : Promise.resolve(data(view)))
    const input = screen.getByRole('textbox', { name: 'Retained market input' })
    fireEvent.change(input, { target: { value: 'Keep this draft' } })
    act(() => { void router.navigate({ to: '/market', search: { view: 'providers' } }) })
    await screen.findByText('Loading providers')
    expect(screen.queryByText('Committed: tools · 0')).toBeNull()
    // Exceed the previous route's 1000ms whole-page fallback threshold.
    await act(async () => { await new Promise(done => setTimeout(done, 1100)) })
    expect(screen.queryByText('Whole page pending')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Retained market input' })).toBe(input)
    expect((input as HTMLInputElement).value).toBe('Keep this draft')
    act(() => { void router.navigate({ to: '/market', search: { view: 'discover' } }) })
    await screen.findByText('Loading discover')
    await act(async () => { providers.resolve(data('providers')) })
    expect(screen.getByText('Loading discover')).toBeTruthy()
    expect(screen.queryByText('Committed: providers · 0')).toBeNull()
    await act(async () => { collections.resolve(data('discover')) })
    await screen.findByRole('heading', { name: 'Intelligence, put to work.' })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Retained market input' })).toBeNull()
  })

  it('returns to the previous source with explicit recovery when the requested catalogue is unavailable', async () => {
    const providers = deferred<Data>()
    const router = await market(view => view === 'providers' ? providers.promise : Promise.resolve(data(view)))
    act(() => { void router.navigate({ to: '/market', search: { view: 'providers' } }) })
    await screen.findByText('Loading providers')
    await act(async () => { providers.resolve({ ...data('providers'), page: { kind: 'unavailable', reason: 'source_unavailable' }, catalogue: { kind: 'unavailable', reason: 'source_unavailable' } }) })
    await screen.findByText('Committed: tools · 0')
    expect(screen.getByRole('alert').textContent).toContain('The previous catalogue is still shown.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Loading providers')).toBeNull())
  })

  it('shows the requested unavailable catalogue instead of retaining the synthetic landing', async () => {
    const router = await market(view => Promise.resolve(view === 'tools'
      ? { ...data('tools'), page: { kind: 'unavailable', reason: 'source_unavailable' }, catalogue: { kind: 'unavailable', reason: 'source_unavailable' } }
      : data(view)), '/market')
    await screen.findByRole('heading', { name: 'Intelligence, put to work.' })
    await act(async () => { await router.navigate({ to: '/market', search: { view: 'tools' } }) })
    expect(screen.getByText('Committed: tools · unavailable')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Intelligence, put to work.' })).toBeNull()
  })

  it('opens a category with existing constraints and transfers keyboard focus to the results', async () => {
    const router = await market(view => Promise.resolve(data(view)), '/market?view=discover&maxUsdPrice=2&layout=grid')
    const category = await screen.findByRole('link', { name: /Finance.*Pricing/ })
    category.focus()
    fireEvent.click(category)
    await screen.findByText('Committed: tools · 0')
    expect(router.state.location.search).toMatchObject({ view: 'tools', query: 'Finance', sort: 'relevance', maxUsdPrice: 2, layout: 'grid' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Tool market' })))
  })

})

/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import { afterEach, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryHostsPage } from '@/components/ae/market/DirectoryHostsPage'
import { validateMarketSearch, type MarketSearch } from '@/modules/market/market-route-data'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'
const result: X402DirectoryProvidersPage = { kind: 'ok', coverage: { source: 'coinbase', generation: 'scan', indexedTotal: 4000, reportedTotal: 4000, reportedTotalAtStart: 4000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 20, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }, page: [{ key: 'example.com', label: 'Example', count: 142 }], isDone: false, continueCursor: 'opaque:+/=?#' }
afterEach(cleanup)
function show(search: MarketSearch) {
  const root = createRootRoute()
  const route = createRoute({ getParentRoute: () => root, path: '/market', validateSearch: validateMarketSearch })
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/market?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`] }) })
  render(<RouterContextProvider router={router}><DirectoryHostsPage result={result} search={search} /></RouterContextProvider>)
  return router
}
it('submits a normalized hostname prefix before paging, preserving comparison/layout and dropping unrelated Tool filters', async () => {
  const router = show({ view: 'providers', query: 'old', providerCursor: 'old-page', compare: 'https://example.com/tool', layout: 'grid', network: 'base' })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a directory Host' }), { target: { value: '  API.Example  ' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Find a directory Host' }))
  await waitFor(() => expect(router.state.location.search).toEqual({ view: 'providers', query: 'api.example', compare: 'https://example.com/tool', layout: 'grid' }))
})
it('refuses URL/path/overlong input with field focus and no navigation', async () => {
  const router = show({ view: 'providers' })
  const field = screen.getByRole('searchbox', { name: 'Find a directory Host' })
  for (const value of ['https://example.com', 'example.com/tools', 'a'.repeat(201)]) {
    fireEvent.change(field, { target: { value } })
    fireEvent.submit(screen.getByRole('form', { name: 'Find a directory Host' }))
    expect(screen.getByRole('alert').textContent).toContain('200 characters or fewer')
    expect(document.activeElement).toBe(field)
    expect(router.state.location.search).toEqual({ view: 'providers' })
  }
})
it('uses native route links for tabs, clear, exact host and opaque continuation without locally filtering supplied rows', async () => {
  const router = show({ view: 'providers', query: 'z', compare: 'selected-tool', layout: 'grid', providerCursor: 'first' })
  expect(screen.getByRole('tab', { name: 'Directory Hosts' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getAllByRole('tab').map(tab => tab.tagName)).toEqual(['A', 'A', 'A', 'A'])
  expect(screen.getByRole('link', { name: 'View Tools from example.com' })).toBeTruthy()
  const url = (name: string) => new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.test')
  expect(Object.fromEntries(url('Next Hosts').searchParams)).toEqual({ view: 'providers', query: 'z', providerCursor: 'opaque:+/=?#', compare: 'selected-tool', layout: 'grid' })
  expect(Object.fromEntries(url('Clear prefix').searchParams)).toEqual({ view: 'providers', compare: 'selected-tool', layout: 'grid' })
  expect(Object.fromEntries(url('View Tools from example.com').searchParams)).toEqual({ view: 'tools', provider: 'example.com', compare: 'selected-tool', layout: 'grid' })
  expect(screen.getByText(/eligible listings/)).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Next Hosts' }))
  await waitFor(() => expect(router.state.location.search.providerCursor).toBe('opaque:+/=?#'))
  router.history.back()
  // RouterContextProvider fixture supplies no RouterProvider history subscription.
  await router.load()
  await waitFor(() => expect(router.state.location.search.providerCursor).toBe('first'))
})

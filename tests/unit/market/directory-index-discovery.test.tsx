/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryIndexDiscovery } from '@/components/ae/market/DirectoryIndexDiscovery'
import type { X402DirectoryCatalogueOverview } from '@/modules/market/x402-directory-catalogue'
import type { X402IndexedDirectoryEntry } from '@/modules/market/x402-directory-index'

function indexed(id: number, provider = 'repeat.example.com'): X402IndexedDirectoryEntry {
  return { entry: { resource: `https://${provider}/tool/${id}`, title: `Tool ${id}`, description: `Description ${id}`, provider, protocol: 'http', prices: [], metadataJson: '{}', activity: { calls30d: 1_000 - id }, provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: '2026-09-08T12:00:00Z' }, slug: `tool-${id}` }, category: 'unclassified', categorySource: 'unclassified', observedAt: 1, sourceDigest: `digest-${id}` }
}
type Overview = Extract<X402DirectoryCatalogueOverview, { kind: 'ok' }>
const popular = Array.from({ length: 12 }, (_, index) => indexed(index, index < 3 ? 'repeat.example.com' : `provider${index}.example.com`))
const overview: Overview = {
  kind: 'ok', coverage: { source: 'coinbase', generation: 'scan-1', indexedTotal: 14455, reportedTotal: 14455, reportedTotalAtStart: 14455, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 145, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' },
  popular, recentlyUpdated: [indexed(23), indexed(22), indexed(21)], categories: [], networks: [],
  providers: Array.from({ length: 12 }, (_, index) => { const name = `${String.fromCharCode(97 + index)}.example.com`; return { key: name, label: name, count: index === 0 ? 14451 : index, iconUrl: `https://icons.example.com/${index}.png` } }),
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function show(data = overview) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/market' }), createRoute({ getParentRoute: () => root, path: '/tools/$providerHost/$slug' })]), history: createMemoryHistory({ initialEntries: ['/market'] }) })
  const save = vi.fn(), compare = vi.fn()
  render(<RouterContextProvider router={router}><DirectoryIndexDiscovery overview={data} onSave={save} onCompare={compare} isSaved={resource => resource === popular[1]!.entry.resource} isComparing={resource => resource === popular[1]!.entry.resource} compareDisabled={resource => resource === popular[2]!.entry.resource} /></RouterContextProvider>)
  return { save, compare }
}
function linkSearch(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai').searchParams }

it('preserves all source-ranked entries including repeated Providers and uses truthful ranked browse links', () => {
  show()
  const popularShelf = screen.getByRole('region', { name: 'Popular Tools' })
  expect(within(popularShelf).getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(popular.map(item => item.entry.title))
  const updatedShelf = screen.getByRole('region', { name: 'Recently updated' })
  expect(within(updatedShelf).getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(['Tool 23', 'Tool 22', 'Tool 21'])
  expect(within(updatedShelf).getAllByText('Updated 8 Sept 2026')).toHaveLength(3)
  expect(linkSearch('View all popular tools').get('sort')).toBe('popular')
  expect(linkSearch('View all recently updated').get('sort')).toBe('updated')
  for (const name of ['View all popular tools', 'View all recently updated']) {
    expect(linkSearch(name).get('view')).toBe('tools')
    expect(linkSearch(name).has('query')).toBe(false)
  }
  expect(screen.queryByText(/new Tools|newly added/iu)).toBeNull()
})
it('passes exact resources with an empty source search and preserves saved and comparison control state', () => {
  const { save, compare } = show()
  const toolUrl = new URL(screen.getByRole('link', { name: 'Tool 0' }).getAttribute('href')!, 'https://aecon.ai')
  expect(toolUrl.pathname).toBe(`/tools/${popular[0]!.entry.provider}/${popular[0]!.entry.slug}`)
  fireEvent.click(screen.getByRole('button', { name: 'Save Tool 0' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add Tool 0 to comparison' }))
  for (const callback of [save, compare]) expect(callback).toHaveBeenCalledWith({ entry: popular[0]!.entry, search: {} })
  expect(screen.getByRole('button', { name: 'Unsave Tool 1' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Remove Tool 1 from comparison' }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByRole('button', { name: 'Add Tool 2 to comparison' }) as HTMLButtonElement).disabled).toBe(true)
})
it('shows the supplied twelve A–Z Provider samples with global counts and scoped browse links', () => {
  show()
  const section = screen.getByRole('region', { name: 'Explore Providers' })
  const links = within(section).getAllByRole('link', { name: /^View Tools from/u })
  expect(links.map(link => link.getAttribute('aria-label'))).toEqual(overview.providers.map(provider => `View Tools from ${provider.label}`))
  expect(links).toHaveLength(12)
  expect(within(section).getByText('14,451 Tools')).toBeTruthy()
  expect(within(section).getByText('1 Tool')).toBeTruthy()
  expect(linkSearch('All Providers').get('view')).toBe('providers')
  for (const provider of overview.providers) {
    const search = linkSearch(`View Tools from ${provider.label}`)
    expect(search.get('provider')).toBe(provider.key)
    expect(search.get('view')).toBe('tools')
  }
})
it('keeps honest empty ranked shelves and navigation available without fake activity or dates', () => {
  show({ ...overview, popular: [], recentlyUpdated: [], providers: [] })
  expect(screen.getByText('No reported Call activity is available for this selection yet.')).toBeTruthy()
  expect(screen.getByText('No published update dates are available for this selection yet.')).toBeTruthy()
  expect(screen.getByText('No Provider hostnames are available for this selection.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Next Popular Tools' })).toBeNull()
  expect(screen.getByRole('link', { name: 'View all popular tools' })).toBeTruthy()
})

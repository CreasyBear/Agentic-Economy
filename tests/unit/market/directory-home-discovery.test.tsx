/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryHomeDiscovery } from '@/components/ae/market/DirectoryHomeDiscovery'
import { X402_MARKETPLACE_RAILS, type X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

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
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function show(data = home) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/market' }), createRoute({ getParentRoute: () => root, path: '/tools/$providerHost/$slug' })]), history: createMemoryHistory({ initialEntries: ['/market'] }) })
  const save = vi.fn(), compare = vi.fn()
  render(<RouterContextProvider router={router}><DirectoryHomeDiscovery home={data} onSave={save} onCompare={compare} isSaved={noop} isComparing={noop} compareDisabled={noop} /></RouterContextProvider>)
  return { save, compare }
}
it('renders evidence rails in order with See all links for each sort', () => {
  const { save, compare } = show()
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
    'Most used this month',
    'Recently paid',
    'Repeat buyers',
    'Cheapest proven',
  ])
  expect(screen.getByRole('link', { name: 'See all Most used this month' }).getAttribute('href')).toBe('/market?sort=adoption')
  expect(screen.getByRole('link', { name: 'See all Recently paid' }).getAttribute('href')).toBe('/market?sort=active')
  expect(screen.getByRole('link', { name: 'See all Repeat buyers' }).getAttribute('href')).toBe('/market?sort=repeat')
  expect(screen.getByRole('link', { name: 'See all Cheapest proven' }).getAttribute('href')).toBe('/market?sort=price_asc')
  const entry = entryForRail('adoption')
  const toolUrl = new URL(screen.getByRole('link', { name: entry.title }).getAttribute('href') ?? '/', 'https://aecon.ai')
  expect(toolUrl.pathname).toBe(`/tools/${entry.provider}/${entry.slug}`)
  fireEvent.click(screen.getByRole('button', { name: `Save ${entry.title}` }))
  fireEvent.click(screen.getByRole('button', { name: `Add ${entry.title} to comparison` }))
  for (const callback of [save, compare]) expect(callback).toHaveBeenCalledWith({ entry, search: {} })
})
it('omits empty evidence rails', () => {
  show({ ...home, rails: home.rails.map(rail => rail.id === 'repeat' ? { ...rail, items: [] } : rail) })
  expect(screen.queryByRole('heading', { name: 'Repeat buyers' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'See all Repeat buyers' })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Most used this month' })).toBeTruthy()
})
it('limits each rendered shelf to eight Tools', () => {
  const items = Array.from({ length: 10 }, (_, index) => ({
    ...entryForRail('adoption'),
    title: `Adoption Tool ${index}`,
    resource: `https://adoption.example.com/${index}`,
  }))
  show({ ...home, rails: home.rails.map(rail => rail.id === 'adoption' ? { ...rail, items } : rail) })
  for (let index = 0; index < 8; index++) expect(screen.getByRole('link', { name: `Adoption Tool ${index}` })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Adoption Tool 8' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Next Most used this month Tools' })).toBeTruthy()
})

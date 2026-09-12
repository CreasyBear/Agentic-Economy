/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryHomeDiscovery } from '@/components/ae/market/DirectoryHomeDiscovery'
import { X402_MARKETPLACE_COLLECTIONS, type X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const entry: X402DirectoryEntry = { resource: 'https://example.com/generate', title: 'Generate a picture', description: 'Create a picture from a text prompt.', provider: 'example.com', protocol: 'http', prices: [], metadataJson: '{}', slug: 'generate' }
const home: X402MarketplaceHome = { observedAt: '2026-09-08T13:00:00Z', rails: X402_MARKETPLACE_COLLECTIONS.map(collection => ({ ...collection, kind: 'ok', search: { query: collection.query }, items: collection.id === 'creative' ? [entry] : [], returnedCount: collection.id === 'creative' ? 1 : 0, partialResults: false })) }
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
function toolHref(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai') }
it('orders editorial collections and preserves each source search in links and callbacks', () => {
  const { save, compare } = show()
  expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Bring an idea into view', 'Find answers worth building on', 'Give your agent a workbench', 'Make sense of the markets', 'Find the right product', 'Know who you are working with'])
  const href = screen.getByRole('link', { name: 'View Creative collection' }).getAttribute('href')!
  const url = new URL(href, 'https://aecon.ai')
  expect(url.searchParams.get('query')).toBe('image generation creative')
  const toolUrl = toolHref(entry.title)
  expect(toolUrl.pathname).toBe(`/tools/${entry.provider}/${entry.slug}`)
  fireEvent.click(screen.getByRole('button', { name: `Save ${entry.title}` }))
  fireEvent.click(screen.getByRole('button', { name: `Add ${entry.title} to comparison` }))
  for (const callback of [save, compare]) expect(callback).toHaveBeenCalledWith({ entry, search: { query: 'image generation creative' } })
})
it('keeps healthy collections visible after a local failure and limits each shelf to eight Tools', () => {
  show({ ...home, rails: home.rails.map(rail => rail.id === 'research' ? { ...rail, kind: 'unavailable' } : rail.id === 'creative' ? { ...rail, items: Array.from({ length: 10 }, (_, i) => ({ ...entry, title: `Creative Tool ${i}`, resource: `${entry.resource}/${i}` })) } : rail) })
  expect(screen.getByRole('status').textContent).toContain('This collection could not be loaded')
  for (let i = 0; i < 8; i++) expect(screen.getByRole('link', { name: `Creative Tool ${i}` })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Creative Tool 8' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Next Creative Tools' })).toBeTruthy()
})

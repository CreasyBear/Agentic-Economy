/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
vi.mock('@tanstack/react-router', () => ({ Link: ({ search, children, to, params, ...props }: { search?: Record<string, string>; children: ReactNode; to: string; params?: Record<string, string> }) => {
  const path = params === undefined ? to : Object.entries(params).reduce((acc, [key, value]) => acc.replace(`$${key}`, value), to)
  const query = search === undefined ? '' : `?${new URLSearchParams(search).toString()}`
  return <a href={`${path}${query}`} {...props}>{children}</a>
} }))
import { DirectoryProvidersIndex } from '@/components/ae/market/DirectoryProvidersIndex'
import type { X402DirectoryIndexCoverage } from '@/modules/market/x402-directory-index'
afterEach(cleanup)
const coverage: X402DirectoryIndexCoverage = { source: 'coinbase', generation: 'scan', indexedTotal: 4000, reportedTotal: 4000, reportedTotalAtStart: 4000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 20, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }
it('shows complete indexed Provider counts and links to exact storefronts and separate pagination', () => {
  render(<DirectoryProvidersIndex result={{ kind: 'ok', coverage, page: [
    { key: 'example.com', label: 'Example', count: 142, leadCalls: 5900, leadPayers: 87, leadPrice: '0.001', leadTitle: 'Search', leadSlug: 'search' },
    { key: 'other.example.com', label: 'Other', count: 1 },
  ], isDone: false, continueCursor: 'cursor:+/=' }} />)
  expect(screen.getByRole('columnheader', { name: 'Calls' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Tools' })).toBeTruthy()
  expect(screen.getByText('142').getAttribute('title')).toBe('142 Tools in the indexed catalogue')
  expect(screen.getByText('1').getAttribute('title')).toBe('1 Tool in the indexed catalogue')
  expect(screen.getByText('5,900')).toBeTruthy()
  const priceCell = screen.getByRole('link', { name: 'View Tools from example.com' }).closest('tr')?.querySelectorAll('td')[1]
  const [buyerPrice, sourcePrice] = priceCell?.querySelectorAll('p') ?? []
  expect(buyerPrice?.textContent).toBe('US$0.001')
  expect(buyerPrice?.textContent).not.toContain('USDC')
  expect(sourcePrice?.textContent).toMatch(/Provider.*0\.001 USDC/)
  const store = new URL(screen.getByRole('link', { name: 'View Tools from example.com' }).getAttribute('href')!, 'https://aecon.ai')
  expect(Object.fromEntries(store.searchParams)).toEqual({ view: 'tools', provider: 'example.com' })
  const lead = screen.getByRole('link', { name: 'Search' }).getAttribute('href')
  expect(lead).toBe('/tools/example.com/search')
  const next = new URL(screen.getByRole('link', { name: 'Next Providers' }).getAttribute('href')!, 'https://aecon.ai')
  expect(Object.fromEntries(next.searchParams)).toEqual({ view: 'providers', providerCursor: 'cursor:+/=' })
  expect(screen.queryByText(/verified|rating/i)).toBeNull()
})
it('keeps an empty intermediate page traversable and hides next on the final page', () => {
  const { rerender } = render(<DirectoryProvidersIndex result={{ kind: 'ok', coverage, page: [], isDone: false, continueCursor: 'next' }} />)
  expect(screen.getByRole('status').textContent).toContain('No Providers on this page')
  expect(screen.getByRole('link', { name: 'Next Providers' })).toBeTruthy()
  rerender(<DirectoryProvidersIndex result={{ kind: 'ok', coverage, page: [], isDone: true, continueCursor: '' }} />)
  expect(screen.queryByRole('link', { name: 'Next Providers' })).toBeNull()
})
it('reports index failure without presenting a sampled complete list', () => {
  render(<DirectoryProvidersIndex result={{ kind: 'unavailable', reason: 'index_unavailable' }} />)
  expect(screen.getByRole('heading', { name: 'Explore Providers' })).toBeTruthy()
  expect(screen.getByText('The discovery service could not be reached. Try again.')).toBeTruthy()
  const tryAgain = new URL(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')!, 'https://aecon.ai')
  expect(Object.fromEntries(tryAgain.searchParams)).toEqual({ view: 'providers' })
  const browse = new URL(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')!, 'https://aecon.ai')
  expect(Object.fromEntries(browse.searchParams)).toEqual({ view: 'tools' })
})

/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
vi.mock('@tanstack/react-router', () => ({ Link: ({ search, children, to, params, reloadDocument: _reloadDocument, ...props }: { search?: Record<string, string>; children: ReactNode; to: string; params?: Record<string, string>; reloadDocument?: boolean }) => {
  const path = params === undefined ? to : Object.entries(params).reduce((acc, [key, value]) => acc.replace(`$${key}`, value), to)
  const query = search === undefined ? '' : `?${new URLSearchParams(search).toString()}`
  return <a href={`${path}${query}`} {...props}>{children}</a>
} }))
import { DirectoryProvidersIndex } from '@/components/ae/market/DirectoryProvidersIndex'
import type { X402DirectoryIndexCoverage } from '@/modules/market/x402-directory-index'
afterEach(cleanup)
const coverage: X402DirectoryIndexCoverage = { source: 'coinbase', generation: 'scan', indexedTotal: 4000, reportedTotal: 4000, reportedTotalAtStart: 4000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 20, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }
const search = { query: 'example', compare: 'https://example.com/tool', layout: 'table' as const, providerCursor: 'prior' }
function href(name: string) { return new URL(screen.getByRole('link', { name }).getAttribute('href')!, 'https://aecon.ai') }
it('shows whole-index tool counts, exact host and example destinations, and scoped opaque pagination', () => {
  render(<DirectoryProvidersIndex search={search} result={{ kind: 'ok', coverage, page: [
    { key: 'example.com', label: 'Example', count: 142, leadCalls: 5900, leadPayers: 87, leadPrice: '0.001', leadTitle: 'Search', leadSlug: 'search' },
    { key: 'other.example.com', label: 'Other', count: 1 },
  ], isDone: false, continueCursor: 'cursor:+/=' }} />)
  const table = screen.getByRole('table', { name: 'Providers' })
  expect(within(table).getAllByRole('columnheader').filter(header => !header.hasAttribute('aria-hidden')).map(header => header.textContent?.trim())).toEqual(['Provider', 'Example tool', 'Tools'])
  expect(within(table).queryAllByRole('button', { name: /^Sort by/ })).toHaveLength(0)
  expect(within(table).getByRole('link', { name: 'See tools from other.example.com' }).getAttribute('title')).toBe('other.example.com')
  expect([...table.querySelectorAll('tbody tr')].map(row => row.querySelector('a[aria-label^="See tools from"]')?.textContent)).toEqual(['example.com', 'other.example.com'])
  expect(within(table).getByText('142')).toBeTruthy()
  expect(within(table).getByText('1')).toBeTruthy()
  expect(screen.queryByText('5,900')).toBeNull()
  expect(screen.queryByText('87')).toBeNull()
  expect(screen.queryByText(/USDC|US\$|Price unavailable/)).toBeNull()
  expect(Object.fromEntries(href('See tools from example.com').searchParams)).toEqual({ view: 'tools', provider: 'example.com', compare: search.compare, layout: 'table' })
  expect(href('Search').pathname).toBe('/tools/example.com/search')
  expect(Object.fromEntries(href('Next').searchParams)).toEqual({ view: 'providers', query: 'example', compare: search.compare, layout: 'table', providerCursor: 'cursor:+/=' })
  expect(Object.fromEntries(href('First page').searchParams)).toEqual({ view: 'providers', query: 'example', compare: search.compare, layout: 'table' })
  expect(screen.queryByText(/verified|rating/i)).toBeNull()
})
it('renders readable cards without inventing missing example or activity facts', () => {
  render(<DirectoryProvidersIndex result={{ kind: 'ok', coverage, page: [{ key: 'quiet.example.com', label: 'Quiet', count: 4 }], isDone: true, continueCursor: '' }} />)
  expect(screen.getByText('quiet.example.com')).toBeTruthy()
  expect(screen.getByText('4 tools')).toBeTruthy()
  expect(screen.queryByText(/Busiest tool/)).toBeNull()
  expect(screen.getByRole('link', { name: 'See 4 tools from quiet.example.com' })).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.queryByText(/Price|Calls|Payers/)).toBeNull()
})
it('keeps an empty intermediate page traversable and calls no match only on the final page', () => {
  const { rerender } = render(<DirectoryProvidersIndex search={{ query: 'unmatched' }} result={{ kind: 'ok', coverage, page: [], isDone: false, continueCursor: 'next' }} />)
  expect(screen.getByRole('heading', { name: 'Nothing on this page' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Next' })).toBeTruthy()
  expect(screen.queryByText(/No providers start with/)).toBeNull()
  rerender(<DirectoryProvidersIndex search={{ query: 'unmatched' }} result={{ kind: 'ok', coverage, page: [], isDone: true, continueCursor: '' }} />)
  expect(screen.getByRole('heading', { name: 'No providers start with “unmatched”' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Next' })).toBeNull()
})
it('retries the exact unavailable prefix page and retains comparison/layout', () => {
  render(<DirectoryProvidersIndex search={search} result={{ kind: 'unavailable', reason: 'index_unavailable' }} />)
  expect(screen.getByRole('heading', { name: 'Providers didn’t load' })).toBeTruthy()
  expect(Object.fromEntries(href('Try again').searchParams)).toEqual({ view: 'providers', query: 'example', compare: search.compare, layout: 'table', providerCursor: 'prior' })
})

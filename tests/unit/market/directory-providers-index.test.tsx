/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
vi.mock('@tanstack/react-router', () => ({ Link: ({ search, children, to, ...props }: { search: Record<string, string>; children: ReactNode; to: string }) => <a href={`${to}?${new URLSearchParams(search).toString()}`} {...props}>{children}</a> }))
import { DirectoryProvidersIndex } from '@/components/ae/market/DirectoryProvidersIndex'
import type { X402DirectoryIndexCoverage } from '@/modules/market/x402-directory-index'
afterEach(cleanup)
const coverage: X402DirectoryIndexCoverage = { source: 'coinbase', generation: 'scan', indexedTotal: 4000, reportedTotal: 4000, reportedTotalAtStart: 4000, sourceChangedDuringScan: false, duplicateObservations: 0, pagesFetched: 20, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' }
it('shows complete indexed Provider counts and links to exact storefronts and separate pagination', () => {
  render(<DirectoryProvidersIndex result={{ kind: 'ok', coverage, page: [{ key: 'example.com', label: 'Example', count: 142 }, { key: 'other.example.com', label: 'Other', count: 1 }], isDone: false, continueCursor: 'cursor:+/=' }} />)
  expect(screen.getByText('142 Tools in the indexed catalogue')).toBeTruthy()
  expect(screen.getByText('1 Tool in the indexed catalogue')).toBeTruthy()
  const store = new URL(screen.getByRole('link', { name: 'View Tools from example.com' }).getAttribute('href')!, 'https://aecon.ai')
  expect(Object.fromEntries(store.searchParams)).toEqual({ view: 'tools', provider: 'example.com' })
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
  expect(screen.getByRole('status').textContent).toContain('catalogue is unavailable')
  expect(screen.queryByRole('link')).toBeNull()
})

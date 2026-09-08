/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryLeaderboard } from '@/components/ae/market/DirectoryLeaderboard'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

function entry(index: number, calls30d: number | undefined = 123_456 / 2 ** index): X402DirectoryEntry {
  return { resource: `https://example.com/tool/${index}`, title: `Useful Tool ${index}`, provider: 'example.com', description: `Description ${index}`, protocol: 'http', prices: [{ amount: '0.01 USDC', symbol: 'USDC', decimalAmount: '0.01', network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact' }], metadataJson: '{}', ...(calls30d === undefined ? {} : { activity: { calls30d } }) }
}
const entries = Array.from({ length: 14 }, (_, index) => entry(index, Math.floor(123_456 / 2 ** index)))
afterEach(() => { cleanup(); vi.resetAllMocks() })
function show(items = entries) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/market' })]), history: createMemoryHistory({ initialEntries: ['/market'] }) })
  const select = vi.fn(), save = vi.fn()
  render(<RouterContextProvider router={router}><DirectoryLeaderboard entries={items} window="7d" onSelect={select} onSave={save} isSaved={resource => resource === entries[1]!.resource} /></RouterContextProvider>)
  return { select, save }
}
it('preserves the source order and limits the ranked list to the first twelve Tools', () => {
  show()
  expect(screen.getByRole('heading', { name: 'Most-used Tools' })).toBeTruthy()
  expect(screen.getByText('Last 30 days · reported by Coinbase Bazaar')).toBeTruthy()
  expect(screen.getByText('Top 12')).toBeTruthy()
  const list = screen.getByRole('list', { name: 'Top Tools by reported Calls in the last 30 days' })
  const rows = within(list).getAllByRole('listitem')
  expect(rows).toHaveLength(12)
  expect(rows.map(row => row.getAttribute('aria-label'))).toEqual(entries.slice(0, 12).map((item, index) => `Rank ${index + 1}: ${item.title}`))
  expect(screen.queryByRole('heading', { name: 'Useful Tool 12' })).toBeNull()
  const search = new URL(screen.getByRole('link', { name: 'Browse by usage' }).getAttribute('href')!, 'https://aecon.ai').searchParams
  expect(search.get('sort')).toBe('popular')
  expect(search.get('view')).toBe('tools')
  expect(search.get('window')).toBe('7d')
})
it('displays exact accessible Call counts and proportional activity without invented points or trends', () => {
  show(entries.slice(0, 3))
  expect(screen.getByText('Top 3')).toBeTruthy()
  expect(screen.getByText('123,456 Calls in the last 30 days')).toBeTruthy()
  const first = screen.getByRole('meter', { name: 'Useful Tool 0 activity relative to the leading Tool' })
  const second = screen.getByRole('meter', { name: 'Useful Tool 1 activity relative to the leading Tool' })
  expect(first.getAttribute('aria-valuenow')).toBe('123456')
  expect(first.getAttribute('aria-valuemax')).toBe('123456')
  expect(second.getAttribute('aria-valuenow')).toBe('61728')
  expect(second.getAttribute('aria-valuetext')).toBe('61,728 Calls; 50% of the leading Tool')
  expect((first.firstElementChild as HTMLElement).style.width).toBe('100%')
  expect((second.firstElementChild as HTMLElement).style.width).toBe('50%')
  expect(screen.queryByText(/points|win rate|quality score|this month/iu)).toBeNull()
})
it('opens and saves exact indexed resources with empty source search, preserving saved state', () => {
  const { select, save } = show(entries.slice(0, 3))
  fireEvent.click(screen.getByRole('button', { name: 'View Tool: Useful Tool 0' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Useful Tool 0' }))
  expect(select).toHaveBeenCalledWith({ entry: entries[0], search: {} })
  expect(save).toHaveBeenCalledWith({ entry: entries[0], search: {} })
  expect(screen.getByRole('button', { name: 'Unsave Useful Tool 1' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getAllByText('0.01 USDC')).toHaveLength(3)
})
it('distinguishes zero reported Calls from missing activity without fabricating a value', () => {
  const missing = { ...entry(2) }
  delete missing.activity
  show([entry(0, 10), entry(1, 0), missing])
  expect(screen.getByText('0 Calls in the last 30 days')).toBeTruthy()
  expect(screen.getByText('Calls not reported')).toBeTruthy()
  expect(screen.getByRole('meter', { name: 'Useful Tool 1 activity relative to the leading Tool' }).getAttribute('aria-valuenow')).toBe('0')
  expect(screen.queryByRole('meter', { name: 'Useful Tool 2 activity relative to the leading Tool' })).toBeNull()
})
it('uses source-derived job titles and readable network and unknown-price labels', () => {
  show([{ ...entry(0), title: 'Provider service', serviceName: 'Provider service', description: 'Find the current weather. Accepts a city name.',
    prices: [{ amount: '0.00000000000000000025 unknown-token-address', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', scheme: 'exact' }],
  }])
  expect(screen.getByRole('heading', { name: 'Find the current weather.' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'View Tool: Find the current weather.' })).toBeTruthy()
  expect(screen.getByText('See payment details')).toBeTruthy()
  expect(screen.getByText('· Solana')).toBeTruthy()
  expect(screen.queryByText(/unknown-token-address/u)).toBeNull()
})
it.each(['empty', 'zero', 'missing'] as const)('shows an honest empty ranking for %s activity', kind => {
  const missing = { ...entry(0) }
  delete missing.activity
  show(kind === 'empty' ? [] : kind === 'zero' ? [entry(0, 0)] : [missing])
  expect(screen.getByRole('heading', { name: 'No Call activity reported yet' })).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
  expect(screen.queryByRole('meter')).toBeNull()
  expect(screen.queryByText(/^Top \d+/u)).toBeNull()
  expect(screen.getByRole('link', { name: 'Browse by usage' })).toBeTruthy()
})

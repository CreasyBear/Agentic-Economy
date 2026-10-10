/** @vitest-environment jsdom */
import { formatRelativeTime } from '@/lib/ui/format-time'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DirectoryProviderHeader } from '@/components/ae/market/DirectoryProviderHeader'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
afterEach(cleanup)
const first: X402DirectoryEntry = { provider: 'api.example.com', resource: 'https://api.example.com/a', title: 'Research papers', description: 'Find papers about a topic.', protocol: 'http', prices: [{ amount: '0.01 USDC', network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact' }], tags: ['research'], category: 'science', metadataJson: '{}', activity: { calls30d: 12, payers30d: 4 }, provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: '2026-09-08T08:00:00Z' } }
it('scopes provider identity, counts, payment networks and activity to exact-host unique results', () => {
  render(<DirectoryProviderHeader provider="api.example.com" entries={[first, first, { ...first, resource: 'https://api.example.com/b', title: 'Read a paper', activity: {} }, { ...first, provider: 'another.example.com', title: 'Other provider', activity: { calls30d: 999 } }]} />)
  expect(screen.getByText('2 tools on this page')).toBeTruthy()
  expect(screen.getByText('12 calls in the last 30 days')).toBeTruthy()
  expect(screen.getByText('Across 1 tool on this page')).toBeTruthy()
  expect(screen.getByText('Base')).toBeTruthy()
  const updated = screen.getByText('Last updated').nextElementSibling?.querySelector('time')
  expect(updated?.getAttribute('datetime')).toBe('2026-09-08T08:00:00.000Z')
  expect(updated?.getAttribute('title')).toBe('8 Sept 2026, 8:00 am UTC')
  expect(updated?.textContent).toBe(formatRelativeTime('2026-09-08T08:00:00Z'))
  expect(screen.getByText('science')).toBeTruthy()
  expect(screen.getByText('Research papers')).toBeTruthy()
  expect(screen.queryByText('Other provider')).toBeNull()
  expect(screen.getByRole('link', { name: 'Visit api.example.com' }).getAttribute('href')).toBe('https://api.example.com/')
  expect(screen.getByText('Listings come from the x402 Bazaar. This address is not a verified identity.')).toBeTruthy()
  expect(screen.queryByText(/payers|rating/i)).toBeNull()
})
it('uses an explicitly supplied catalogue total but keeps activity limited to observed results', () => {
  render(<DirectoryProviderHeader provider="api.example.com" entries={[first]} totalTools={42} />)
  expect(screen.getByText('42 tools listed')).toBeTruthy()
  expect(screen.getByText('Across 1 tool on this page')).toBeTruthy()
})
it('does not fabricate activity, networks, Tool evidence or an external link for an invalid hostname', () => {
  render(<DirectoryProviderHeader provider="Unknown provider" entries={[]} />)
  expect(screen.getByText('0 tools on this page')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByText(/reported Calls|Payment networks|Latest directory update/)).toBeNull()
})

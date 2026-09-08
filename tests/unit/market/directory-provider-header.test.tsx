/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DirectoryProviderHeader } from '@/components/ae/market/DirectoryProviderHeader'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
afterEach(cleanup)
const first: X402DirectoryEntry = { provider: 'api.example.com', resource: 'https://api.example.com/a', title: 'Research papers', description: 'Find papers about a topic.', protocol: 'http', prices: [{ amount: '0.01 USDC', network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact' }], tags: ['research'], category: 'science', metadataJson: '{}', activity: { calls30d: 12, payers30d: 4 }, provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: '2026-09-08T08:00:00Z' } }
it('scopes provider identity, counts, payment networks and activity to exact-host unique results', () => {
  render(<DirectoryProviderHeader provider="api.example.com" entries={[first, first, { ...first, resource: 'https://api.example.com/b', title: 'Read a paper', activity: {} }, { ...first, provider: 'another.example.com', title: 'Other provider', activity: { calls30d: 999 } }]} />)
  expect(screen.getByText('2 Tools in these results')).toBeTruthy()
  expect(screen.getByText('12 reported Calls in 30 days')).toBeTruthy()
  expect(screen.getByText('Across 1 Tool in these results · Coinbase Bazaar')).toBeTruthy()
  expect(screen.getByText('Base')).toBeTruthy()
  expect(screen.getByText('science')).toBeTruthy()
  expect(screen.getByText('Research papers')).toBeTruthy()
  expect(screen.queryByText('Other provider')).toBeNull()
  expect(screen.getByRole('link', { name: 'Visit api.example.com' }).getAttribute('href')).toBe('https://api.example.com/')
  expect(screen.queryByText(/payers|verified|rating/i)).toBeNull()
})
it('uses an explicitly supplied catalogue total but keeps activity limited to observed results', () => {
  render(<DirectoryProviderHeader provider="api.example.com" entries={[first]} totalTools={42} />)
  expect(screen.getByText('42 Tools in the indexed catalogue')).toBeTruthy()
  expect(screen.getByText('Across 1 Tool in these results · Coinbase Bazaar')).toBeTruthy()
})
it('does not fabricate activity, networks, Tool evidence or an external link for an invalid hostname', () => {
  render(<DirectoryProviderHeader provider="Unknown provider" entries={[]} />)
  expect(screen.getByText('0 Tools in these results')).toBeTruthy()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByText(/reported Calls|Payment networks|Latest directory update/)).toBeNull()
})

/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import '../../setup/jsdom-platform'

import { DirectoryToolCard } from '@/components/ae/market/DirectoryToolCard'
import { DirectoryToolList } from '@/components/ae/market/DirectoryToolList'
import { ProductListingShelf } from '@/components/arc/market/ProductListing'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool } from '@/modules/market/saved-tools.contracts'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const entry: X402DirectoryEntry = {
  resource: 'https://provider.example.com/lookup', title: 'Company lookup', description: 'Find published company details.', provider: 'provider.example.com', protocol: 'http', prices: [], metadataJson: '{}', slug: 'company-lookup',
  input: { fields: [{ name: 'company_name', path: 'company_name', location: 'body', source: 'schema', required: true }, { name: 'authorization', path: 'authorization', location: 'headers', source: 'schema' }] },
  output: { fields: [{ name: 'registered_name', path: 'registered_name', location: 'output', source: 'schema' }] },
}
const model = { ...toDirectoryToolCardModel(entry), priceLabel: 'A$0.004 per Call', priceContext: 'Indicative before Quote · Provider source price' }
afterEach(cleanup)
function wrap(children: ReactNode) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/market' }), createRoute({ getParentRoute: () => root, path: '/tools/$providerHost/$slug' })]), history: createMemoryHistory({ initialEntries: ['/market'] }) })
  return <RouterContextProvider router={router}>{children}</RouterContextProvider>
}

it('shows published contribution fields without treating a listing as a callable purchase or rounding its price', () => {
  render(wrap(<DirectoryToolCard model={model} entry={entry} />))
  expect(screen.getByText('company name')).toBeTruthy()
  expect(screen.getByText('registered name')).toBeTruthy()
  expect(screen.queryByText('authorization')).toBeNull()
  expect(screen.getByText(model.priceLabel)).toBeTruthy()
  expect(screen.getByText(model.priceContext)).toBeTruthy()
  expect(screen.getByText('External listing · inspect')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Call|Buy|Add to bag/u })).toBeNull()
  expect(screen.getByRole('link', { name: 'Inspect Tool' }).getAttribute('href')).toBe('/tools/provider.example.com/company-lookup')
})

it('leaves acknowledgement with the parent through rapid activation, failed saved state and comparison limits', () => {
  const save = vi.fn(), compare = vi.fn()
  const { rerender } = render(wrap(<DirectoryToolCard model={model} onSave={save} onCompare={compare} />))
  const saveButton = screen.getByRole('button', { name: 'Save Company lookup' })
  const compareButton = screen.getByRole('button', { name: 'Add Company lookup to comparison' })
  for (let index = 0; index < 5; index++) { fireEvent.click(saveButton); fireEvent.click(compareButton) }
  expect(save).toHaveBeenCalledTimes(5)
  expect(compare).toHaveBeenCalledTimes(5)
  expect(saveButton.getAttribute('aria-pressed')).toBe('false')
  expect(compareButton.getAttribute('aria-pressed')).toBe('false')
  rerender(wrap(<DirectoryToolCard model={model} onSave={save} onCompare={compare} saved saveDisabled saveUnknown compareDisabled />))
  const unknown = screen.getByRole('button', { name: 'Saved status unavailable for Company lookup' }) as HTMLButtonElement
  expect(unknown.disabled).toBe(true)
  expect(unknown.hasAttribute('aria-pressed')).toBe(false)
  expect((screen.getByRole('button', { name: 'Add Company lookup to comparison' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(unknown)
  expect(save).toHaveBeenCalledTimes(5)
})

it('uses source observations for sparse previews and states missing contracts without inventing usage', () => {
  const sparse: X402DirectoryEntry = { resource: entry.resource, title: entry.title, provider: entry.provider, protocol: entry.protocol, prices: [], metadataJson: '{}', description: entry.title, activity: { calls30d: 1234 } }
  const { rerender } = render(wrap(<DirectoryToolCard model={toDirectoryToolCardModel(sparse)} entry={sparse} />))
  expect(screen.getByText('1,234')).toBeTruthy()
  expect(screen.getByText('Coinbase Bazaar calls · 30 days')).toBeTruthy()
  expect(screen.queryByText('Inspect the Provider’s published Tool details.')).toBeNull()
  const zero = { ...sparse, activity: { calls30d: 0 } }
  rerender(wrap(<DirectoryToolCard model={toDirectoryToolCardModel(zero)} entry={zero} />))
  expect(screen.getByText('0')).toBeTruthy()
  expect(screen.getByText('Coinbase Bazaar calls · 30 days')).toBeTruthy()
  const payingAddresses = { ...sparse, activity: { payers30d: 7 } }
  rerender(wrap(<DirectoryToolCard model={toDirectoryToolCardModel(payingAddresses)} entry={payingAddresses} />))
  expect(screen.getByText('7')).toBeTruthy()
  expect(screen.getByText('Coinbase Bazaar paying addresses · 30 days')).toBeTruthy()
  const unknown = { ...sparse, activity: {} }
  rerender(wrap(<DirectoryToolCard model={toDirectoryToolCardModel(unknown)} entry={unknown} />))
  expect(screen.getByText('Input and output summary unavailable.')).toBeTruthy()
  expect(screen.queryByText('Coinbase Bazaar calls · 30 days')).toBeNull()
  expect(screen.queryByText('0')).toBeNull()
})

it('preserves exact row identity, current price context and controlled remove actions', () => {
  const pricedEntry: X402DirectoryEntry = { ...entry, prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.004 USDC', decimalAmount: '0.004', symbol: 'USDC' }] }
  const item: SavedDirectoryTool = { entry: pricedEntry, search: { query: 'company', provider: 'provider.example.com' } }
  const save = vi.fn(), compare = vi.fn()
  render(wrap(<DirectoryToolList items={[item]} onSave={save} isSaved={() => true} onCompare={compare} isComparing={() => true} compareDisabled={() => false} />))
  const row = within(screen.getByRole('table', { name: 'Tools' })).getAllByRole('row')[1]!
  expect(within(row).getByText('US$0.004')).toBeTruthy()
  expect(within(row).getByText('Provider lists 0.004 USDC per Call')).toBeTruthy()
  expect(within(row).getByRole('link', { name: 'Company lookup' }).getAttribute('href')).toBe('/tools/provider.example.com/company-lookup')
  fireEvent.click(within(row).getByRole('button', { name: 'Unsave Company lookup' }))
  fireEvent.click(within(row).getByRole('button', { name: 'Remove Company lookup from comparison' }))
  expect(save).toHaveBeenCalledWith(item)
  expect(compare).toHaveBeenCalledWith(item)
})

it('scrolls the shelf from arrow keys without intercepting child action keys', () => {
  render(<ProductListingShelf title="Useful Tools" description="Published catalogue" label="Useful Tools gallery" previousLabel="Previous Tools" nextLabel="Next Tools" action={<a href="/market">See all</a>}><li><button type="button">Save Tool</button></li></ProductListingShelf>)
  const list = screen.getByRole('list', { name: 'Useful Tools' })
  Object.defineProperty(list, 'clientWidth', { configurable: true, value: 320 })
  const scroll = vi.fn()
  Object.defineProperty(list, 'scrollBy', { configurable: true, value: scroll })
  fireEvent.keyDown(list, { key: 'ArrowRight' })
  expect(scroll).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' })
  fireEvent.keyDown(list, { key: 'ArrowLeft' })
  expect(scroll).toHaveBeenCalledWith({ left: -320, behavior: 'smooth' })
  fireEvent.keyDown(screen.getByRole('button', { name: 'Save Tool' }), { key: 'ArrowRight' })
  expect(scroll).toHaveBeenCalledTimes(2)
})

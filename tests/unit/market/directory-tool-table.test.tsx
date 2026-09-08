/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryToolTable } from '@/components/ae/market/DirectoryToolTable'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

const entry: X402DirectoryEntry = { resource: 'https://api.example.com/search', title: 'Search the web', provider: 'api.example.com', description: 'Retrieve a ranked list of web pages.', category: 'Search', protocol: 'http', metadataJson: '{}', prices: [{ amount: '0.01 USDC', decimalAmount: '0.01', symbol: 'USDC', network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact' }], activity: { payers30d: 0, calls30d: 250_000 }, provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: '2026-09-01T00:00:00Z' }, input: { fields: [{ name: 'query', path: '/body/query', location: 'body', source: 'schema', type: 'string' }] } }
const missing: X402DirectoryEntry = { resource: 'https://example.com/image', title: 'Create an image', provider: 'example.com', description: 'Generate an image.', protocol: 'http', prices: [], metadataJson: '{}', input: { fields: [], exampleJson: '{"method":"POST","type":"http"}' } }
afterEach(cleanup)
function show(items = [entry, missing]) {
  const select = vi.fn(), save = vi.fn(), compare = vi.fn()
  const sourceInput = { query: 'search', network: 'eip155:8453', offset: 100 }
  render(<DirectoryToolTable entries={items} sourceInput={sourceInput} onSelect={select} onSave={save} isSaved={resource => resource === entry.resource} onCompare={compare} isCompared={resource => resource === entry.resource} compareDisabled />)
  return { select, save, compare, sourceInput, table: within(screen.getByRole('table', { name: 'Tool comparison table' })) }
}
it('preserves every supplied row in server order and distinguishes zero payers from missing activity', () => {
  const { table } = show()
  expect(table.getAllByRole('row').slice(1).map(row => within(row).getByRole('button', { name: /^View Tool:/u }).textContent)).toEqual(['Search the web', 'Create an image'])
  expect(table.getByTitle('0 distinct paying addresses in the last 30 days').textContent).toBe('0')
  expect(table.getAllByText('Not reported')).toHaveLength(2)
  expect(table.getByText('0.01 USDC')).toBeTruthy()
  expect(table.getByText('Price on request')).toBeTruthy()
  expect(table.queryByText('250K')).toBeNull()
})
it('opens, saves and compares the exact resource with its source search', () => {
  const { table, select, save, compare, sourceInput } = show()
  fireEvent.click(table.getByRole('button', { name: 'View Tool: Search the web' }))
  fireEvent.click(table.getByRole('button', { name: 'Unsave Search the web' }))
  fireEvent.click(table.getByRole('button', { name: 'Remove Search the web from comparison' }))
  for (const callback of [select, save, compare]) expect(callback).toHaveBeenCalledWith({ entry, search: sourceInput })
  expect((table.getByRole('button', { name: 'Add Create an image to comparison' }) as HTMLButtonElement).disabled).toBe(true)
})
it('makes Calls optional and does not claim the HTTP wrapper is a request example', () => {
  const { table } = show()
  expect(table.getByText('1 request field')).toBeTruthy()
  expect(table.getByText('Not published')).toBeTruthy()
  expect(table.queryByRole('columnheader', { name: 'Calls · 30d' })).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show Calls' }))
  expect(table.getByRole('columnheader', { name: 'Calls · 30d' })).toBeTruthy()
  expect(table.getByTitle('250,000 Calls in the last 30 days')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show Calls' }))
  expect(table.queryByRole('columnheader', { name: 'Calls · 30d' })).toBeNull()
})
it('keeps complete mobile rows and offers the same actions', () => {
  const { select } = show()
  const list = within(screen.getByRole('list', { name: 'Tools' }))
  expect(list.getAllByRole('listitem')).toHaveLength(2)
  expect(list.getByText('Retrieve a ranked list of web pages.')).toBeTruthy()
  expect(list.getAllByText('Paying addresses · 30 days')).toHaveLength(2)
  fireEvent.click(list.getByRole('button', { name: 'View Tool: Create an image' }))
  expect(select.mock.calls[0]?.[0].entry).toEqual(missing)
})
it('shows a published output example only when the shared source metadata classifier recognises it', () => {
  const { table } = show([{ ...entry, output: { fields: [], exampleJson: '{"results":[{"title":"Example"}]}' } }, { ...missing, output: { fields: [], exampleJson: '{}' } }])
  expect(table.getAllByText('Output example')).toHaveLength(1)
  expect(table.getAllByText('Not published')).toHaveLength(1)
})
it('compares the lowest published USDC price on the selected payment network', () => {
  const { table } = show([{ ...entry, prices: [
    { ...entry.prices[0]!, decimalAmount: '0.001', network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', networkLabel: 'Solana' },
    { ...entry.prices[0]!, decimalAmount: '0.2' },
    { ...entry.prices[0]!, decimalAmount: '0.02' },
  ] }])
  expect(table.getByText('0.02 USDC')).toBeTruthy()
  expect(table.queryByText('0.001 USDC')).toBeNull()
  expect(table.getByText('Base · 2 options')).toBeTruthy()
})
it('offers a clear empty-page recovery without inventing a catalogue count', () => {
  render(<DirectoryToolTable entries={[]} sourceInput={{}} onSelect={vi.fn()} onSave={vi.fn()} isSaved={() => false} />)
  expect(screen.getByText('No Tools on this page. Adjust the filters or continue to the next page.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

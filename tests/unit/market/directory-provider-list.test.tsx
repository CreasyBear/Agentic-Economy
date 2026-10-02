/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryProviderList } from '@/components/ae/market/DirectoryProviderList'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

afterEach(cleanup)
const first: X402DirectoryEntry = { provider: 'api.example.com', resource: 'https://api.example.com/a', title: 'Research papers', description: '', protocol: 'http', prices: [{ amount: '0.001 USDC', decimalAmount: '0.001', symbol: 'USDC', network: 'eip155:8453', scheme: 'exact' }], metadataJson: '{}', activity: { calls30d: 0, payers30d: 0 } }

it('keeps host grouping and selection controlled while showing only the first observed Tool price and activity', () => {
  const select = vi.fn(), submit = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submit}><DirectoryProviderList entries={[first, { ...first, resource: 'https://api.example.com/b', title: 'Later Tool', activity: { calls30d: 500, payers30d: 20 }, prices: [] }, { ...first, provider: 'other.example.com', activity: {} }]} onSelect={select} /></form>)
  const row = screen.getByRole('button', { name: 'View Tools from api.example.com' }).closest('tr')!
  expect(within(row).getByText('Shown Tool: Research papers')).toBeTruthy()
  expect(within(row).getByText('US$0.001')).toBeTruthy()
  expect(within(row).getByText('Provider lists 0.001 USDC per Call')).toBeTruthy()
  expect(within(row).getAllByText('0')).toHaveLength(2)
  expect(within(row).getByText('2').getAttribute('title')).toBe('2 Tools in these results')
  expect(screen.queryByText('500')).toBeNull()
  expect(screen.queryByText('Later Tool')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from api.example.com' }))
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from api.example.com' }))
  expect(select.mock.calls).toEqual([['api.example.com'], ['api.example.com']])
  expect(submit).not.toHaveBeenCalled()
})

it('names absent source facts without turning them into zero or an invented buyer price', () => {
  render(<DirectoryProviderList entries={[{ ...first, activity: {}, prices: [] }]} onSelect={() => {}} />)
  expect(screen.getByText('Price unavailable')).toBeTruthy()
  expect(screen.getAllByText('Not reported')).toHaveLength(2)
  expect(screen.queryByText('0')).toBeNull()
})


it('keeps Provider gallery facts scoped to the shown Tool and preserves native selection', () => {
  const select = vi.fn()
  render(<DirectoryProviderList layout="grid" entries={[first, { ...first, resource: 'https://api.example.com/b', activity: { calls30d: 500, payers30d: 20 } }]} onSelect={select} />)
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByText('2 Tools in these results')).toBeTruthy()
  expect(screen.getByText('Shown Tool: Research papers')).toBeTruthy()
  expect(screen.getByText('US$0.001')).toBeTruthy()
  expect(screen.getByText('Coinbase Bazaar calls · 30 days: 0')).toBeTruthy()
  expect(screen.queryByText(/500/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from api.example.com' }))
  expect(select).toHaveBeenCalledWith('api.example.com')
})

/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import type { AdminPurchaseRow } from '@/lib/operator/admin-console/activity'

const mocks = vi.hoisted(() => ({
  access: { kind: 'allowed' } as { kind: 'allowed' | 'refused' },
  purchases: [] as AdminPurchaseRow[],
  accounts: [] as { accountRef: string; displayName: string; lifecycle: string; createdAt: number }[],
  status: 'Exhausted',
  loadMore: vi.fn(),
  reads: vi.fn(),
}))
vi.mock('convex/react', () => ({
  useQuery: (query: FunctionReference<'query'>) => getFunctionName(query) === 'trialAccess:readAdmin' ? { kind: 'refused' } : mocks.access,
  usePaginatedQuery: (query: FunctionReference<'query'>, args: unknown) => {
    mocks.reads(getFunctionName(query), args)
    return { results: getFunctionName(query).endsWith('listAccounts') ? mocks.accounts : mocks.purchases, status: mocks.status, loadMore: mocks.loadMore }
  },
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}))

import { AdminAccountsPage } from '@/components/ae/admin/activity/AdminAccountsPage'
import { AdminActivityPage } from '@/components/ae/admin/activity/AdminActivityPage'
import { PurchaseActivity, PurchaseActivityTable } from '@/components/ae/admin/activity/PurchaseActivity'

function purchase(callRef: string, toolName: string, createdAt: number): AdminPurchaseRow {
  return { callRef, toolName, createdAt, updatedAt: createdAt, toolRef: 'tool-1', accountRef: 'acc-1', accountName: 'Acme',
    providerRef: null, environment: 'production', state: 'completed', paymentState: 'settled',
    amount: { currency: 'AUD', exponent: 6, units: '1234567' }, funding: { kind: 'unclassified' },
    recovery: null, refusalCode: null }
}

beforeEach(() => {
  mocks.access = { kind: 'allowed' }
  mocks.purchases = []
  mocks.accounts = []
  mocks.status = 'Exhausted'
  mocks.loadMore.mockReset()
  mocks.reads.mockReset()
})
afterEach(cleanup)

describe('founder record controls', () => {
  it('sorts only loaded records while retaining exact money, unknown funding and record links', () => {
    const rows = [purchase('call-b', 'Beta Tool', 2), purchase('call-a', 'Alpha Tool', 1)]
    render(<PurchaseActivityTable rows={rows} />)
    const table = screen.getByRole('table', { name: 'Loaded purchases' })
    expect(within(table).getAllByText('AUD 1.234567')).toHaveLength(2)
    expect(within(table).getAllByText('Funding not classified')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Sort by Payment/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Purchase' }))
    expect(screen.getByRole('button', { name: 'Sort by Purchase' }).closest('th')?.getAttribute('aria-sort')).toBe('ascending')
    const links = within(table).getAllByRole('link', { name: /Tool/ })
    expect(links.map(link => link.textContent)).toEqual(['Alpha Tool', 'Beta Tool'])
    expect(links[0]?.getAttribute('href')).toBe('/admin/calls/call-a')
    expect(rows.map(row => row.callRef)).toEqual(['call-b', 'call-a'])
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Purchase' }))
    expect(screen.getByRole('button', { name: 'Sort by Purchase' }).closest('th')?.getAttribute('aria-sort')).toBe('descending')
    expect(within(table).getAllByRole('link', { name: /Tool/ }).map(link => link.textContent)).toEqual(['Beta Tool', 'Alpha Tool'])
  })

  it('continues a filtered empty source page rather than declaring the query exhausted', () => {
    mocks.status = 'CanLoadMore'
    render(<PurchaseActivity search={{ range: 'last_30', funding: 'customer' }} />)
    expect(screen.getByRole('heading', { name: 'No matches in the records scanned' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more purchases' }))
    expect(mocks.loadMore).toHaveBeenCalledExactlyOnceWith(25)
    expect(screen.queryByRole('heading', { name: 'No matching purchases' })).toBeNull()
  })

  it('does not expose a next page for an exhausted query', () => {
    render(<PurchaseActivity search={{ range: 'today' }} />)
    expect(screen.getByRole('heading', { name: 'No matching purchases' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more purchases' })).toBeNull()
  })

  it('skips business reads when admin admission is refused', () => {
    mocks.access = { kind: 'refused' }
    render(<PurchaseActivity search={{ range: 'today' }} />)
    expect(screen.getByText('Your current membership does not allow this read.')).toBeTruthy()
    expect(mocks.reads.mock.calls.every(([, args]) => args === 'skip')).toBe(true)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('removes one filter without losing period or Account and clears all within the chosen period', () => {
    const change = vi.fn()
    render(<AdminActivityPage search={{ range: 'last_30', status: 'completed', funding: 'customer', account: 'acc-1' }} onSearchChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Outcome: Delivered' }))
    expect(change).toHaveBeenLastCalledWith({ range: 'last_30', funding: 'customer', account: 'acc-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(change).toHaveBeenLastCalledWith({ range: 'last_30' })
    fireEvent.click(screen.getByRole('button', { name: '90 days' }))
    expect(change).toHaveBeenLastCalledWith({ range: 'last_90', status: 'completed', funding: 'customer', account: 'acc-1' })
  })

  it('translates an ARC filter label into the validated backend value', async () => {
    const change = vi.fn()
    render(<AdminActivityPage search={{ range: 'last_7', account: 'acc-1' }} onSearchChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Funding' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Includes promotional credit' }))
    expect(change).toHaveBeenLastCalledWith({ range: 'last_7', account: 'acc-1', funding: 'promotional' })
  })

  it('supports keyboard period selection without dropping the funding filter', () => {
    const change = vi.fn()
    render(<AdminActivityPage search={{ range: 'last_7', funding: 'customer' }} onSearchChange={change} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '7 days' }), { key: 'ArrowRight' })
    expect(change).toHaveBeenLastCalledWith({ range: 'last_30', funding: 'customer' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '30 days' }))
  })

  it('submits a trimmed Account search and clears the applied query', () => {
    const change = vi.fn()
    const view = render(<AdminAccountsPage search="Acme" onSearchChange={change} />)
    const search = screen.getByRole('searchbox', { name: 'Account name' })
    fireEvent.change(search, { target: { value: '  Beta  ' } })
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(change).toHaveBeenLastCalledWith('Beta')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(change).toHaveBeenLastCalledWith('')
    view.rerender(<AdminAccountsPage search="" onSearchChange={change} />)
    expect(document.activeElement).toBe(search)
    expect((search as HTMLInputElement).value).toBe('')
  })

  it('sorts loaded Accounts and still lets the operator load the next source page', async () => {
    mocks.accounts = [
      { accountRef: 'b', displayName: 'Beta', lifecycle: 'active', createdAt: 2 },
      { accountRef: 'a', displayName: 'Alpha', lifecycle: 'suspended', createdAt: 1 },
    ]
    mocks.status = 'CanLoadMore'
    render(<AdminAccountsPage search="" onSearchChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Account' }))
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Loaded Accounts' })).getAllByRole('link').map(link => link.textContent)).toEqual(['Alpha', 'Beta']))
    fireEvent.click(screen.getByRole('button', { name: 'Load more Accounts' }))
    expect(mocks.loadMore).toHaveBeenCalledExactlyOnceWith(25)
  })
})

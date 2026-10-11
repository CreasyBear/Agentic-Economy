/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AccountHistory } from '@/components/ae/console/AeAccountHistoryTable'
import { AeAccountFundingPanel } from '@/components/ae/console/AeCreditTopUpPanel'
import type { AccountFundingConstraints } from '@/modules/money/server'

vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ userId: 'user:credit-loading' }) }))

const constraints: AccountFundingConstraints = {
  kind: 'available', environment: 'sandbox', currency: 'AUD', exponent: 6,
  minimumPrincipalUnits: '5000000', maximumPrincipalUnits: '25000000000',
  incrementUnits: '10000', serviceFeeBps: 500, taxOnServiceFeeBps: 1000,
  legalCustomerMaximumAccessibleUnits: '4999999999', policyDigest: `sha256:${'f'.repeat(64)}`,
}

beforeEach(() => window.sessionStorage.clear())
afterEach(cleanup)

it('withholds transaction facts until history resolves, then distinguishes confirmed empty history', () => {
  const page = render(<AccountHistory loading unavailable={false} />)
  expect(screen.getByRole('status', { name: 'Loading credit history' }).getAttribute('aria-busy')).toBe('true')
  expect(screen.queryByText('Credit history unavailable')).toBeNull()
  expect(screen.queryByText('No booked Account transactions yet')).toBeNull()
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  expect(document.body.textContent).not.toContain('A$0.00')

  page.rerender(<AccountHistory loading={false} unavailable={false} result={{
    kind: 'available', entries: [], snapshotAt: 1, continueCursor: '', isDone: true,
    coverage: 'complete', sourceLinkCoverage: 'unavailable',
    source: 'formance_transaction_cursor', ordering: 'recorded_transaction_sequence_desc',
  }} />)
  expect(screen.queryByRole('status', { name: 'Loading credit history' })).toBeNull()
  expect(screen.getByText('No booked Account transactions yet')).toBeTruthy()
})

it('withholds amounts and payment controls while funding constraints are first loading', () => {
  const begin = vi.fn()
  render(<AeAccountFundingPanel port={{ begin, read: vi.fn() }} constraintsLoading />)
  expect(screen.getByRole('status', { name: 'Loading funding amounts' }).getAttribute('aria-busy')).toBe('true')
  expect(screen.queryByLabelText(/other amount/i)).toBeNull()
  expect(screen.queryByRole('group', { name: 'Funding quote and payment' })).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  expect(document.body.textContent).not.toContain('A$0.00')
  expect(begin).not.toHaveBeenCalled()
})

it('keeps the edited amount and exact known quote visible through a constraints refresh', () => {
  const begin = vi.fn()
  const port = { begin, read: vi.fn() }
  const page = render(<AeAccountFundingPanel port={port} constraints={constraints} />)
  const amount = screen.getByLabelText(/other amount/i) as HTMLInputElement
  fireEvent.change(amount, { target: { value: '10.00' } })
  page.rerender(<AeAccountFundingPanel port={port} constraints={constraints} constraintsLoading />)

  expect(screen.getByLabelText(/other amount/i)).toBe(amount)
  expect(amount.value).toBe('10.00')
  const quote = within(screen.getByLabelText('Funding quote'))
  expect(quote.getByText('Platform fee')).toBeTruthy()
  expect(quote.getByText('A$0.50')).toBeTruthy()
  expect(quote.getByText('Australian GST (10%)')).toBeTruthy()
  expect(quote.getByText('A$1.05')).toBeTruthy()
  expect(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i })).toBeTruthy()
  expect(screen.queryByRole('status', { name: 'Loading funding amounts' })).toBeNull()
  expect(begin).not.toHaveBeenCalled()
})

it('shows a typed error, not a thrown TypeError, when begin returns a malformed result', async () => {
  const begin = vi.fn().mockResolvedValue(undefined)
  render(<AeAccountFundingPanel port={{ begin, read: vi.fn() }} constraints={constraints} />)
  fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
  fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))
  expect(await screen.findByText(/unreadable response/i)).toBeTruthy()
  expect(begin).toHaveBeenCalledTimes(1)
})

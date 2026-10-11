/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreditFundPanel } from '@/components/ae/console/owner-credit/components/CreditFundPanel'
import type { AccountFundingBalance } from '@/modules/money/server'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ userId: 'owner:credit-profile' }) }))
afterEach(cleanup)
const balance: AccountFundingBalance = { kind: 'available', accountRef: 'account:credit-profile',
  balance: { currency: 'AUD', exponent: 6, units: '10000000' },
  promotionalBalance: { currency: 'AUD', exponent: 6, units: '2000000' },
  totalBalance: { currency: 'AUD', exponent: 6, units: '12000000' }, locked: false, version: 1 }

describe('sourced Credit profile composition', () => {
  it('keeps exact known credit and restrictions visible after a failed balance refresh', () => {
    const onCreditRefresh = vi.fn()
    render(<CreditFundPanel paidCalls="open" accountBalance={{ ...balance, locked: true }} unavailable={{ balance: true }} onCreditRefresh={onCreditRefresh} />)
    expect(screen.getByRole('region', { name: 'Account credit' })).toBeInTheDocument()
    expect(screen.getByText('A$12.00')).toBeInTheDocument()
    expect(screen.getByText('A$10.00')).toBeInTheDocument()
    expect(screen.getByText('A$2.00')).toBeInTheDocument()
    expect(screen.getByText('Locked for reconciliation; new paid Calls are refused.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Account credit' })).getByRole('alert')).toHaveTextContent('last authoritative balance remains visible')
    const region = screen.getByRole('region', { name: 'Account credit' })
    expect(within(region).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(region).getByRole('button', { name: 'Try balance again' }))
    expect(onCreditRefresh).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toMatch(/subscription|upgrade plan|trial expires/iu)
  })

  it('offers one balance recovery action without inferring credit when the source is unavailable', () => {
    const onCreditRefresh = vi.fn()
    render(<CreditFundPanel paidCalls="open" onCreditRefresh={onCreditRefresh} />)
    const region = screen.getByRole('region', { name: 'Account credit' })
    expect(within(region).getAllByRole('button')).toHaveLength(1)
    expect(within(region).getByRole('alert')).toHaveTextContent('No balance is being inferred')
    fireEvent.click(within(region).getByRole('button', { name: 'Refresh balance' }))
    expect(onCreditRefresh).toHaveBeenCalledOnce()
    expect(region.textContent).not.toContain('A$0.00')
  })

  it('shows no invented zero credit or payment control while both sources are first loading', () => {
    const begin = vi.fn()
    render(<CreditFundPanel paidCalls="open" balanceLoading constraintsLoading accountFundingPort={{ begin, read: vi.fn() }} />)
    expect(screen.getByRole('heading', { name: 'Loading credit' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading funding amounts' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).not.toContain('A$0.00')
    expect(begin).not.toHaveBeenCalled()
  })
})

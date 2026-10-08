// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AeSupplyEarningsCard } from '@/components/ae/supply/earnings-card/AeSupplyEarningsCard'

afterEach(cleanup)

const obligation = {
  obligationRef: 'provider-obligation:call:one', callRef: 'call:one', toolRef: 'tool:one',
  currency: 'USDC' as const, exponent: 6 as const, amountUnits: '1250000', state: 'settled' as const,
  settlementTransactionRef: 'formance:settlement:one', createdAt: Date.UTC(2026, 8, 27), settledAt: Date.UTC(2026, 8, 27),
}

describe('owner earnings facts', () => {
  it('shows only recorded obligation and settlement facts, never bank payout or transfer approval', () => {
    render(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one', obligations: [obligation], truncated: false, transfers: [], transfersTruncated: false }} />)
    expect(screen.getByText(/1\.25/)).toBeTruthy()
    expect(screen.getByText('Settlement transaction: formance:settlement:one')).toBeTruthy()
    expect(screen.getByText('Payout not yet observed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /payout|stripe/i })).toBeNull()
  })

  it('separates authoritative empty from source failure and truncated history', () => {
    const { rerender } = render(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one', obligations: [], truncated: false, transfers: [], transfersTruncated: false }} />)
    expect(screen.getByText('No Provider obligations have been recorded.')).toBeTruthy()
    rerender(<AeSupplyEarningsCard readback={{ kind: 'error', code: 'source_unavailable' }} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('No Provider obligations have been recorded.')).toBeNull()
    rerender(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one', obligations: [obligation], truncated: true, transfers: [], transfersTruncated: false }} />)
    expect(screen.getByText('Showing the latest 100 obligations. Older records are not included.')).toBeTruthy()
  })
  it('shows recorded AUD Stripe transfer facts separately from USDC Call settlement', () => {
    render(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one', obligations: [],
      truncated: false, transfersTruncated: false, transfers: [{
        payoutRef: 'payout:one', currency: 'AUD', exponent: 6, amountUnits: '2000000',
        state: 'paid', transferStatus: 'succeeded', stripeTransferId: 'tr_one',
        transferEvidenceDigest: 'sha256:transfer', transferObservedAt: Date.UTC(2026, 8, 27), createdAt: 1,
      }] }} />)
    expect(screen.getByText('A$2.00')).toBeTruthy()
    expect(screen.getByText('Exact amount: AUD 2.000000')).toBeTruthy()
    expect(screen.getByText('Stripe transfer status: succeeded')).toBeTruthy()
    expect(screen.getByText('Payout not yet observed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /approve|start|review payout/i })).toBeNull()
  })
  it('rounds AUD transfer presentation up without changing its exact amount or non-AUD Provider currency', () => {
    render(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one',
      obligations: [obligation], truncated: false, transfersTruncated: false, transfers: [
        { payoutRef: 'payout:small', currency: 'AUD', exponent: 6, amountUnits: '1', state: 'paid', createdAt: 1 },
        { payoutRef: 'payout:usd', currency: 'USD', exponent: 6, amountUnits: '1234567', state: 'paid', createdAt: 2 },
      ] }} />)
    expect(screen.getByText('A$0.01')).toBeTruthy()
    expect(screen.getByText('Exact amount: AUD 0.000001')).toBeTruthy()
    expect(screen.getByText('USD 1.234567')).toBeTruthy()
    expect(screen.getByText('USDC 1.250000')).toBeTruthy()
    expect(screen.queryByText('A$1.25')).toBeNull()
  })
  it('does not represent a payout review row as an executed Stripe transfer', () => {
    render(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one', obligations: [],
      truncated: false, transfersTruncated: false, transfers: [{
        payoutRef: 'payout:review', currency: 'AUD', exponent: 6, amountUnits: '2000000',
        state: 'review', createdAt: 1,
      }] }} />)
    expect(screen.getByText('Record state: review')).toBeTruthy()
    expect(screen.queryByText(/Stripe transfer:/)).toBeNull()
    expect(screen.queryByText(/Stripe transfer status:/)).toBeNull()
  })

  it('offers structured-error retry and related-record support without a buyer-owned Call route', () => {
    const retry = vi.fn()
    const more = vi.fn()
    const { rerender } = render(<AeSupplyEarningsCard readback={{ kind: 'error', code: 'source_unavailable' }} onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try earnings again' }))
    expect(retry).toHaveBeenCalledOnce()
    rerender(<AeSupplyEarningsCard readback={{ kind: 'available', businessId: 'business:one', obligations: [obligation], truncated: true, transfers: [], transfersTruncated: false, isDone: false, continueCursor: 'opaque:next' }} onLoadMore={more} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load older obligations (up to 50)' }))
    expect(more).toHaveBeenCalledOnce()
    const href = screen.getByRole('link', { name: 'Ask about this Call (opens email app)' }).getAttribute('href') ?? ''
    expect(decodeURIComponent(href)).toContain('Call reference: call:one')
    expect(decodeURIComponent(href)).toContain('Obligation reference: provider-obligation:call:one')
    expect(href).toMatch(/^mailto:/)
  })
})

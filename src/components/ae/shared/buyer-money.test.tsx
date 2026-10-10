/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CallOutcome } from './CallOutcome'
import { QuoteConfirmation } from './QuoteConfirmation'

afterEach(cleanup)

describe('buyer money cards', () => {
  it('shows a rounded AUD Quote while preserving an exact posted Call amount', () => {
    const amount = { currency: 'AUD', exponent: 6, units: '1' } as const
    render(<>
      <QuoteConfirmation view={{
        toolName: 'Lookup', provider: { kind: 'verified', name: 'Provider', href: '/providers/provider' },
        callRef: 'call:v1:test', quoteRef: 'quote:v1:test', quoteAmount: amount,
        expiresAt: 2_000_000_000_000, inputSummary: 'city', remainingCap: { amount, window: 'month' },
        expired: false, pending: false,
      }} onApprove={() => undefined} onDeny={() => undefined} onFreshQuote={() => undefined} />
      <CallOutcome view={{ callRef: 'call:v1:test', label: 'Delivered', detail: 'Result ready',
        purchaseKind: 'delivered', payment: 'Settled', delivery: 'Delivered', amount }} />
    </>)
    expect(screen.getByText('A$0.01 per Call')).toBeInTheDocument()
    expect(screen.getByText('A$0.01')).toBeInTheDocument()
    expect(screen.getByText('A$0.000001')).toBeInTheDocument()
    const trust = screen.getByRole('link', { name: 'Trust centre (opens in a new tab)' })
    expect(trust).toHaveAttribute('href', '/trust')
    expect(trust).toHaveAttribute('target', '_blank')
    expect(trust).toHaveAttribute('rel', 'noreferrer')
  })

  it('never presents an unconverted source USDC amount as the buyer Quote', () => {
    const onApprove = vi.fn()
    const onFreshQuote = vi.fn()
    render(<QuoteConfirmation view={{
      toolName: 'Lookup', provider: { kind: 'verified', name: 'Provider', href: '/providers/provider' },
      callRef: 'call:v1:test', quoteRef: 'quote:v1:test',
      quoteAmount: { currency: 'USDC', exponent: 6, units: '1' },
      expiresAt: 2_000_000_000_000, inputSummary: 'city',
      remainingCap: { amount: { currency: 'AUD', exponent: 6, units: '0' }, window: 'month' },
      expired: false, pending: false,
    }} onApprove={onApprove} onDeny={() => undefined} onFreshQuote={onFreshQuote} />)
    expect(screen.queryByText('0.000001 USDC per Call')).toBeNull()
    expect(screen.getByText('0.000001 USDC')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve this Call' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Get a fresh Quote' }))
    expect(onFreshQuote).toHaveBeenCalledOnce()
    expect(onApprove).not.toHaveBeenCalled()
  })
})

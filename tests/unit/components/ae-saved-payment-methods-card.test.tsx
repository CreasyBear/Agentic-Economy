/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSavedPaymentMethodsCard } from '@/components/ae/console/AeSavedPaymentMethodsCard'
import { paymentCardExpiryKind } from '@/modules/money/saved-payment-methods.view-model'

afterEach(cleanup)

describe('saved payment method settings', () => {
  it('shows only masked default-card details and never requests card numbers', () => {
    const { container } = render(<AeSavedPaymentMethodsCard summary={{
      kind: 'ready', hasPaymentMethod: true,
      card: { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isDefault: true },
    }} />)
    expect(screen.getByText('•••• 4242')).toBeInTheDocument()
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(container.querySelector('input')).toBeNull()
  })

  it('shows an actionable explanation when no card is saved', () => {
    render(<AeSavedPaymentMethodsCard summary={{ kind: 'missing', hasPaymentMethod: false }} />)
    expect(screen.getByText('No saved card')).toBeInTheDocument()
    expect(screen.getByText(/enable automatic credit recharge/)).toBeInTheDocument()
  })
  it('flags cards expired at month end and cards nearing expiry', () => {
    const now = new Date(2026, 2, 15).getTime()
    expect(paymentCardExpiryKind({ brand: 'visa', last4: '1111', expMonth: 2, expYear: 2026 }, now)).toBe('expired')
    expect(paymentCardExpiryKind({ brand: 'visa', last4: '2222', expMonth: 3, expYear: 2026 }, now)).toBe('expires_soon')
    expect(paymentCardExpiryKind({ brand: 'visa', last4: '3333', expMonth: 12, expYear: 2026 }, now)).toBeNull()
  })
})

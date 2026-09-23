// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PayoutActionBar } from './PayoutActionBar'

describe('PayoutActionBar', () => {
  it('renders review and express controls together', () => {
    render(
      <PayoutActionBar
        accountState="ready"
        stripeMaskLabel="acct_••••1234"
        stripeMaskAriaLabel="Stripe Express account ending 1234"
        showStripeUnbound={false}
        expressStatusExplanation="Manage bank account details, view payout transfer receipts, and download annual tax statements."
        payoutGuidanceText="Your payout account is ready."
        showReviewPayout
        showExpressDashboard
        showSetupPayouts={false}
        showContinueOnboarding={false}
        expressOnboardingLabel="Update Connect details"
        expressButtonVariant="outline"
        actionsDisabled={false}
        expressActionRef={createRef()}
        payoutActionRef={createRef()}
        onReviewPayout={vi.fn()}
        onExpressDashboard={vi.fn()}
        onSetupPayouts={vi.fn()}
        onContinueOnboarding={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Review payout' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View Bank Payouts on Stripe/u })).toBeInTheDocument()
    expect(screen.getByText('Stripe Express Account Active')).toBeInTheDocument()
  })
})

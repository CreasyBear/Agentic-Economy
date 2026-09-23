// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EarningsEmptyState } from './EarningsEmptyState'

describe('EarningsEmptyState', () => {
  it('renders unauthenticated error copy', () => {
    render(<EarningsEmptyState variant="error_unauthenticated" />)
    expect(screen.getByText('Earnings are unavailable for this session.')).toBeInTheDocument()
  })

  it('renders empty accounts copy', () => {
    render(<EarningsEmptyState variant="empty_accounts" />)
    expect(
      screen.getByText('No provider earnings account exists yet. Setup or test calls do not create earnings.'),
    ).toBeInTheDocument()
  })
})

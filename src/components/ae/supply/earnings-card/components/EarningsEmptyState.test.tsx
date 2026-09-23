// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EarningsEmptyState } from './EarningsEmptyState'

afterEach(cleanup)

describe('EarningsEmptyState', () => {
  it('renders unauthenticated failures as an error alert without title punctuation', () => {
    render(<EarningsEmptyState variant="error_unauthenticated" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Earnings are unavailable for this session')
    expect(screen.queryByText('Earnings are unavailable for this session.')).not.toBeInTheDocument()
  })

  it('renders source failures as an error alert instead of an empty state', () => {
    render(<EarningsEmptyState variant="error_source" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Earnings source is unavailable')
    expect(screen.queryByText('Earnings source is unavailable.')).not.toBeInTheDocument()
  })

  it('renders empty accounts copy without title punctuation', () => {
    render(<EarningsEmptyState variant="empty_accounts" />)
    expect(screen.getByRole('heading', { name: 'No earnings have been recorded' })).toBeInTheDocument()
    expect(
      screen.getByText('No provider earnings account exists yet. Setup or test calls do not create earnings.'),
    ).toBeInTheDocument()
  })
})

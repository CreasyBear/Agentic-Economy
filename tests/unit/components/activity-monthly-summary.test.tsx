/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { ActivityMonthlySummary } from '@/components/ae/activity/components/ActivityMonthlySummary'
import type { ActivityMonthlySummaryView } from '@/components/ae/activity/activity.contracts'

const monthly: ActivityMonthlySummaryView = {
  unavailable: false, callCountLabel: '1,004', completedLabel: '1,000', refusedLabel: '3', attentionLabel: '1',
  spendLabel: 'A$9,007,199,254,740,993.01', spendTitle: 'Gross settled charges',
  spendBasis: 'Recorded AUD account charges.', scopeLabel: 'Account', windowTooLarge: false,
}
afterEach(cleanup)

describe('Arc Activity period summary', () => {
  it('associates every period fact with its exact supplied value without a chart or invented comparison', () => {
    render(<ActivityMonthlySummary periodStart="1 October to 3 October 2026" monthly={monthly} retryPending={false} onRetry={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Period totals' })
    const terms = within(region).getAllByRole('term')
    expect(terms.map(term => term.textContent)).toEqual(['Calls', 'Completed', 'Refused', 'Outcome unknown', 'Gross settled charges'])
    expect(terms.map(term => within(term.parentElement!).getByRole('definition').textContent)).toEqual(['1,004', '1,000', '3', '1', monthly.spendLabel])
    expect(region).toHaveTextContent('Account. 1 October to 3 October 2026.')
    expect(region).toHaveTextContent('Recorded AUD account charges. Call completion does not by itself confirm delivery or settlement.')
    expect(within(region).queryByRole('img')).toBeNull()
    expect(within(region).queryByRole('button')).toBeNull()
    expect(region).not.toHaveTextContent('No prior comparison')
  })

  it('retains available counts and an unknown Agent amount through a blocked and retried refresh', () => {
    const onRetry = vi.fn()
    const partial = { ...monthly, unavailable: true, scopeLabel: 'Agent', spendTitle: 'Agent settled charges', spendLabel: 'Amount coverage incomplete' }
    const view = render(<ActivityMonthlySummary periodStart="Last 30 days" monthly={partial} retryPending onRetry={onRetry} />)
    const region = screen.getByRole('region', { name: 'Period totals' })
    expect(within(region).getByText('1,004')).toBeInTheDocument()
    expect(within(region).getByText('Amount coverage incomplete')).toBeInTheDocument()
    expect(region).not.toHaveTextContent('A$0.00')
    expect(region).not.toHaveTextContent(monthly.spendLabel)
    const refresh = within(region).getByRole('button', { name: 'Refreshing…' })
    expect(refresh).toBeDisabled()
    fireEvent.click(refresh)
    expect(onRetry).not.toHaveBeenCalled()
    view.rerender(<ActivityMonthlySummary periodStart="Last 30 days" monthly={partial} retryPending={false} onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh summaries' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('keeps an unsupported window explicit and does not offer a refresh that cannot obtain totals', () => {
    const absent = { ...monthly, unavailable: true, windowTooLarge: true, callCountLabel: 'Unavailable', completedLabel: 'Unavailable', refusedLabel: 'Unavailable', attentionLabel: 'Unavailable', spendLabel: 'Unavailable' }
    render(<ActivityMonthlySummary periodStart="All time" monthly={absent} retryPending={false} onRetry={vi.fn()} />)
    const region = screen.getByRole('region', { name: 'Period totals' })
    expect(within(region).getByText('Choose a shorter period for totals')).toBeInTheDocument()
    expect(within(region).getAllByText('Unavailable')).toHaveLength(5)
    expect(within(region).queryByRole('button')).toBeNull()
    expect(region).not.toHaveTextContent('A$0.00')
  })
})

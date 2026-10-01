/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactNode } from 'react'
import '../../setup/jsdom-platform'
import type { MarketplaceMetricDay, MarketplaceMetricsRange, MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'
import { emptyMarketplaceFunding } from '@/modules/observability/public'
import { MarketplaceActivityView, OverviewMarketplaceActivity } from '@/components/ae/admin/metrics/MarketplaceActivity'
import { AdminMetricsPage } from '@/components/ae/admin/metrics/AdminMetricsPage'

const query = vi.hoisted(() => vi.fn())
vi.mock('convex/react', () => ({ useQuery: query }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

function MetricsPage() {
  const [range, setRange] = useState<MarketplaceMetricsRange>('last_7')
  return <AdminMetricsPage range={range} onRangeChange={setRange} />
}

function day(date: string, completedCalls: number): MarketplaceMetricDay {
  return { day: date, computedAt: 1, version: 1, complete: true, settledCallValue: null,
    money: 'no_settled_usage', settledCalls: 0, attemptedCalls: completedCalls, completedCalls,
    uncertainCalls: 0, uncertainCallsOpenAtClose: 0, quotesCreated: completedCalls, quotesConvertedAtClose: completedCalls,
    transactingWorkspaces: 1, transactingAgents: 1, transactingProviders: 1, transactingTools: 1,
    returningWorkspaces: 0, newTransactingWorkspaces: 1, newTransactingProviders: 1,
    terminalCalls: completedCalls, terminalCallsWithResolution: completedCalls,
    funding: { ...emptyMarketplaceFunding('production'), buyingAccounts: 1, completedCustomerFundedCalls: completedCalls } }
}
function report(): MarketplaceMetricsReport {
  return { coverageComplete: false, days: [day('2026-09-28', 12), day('2026-09-30', 18)],
    partialDays: [], latestDay: '2026-09-30', headline: null, ratios: null, wow: null }
}
afterEach(cleanup)

describe('founder marketplace dashboard', () => {
  it('withholds incomplete totals and exposes missing days through keyboard inspection', () => {
    render(<MarketplaceActivityView report={report()} range="last_7" onRangeChange={vi.fn()} />)
    expect(screen.getAllByText('Unavailable')).toHaveLength(4)
    expect(screen.getByText('2 of 7 days have completed snapshots. Range totals are withheld.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Delivered purchases/ }))
    const chart = screen.getByRole('img', { name: /Delivered purchases/ })
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.queryByText('Revenue')).toBeNull()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(screen.getByText('No complete snapshot')).toBeTruthy()
    fireEvent.keyDown(chart, { key: 'End' })
    expect(screen.getByText('18')).toBeTruthy()
  })

  it('uses the server-deduplicated Account total and a real protected CSV download', () => {
    const value: MarketplaceMetricsReport = { ...report(), coverageComplete: true,
      funding: { ...emptyMarketplaceFunding('production'), buyingAccounts: 1, repeatBuyingAccounts: 1, accountCoverageComplete: true },
      headline: { transactingWorkspaces: 1, settledCalls: 0, settledCallValue: null, money: 'no_settled_usage', successRate: 1 } }
    render(<MarketplaceActivityView report={value} range="last_30" onRangeChange={vi.fn()} />)
    const tab = screen.getByRole('tab', { name: /Buying Accounts/ })
    expect(within(tab).getByText('1')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe('/api/admin/metrics-export?range=last_30')
    expect(screen.queryByText('Exported')).toBeNull()
  })

  it('supports keyboard metric selection and invokes range changes', () => {
    const change = vi.fn()
    render(<MarketplaceActivityView report={report()} range="last_7" onRangeChange={change} />)
    const first = screen.getByRole('tab', { name: /Buying Accounts/ })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Delivered purchases/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    expect(change).toHaveBeenCalledWith('last_30')
  })

  it('shows an empty observation state without synthetic activity', () => {
    render(<MarketplaceActivityView report={{ ...report(), days: [], latestDay: null }} range="last_7" onRangeChange={vi.fn()} />)
    expect(screen.getByText('No complete daily observations yet.')).toBeTruthy()
    expect(screen.getAllByText('Unavailable')).toHaveLength(4)
    expect(screen.queryByText('example.com')).toBeNull()
  })

  it.each([['overview', OverviewMarketplaceActivity], ['metrics', MetricsPage]] as const)(
    'keeps %s period controls focused and withholds old values while the next report loads', (_name, Page) => {
      const ready: MarketplaceMetricsReport = { ...report(), coverageComplete: true,
        headline: { transactingWorkspaces: 1, settledCalls: 0, settledCallValue: null, money: 'no_settled_usage', successRate: 1 } }
      query.mockReturnValue(ready)
      const view = render(<Page />)
      expect(within(screen.getByRole('tab', { name: /Quotes created/ })).getByText('30')).toBeTruthy()
      const next = screen.getByRole('button', { name: 'Last 30 days' })
      const first = screen.getByRole('button', { name: 'Last 7 days' })
      first.focus()
      query.mockReturnValue(undefined)
      fireEvent.keyDown(first, { key: 'ArrowRight' })
      expect(document.activeElement).toBe(next)
      expect(screen.getByRole('region', { name: 'Marketplace activity' }).getAttribute('aria-busy')).toBe('true')
      expect(screen.getAllByText('Loading…')).toHaveLength(4)
      expect(within(screen.getByRole('tab', { name: /Quotes created/ })).queryByText('30')).toBeNull()
      query.mockReturnValue({ ...ready, days: [day('2026-09-30', 41)] })
      view.rerender(<Page />)
      expect(document.activeElement).toBe(next)
      expect(screen.getByRole('region', { name: 'Marketplace activity' }).getAttribute('aria-busy')).toBe('false')
      expect(within(screen.getByRole('tab', { name: /Quotes created/ })).getByText('41')).toBeTruthy()
    },
  )
})

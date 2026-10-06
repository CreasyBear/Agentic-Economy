/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactNode } from 'react'
import '../../setup/jsdom-platform'
import type { MarketplaceMetricDay, MarketplaceMetricsRange, MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'
import { emptyMarketplaceFunding } from '@/modules/observability/public'
import { MarketplaceActivityView, OverviewMarketplaceActivity } from '@/components/ae/admin/metrics/MarketplaceActivity'
import { AdminMetricsPage } from '@/components/ae/admin/metrics/AdminMetricsPage'
import { MarketplaceSignalCharts } from '@/components/ae/admin/metrics/components/MarketplaceSignalCharts'

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

describe('ARC marketplace signal charts', () => {
  function completeReport(): MarketplaceMetricsReport {
    return { ...report(), coverageComplete: true,
      days: [{ ...day('2026-09-29', 9), quotesCreated: 20, quotesConvertedAtClose: 8 },
        { ...day('2026-09-30', 3), quotesCreated: 10, quotesConvertedAtClose: 4 }],
      headline: { transactingWorkspaces: 1, settledCalls: 12, settledCallValue: null, money: 'no_settled_usage', successRate: 1 },
      funding: { ...emptyMarketplaceFunding('production'), customerFundedCalls: 9, promotionalOnlyCalls: 3,
        unclassifiedCalls: 77, refundedCalls: 44, repeatBuyingAccounts: 0, accountCoverageComplete: true } }
  }

  it('keeps the funding denominator fixed while inspecting disjoint paid Call categories', () => {
    render(<MarketplaceSignalCharts report={completeReport()} />)
    const purchased = screen.getByRole('button', { name: 'Uses purchased credit, 9 Calls, 75%' })
    const promotional = screen.getByRole('button', { name: 'Promotional only, 3 Calls, 25%' })
    fireEvent.click(purchased)
    expect(purchased.getAttribute('aria-pressed')).toBe('true')
    expect(promotional.getAttribute('aria-label')).toBe('Promotional only, 3 Calls, 25%')
    fireEvent.keyDown(purchased, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(promotional)
    expect(screen.getByText(/Paid Calls 12 Calls/)).toBeTruthy()
  })

  it('exposes the Quote cohort and conversion rate through keyboard inspection', () => {
    render(<MarketplaceSignalCharts report={completeReport()} />)
    const funnel = screen.getByRole('group', { name: 'Quote conversion. Use arrow keys to move between steps.' })
    fireEvent.keyDown(funnel, { key: 'End' })
    expect(screen.getByText('Converted to Calls, 12 Quotes, 40% of the previous step, 40% of the first')).toBeTruthy()
    const table = within(screen.getByRole('table', { name: 'Quote conversion' }))
    expect(table.getByRole('row', { name: 'Quotes created 30 Quotes 100% 100%' })).toBeTruthy()
    expect(table.getByRole('row', { name: 'Converted to Calls 12 Quotes 40% 40%' })).toBeTruthy()
    fireEvent.keyDown(funnel, { key: 'Escape' })
    expect(screen.queryByText('Converted to Calls, 12 Quotes, 40% of the previous step, 40% of the first')).toBeNull()
  })

  it.each(['range', 'day', 'none'] as const)('withholds comparisons for incomplete %s evidence', kind => {
    const ready = completeReport()
    const incomplete = kind === 'range' ? { ...ready, coverageComplete: false }
      : kind === 'none' ? { ...ready, days: [] }
      : { ...ready, days: ready.days.map(item => ({ ...item, complete: false })) }
    render(<MarketplaceSignalCharts report={incomplete} />)
    expect(screen.getAllByRole('status').map(item => item.textContent)).toEqual([
      'Complete observations are required for this comparison.', 'Complete observations are required for this comparison.',
    ])
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('No paid Calls')).toBeNull()
  })

  it.each(['total', 'daily'] as const)('withholds an inconsistent %s conversion funnel instead of rescaling invalid evidence', kind => {
    const ready = completeReport()
    render(<MarketplaceSignalCharts report={{ ...ready, days: ready.days.map((item, index) => ({ ...item,
      quotesConvertedAtClose: kind === 'total' ? 50 : index === 0 ? 30 : 0,
    })) }} />)
    expect(screen.getByRole('status').textContent).toBe('Quote conversion data needs review.')
    expect(screen.queryByRole('table', { name: 'Quote conversion' })).toBeNull()
  })

  it('removes previous charts while loading another range', () => {
    const view = render(<MarketplaceSignalCharts report={completeReport()} />)
    view.rerender(<MarketplaceSignalCharts report={undefined} />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('status').map(item => item.textContent)).toEqual([
      'Loading the selected period…', 'Loading the selected period…',
    ])
  })

  it('shows genuine zero activity without a conversion percentage or fractional Account axis', () => {
    const ready = completeReport()
    const empty = emptyMarketplaceFunding('production')
    render(<MarketplaceActivityView report={{ ...ready,
      funding: { ...empty, repeatBuyingAccounts: 0, accountCoverageComplete: true },
      days: ready.days.map(item => ({ ...item, quotesCreated: 0, quotesConvertedAtClose: 0, funding: empty })),
    }} range="last_7" onRangeChange={vi.fn()} />)
    expect(screen.getByText('No paid Calls')).toBeTruthy()
    expect(screen.getByText('No Quotes yet')).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Quote conversion' })).toBeNull()
    const timeSeries = within(screen.getByRole('figure', { name: 'Buying Accounts, last 7 days' }))
    expect(timeSeries.queryByText('0.5')).toBeNull()
    expect(timeSeries.getByText('1')).toBeTruthy()
  })

  it('inspects complete time series with exact money beyond safe integer precision', () => {
    const ready = completeReport()
    render(<MarketplaceActivityView report={{ ...ready, days: ready.days.map(item => ({ ...item,
      funding: { ...emptyMarketplaceFunding('production'), purchasedUnits: item.day === '2026-09-29' ? '1' : '9007199254740993' },
    })) }} range="last_7" onRangeChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: /Purchased credit spent/ }))
    const chart = screen.getByRole('slider', { name: /Purchased credit spent, last 7 days, explore by date/ })
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(chart.getAttribute('aria-valuetext')).toBe('29 Sept: Purchased credit spent AUD 0.000001')
    fireEvent.keyDown(chart, { key: 'End' })
    expect(chart.getAttribute('aria-valuetext')).toBe('30 Sept: Purchased credit spent AUD 9007199254.740993')
    const values = within(screen.getByRole('table', { name: 'Purchased credit spent, last 7 days' }))
    expect(values.getByRole('cell', { name: 'AUD 9007199254.740993' })).toBeTruthy()
    expect(values.getByRole('cell', { name: 'AUD 0.000001' })).toBeTruthy()
  })
})

describe('founder marketplace dashboard', () => {
  it('withholds incomplete totals and exposes missing days through keyboard inspection', () => {
    render(<MarketplaceActivityView report={report()} range="last_7" onRangeChange={vi.fn()} />)
    expect(screen.getAllByText('Unavailable')).toHaveLength(4)
    expect(screen.getByText('2 of 7 days have completed snapshots. Range totals are withheld.')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Delivered purchases/ }))
    const chart = screen.getByRole('img', { name: /Delivered purchases/ })
    expect(chart.querySelector('svg path')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.queryByText('Revenue')).toBeNull()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(chart).getByRole('status').textContent).toContain('No complete snapshot')
    fireEvent.keyDown(chart, { key: 'End' })
    expect(within(chart).getByRole('status').textContent).toContain('18')
  })

  it('keeps an observed zero visible while a missing day stays unplotted', () => {
    const value = { ...report(), days: [day('2026-09-28', 0), day('2026-09-30', 18)] }
    render(<MarketplaceActivityView report={value} range="last_7" onRangeChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('tab', { name: /Delivered purchases/ }))
    const chart = screen.getByRole('img', { name: /Delivered purchases/ })
    const points = chart.querySelectorAll('svg circle')
    expect(points).toHaveLength(2)
    expect(points[0]?.getAttribute('cy')).toBe('180')
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(within(chart).getByRole('status').textContent).toContain('0')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(chart).getByText('No complete snapshot')).toBeTruthy()
  })

  it('uses the server-deduplicated Account total and a real protected CSV download', () => {
    const value: MarketplaceMetricsReport = { ...report(), coverageComplete: true,
      funding: { ...emptyMarketplaceFunding('production'), buyingAccounts: 1, repeatBuyingAccounts: 1, accountCoverageComplete: true },
      headline: { transactingWorkspaces: 1, settledCalls: 0, settledCallValue: null, money: 'no_settled_usage', successRate: 1 } }
    render(<MarketplaceActivityView report={value} range="last_30" onRangeChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /^Buying Accounts\s*1\s*Distinct Accounts/ })).toBeTruthy()
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

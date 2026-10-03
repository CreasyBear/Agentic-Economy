// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MetricsControls } from '@/components/ae/admin/metrics/components/MetricsControls'
import { MetricsDayTable } from '@/components/ae/admin/metrics/components/MetricsDayTable'
import type { AdminMetricDayRow } from '@/components/ae/admin/metrics/metrics.contracts'
import type { MarketplaceMetricsRange } from '@/lib/operator/admin-console/metrics.contracts'

const row: AdminMetricDayRow = {
  day: '2026-10-02', settledCallValue: 'A$9,007,199,254,740,993.01', money: 'Settled only',
  settledCalls: '1,001', attemptedCalls: '1,100', completedCalls: '1,002', uncertainCalls: '3',
  quotesCreated: '1,200', quotesConvertedAtClose: '1,003', transactingWorkspaces: '15',
  transactingAgents: '16', transactingProviders: '17', transactingTools: '18',
  returningWorkspaces: '19', terminalCalls: '1,004', terminalCallsWithResolution: '1,005',
}

afterEach(cleanup)

describe('Arc daily metric views', () => {
  it('starts with focused Call records and keeps the date and supplied order intact', () => {
    render(<MetricsDayTable rows={[row, { ...row, day: '2026-10-01' }]} />)
    const table = screen.getByRole('table', { name: 'Daily metrics: Calls' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Day', 'Attempted Calls', 'Completed Calls', 'Uncertain Calls', 'Settled Calls',
    ])
    expect(within(table).getAllByRole('row').slice(1).map((record) => record.querySelector('time')?.dateTime)).toEqual(['2026-10-02', '2026-10-01'])
    expect(within(table).getAllByText('1,100')).toHaveLength(2)
    expect(within(table).queryByRole('button')).toBeNull()
  })

  it('exposes every metric through five column views without recalculating money or counts', () => {
    render(<MetricsDayTable rows={[row]} />)
    const seen = new Set<string>()
    for (const view of ['Calls', 'Money', 'Quotes', 'Participants', 'Resolution']) {
      fireEvent.click(screen.getByRole('button', { name: view }))
      const table = screen.getByRole('table', { name: `Daily metrics: ${view}` })
      expect(within(table).getAllByRole('row')).toHaveLength(2)
      for (const cell of within(table).getAllByRole('cell')) seen.add(cell.textContent ?? '')
      expect(screen.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(seen).toEqual(new Set(Object.values(row)))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resolution' }), { key: 'Home' })
    expect(screen.getByRole('button', { name: 'Calls' })).toHaveFocus()
    expect(screen.getByRole('table', { name: 'Daily metrics: Calls' })).toBeInTheDocument()
  })

  it('keeps the selected view across incoming snapshots and gives empty records a named state', () => {
    const view = render(<MetricsDayTable rows={[row]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Money' }))
    view.rerender(<MetricsDayTable rows={[{ ...row, settledCallValue: 'No settled usage', money: 'No settled usage' }]} />)
    const table = screen.getByRole('table', { name: 'Daily metrics: Money' })
    expect(within(table).getAllByText('No settled usage')).toHaveLength(2)
    view.rerender(<MetricsDayTable rows={[]} />)
    expect(screen.getByRole('table', { name: 'Daily metrics: Money' })).toHaveTextContent('No metrics days recorded yet.')
  })
})

function ControlledRange() {
  const [range, setRange] = useState<MarketplaceMetricsRange>('last_7')
  return <MetricsControls range={range} onRangeChange={setRange} />
}

it('changes the real range through keyboard selection and exports the complete chosen report', () => {
  render(<ControlledRange />)
  const group = screen.getByRole('group', { name: 'Reporting range' })
  fireEvent.keyDown(within(group).getByRole('button', { name: '7 days' }), { key: 'ArrowRight' })
  expect(within(group).getByRole('button', { name: '30 days' })).toHaveFocus()
  expect(within(group).getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/admin/metrics-export?range=last_30')
  expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('download')
  fireEvent.keyDown(within(group).getByRole('button', { name: '30 days' }), { key: 'End' })
  expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/admin/metrics-export?range=last_90')
})

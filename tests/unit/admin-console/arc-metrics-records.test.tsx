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
  it('starts with the newest day and sorts formatted counts numerically without mutating snapshots', () => {
    const rows = [
      { ...row, attemptedCalls: '9,000' },
      { ...row, day: '2026-10-03', attemptedCalls: '12,000' },
      { ...row, day: '2026-10-01', attemptedCalls: '999' },
    ]
    render(<MetricsDayTable rows={rows} />)
    const table = screen.getByRole('table', { name: 'Daily metrics: Calls' })
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Day', 'Attempted Calls', 'Completed Calls', 'Uncertain Calls', 'Settled Calls', 'Details',
    ])
    expect(within(table).getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'descending')
    expect(within(table).getAllByRole('row').slice(1).map((record) => record.querySelector('time')?.dateTime)).toEqual([
      '2026-10-03', '2026-10-02', '2026-10-01',
    ])
    expect(within(table).getByRole('button', { name: 'View snapshot for 2026-10-02' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Details' })).not.toHaveAttribute('aria-sort')

    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Day' }))
    expect(within(table).getByRole('columnheader', { name: /Day/ })).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Day' }))
    expect(within(table).getByRole('columnheader', { name: /Day/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(within(table).getAllByRole('row').slice(1).map((record) => record.querySelector('time')?.dateTime)).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03',
    ])
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Day' }))
    expect(within(table).getByRole('columnheader', { name: /Day/ })).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Attempted Calls' }))
    expect(within(table).getAllByRole('row').slice(1).map((record) => record.querySelector('time')?.dateTime)).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03',
    ])
    expect(within(table).getByRole('columnheader', { name: /Attempted Calls/ })).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(within(table).getByRole('button', { name: /Sort by Attempted Calls/ }))
    expect(within(table).getAllByRole('row').slice(1).map((record) => record.querySelector('time')?.dateTime)).toEqual([
      '2026-10-03', '2026-10-02', '2026-10-01',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Money' }))
    const moneyTable = screen.getByRole('table', { name: 'Daily metrics: Money' })
    expect(within(moneyTable).getByRole('columnheader', { name: /Day/ })).toHaveAttribute('aria-sort', 'none')
    expect(screen.queryByRole('status')).toBeNull()
    expect(within(moneyTable).getAllByRole('row').slice(1).map(record => record.querySelector('time')?.dateTime)).toEqual([
      '2026-10-02', '2026-10-03', '2026-10-01',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Calls' }))
    const returnedTable = screen.getByRole('table', { name: 'Daily metrics: Calls' })
    expect(within(returnedTable).getByRole('columnheader', { name: /Attempted Calls/ })).toHaveAttribute('aria-sort', 'descending')
    expect(within(returnedTable).getAllByRole('row').slice(1).map(record => record.querySelector('time')?.dateTime)).toEqual([
      '2026-10-03', '2026-10-02', '2026-10-01',
    ])
    expect(rows.map((record) => record.day)).toEqual(['2026-10-02', '2026-10-03', '2026-10-01'])
  })

  it('exposes every metric through five column views without recalculating money or counts', () => {
    render(<MetricsDayTable rows={[row]} />)
    const seen = new Set<string>()
    for (const view of ['Calls', 'Money', 'Quotes', 'Participants', 'Resolution']) {
      fireEvent.click(screen.getByRole('button', { name: view }))
      const table = screen.getByRole('table', { name: `Daily metrics: ${view}` })
      expect(within(table).getAllByRole('row')).toHaveLength(2)
      expect(within(table).getByRole('columnheader', { name: 'Details' })).toBeInTheDocument()
      if (view === 'Money') {
        expect(within(table).getByRole('columnheader', { name: 'Settled value' })).not.toHaveAttribute('aria-sort')
        expect(within(table).getByRole('columnheader', { name: 'Money basis' })).not.toHaveAttribute('aria-sort')
      }
      for (const cell of within(table).getAllByRole('cell')) {
        if (cell.getAttribute('data-label') !== 'Details') seen.add(cell.textContent ?? '')
      }
      expect(screen.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(seen).toEqual(new Set(Object.values(row)))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resolution' }), { key: 'Home' })
    expect(screen.getByRole('button', { name: 'Calls' })).toHaveFocus()
    expect(screen.getByRole('table', { name: 'Daily metrics: Calls' })).toBeInTheDocument()
  })

  it('shows every current snapshot value in five labeled groups and closes accessibly', () => {
    render(<MetricsDayTable rows={[row]} />)
    fireEvent.click(screen.getByRole('button', { name: 'View snapshot for 2026-10-02' }))

    const dialog = screen.getByRole('dialog', { name: '2026-10-02' })
    for (const value of Object.values(row)) expect(within(dialog).getByText(value, { exact: true })).toBeInTheDocument()
    for (const group of ['Calls', 'Money', 'Quotes', 'Participants', 'Resolution']) {
      expect(within(dialog).getByRole('region', { name: group })).toBeInTheDocument()
    }

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View snapshot for 2026-10-02' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '2026-10-02' })).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('refreshes an open day from new props and closes when that day leaves the range', () => {
    const view = render(<MetricsDayTable rows={[row]} />)
    fireEvent.click(screen.getByRole('button', { name: 'View snapshot for 2026-10-02' }))

    const refreshed = { ...row, attemptedCalls: '2,001', settledCallValue: 'A$12.34' }
    view.rerender(<MetricsDayTable rows={[refreshed]} />)
    const dialog = screen.getByRole('dialog', { name: '2026-10-02' })
    expect(within(dialog).getByText('2,001')).toBeInTheDocument()
    expect(within(dialog).getByText('A$12.34')).toBeInTheDocument()
    expect(within(dialog).queryByText(row.attemptedCalls)).toBeNull()

    view.rerender(<MetricsDayTable rows={[{ ...refreshed, day: '2026-10-03' }]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
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

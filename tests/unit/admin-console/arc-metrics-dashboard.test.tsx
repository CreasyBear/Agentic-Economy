/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MetricsDashboard } from '@/components/ae/admin/metrics/MetricsDashboard'
import type { AdminMetricCallPoint } from '@/components/ae/admin/metrics/metrics.contracts'

const cards = [{ label: 'Settled Call value', value: 'A$9,007,199,254,740,993.01', delta: 'No prior comparison' }]
const ratios = [{ label: 'Purchase resolution coverage', value: '81.2%' }]
const dailyCalls: readonly AdminMetricCallPoint[] = [
  { day: '2026-10-03', attemptedCalls: 3000, completedCalls: 2900, uncertainCalls: 4 },
  { day: '2026-10-01', attemptedCalls: 1000, completedCalls: 900, uncertainCalls: 2 },
  { day: '2026-10-02', attemptedCalls: 2000, completedCalls: 1900, uncertainCalls: 3 },
]
afterEach(cleanup)

function dashboard(points = dailyCalls) {
  return <MetricsDashboard cards={cards} ratios={ratios} dailyCalls={points} controls={<a href="/api/admin/metrics-export?range=last_7">Export CSV</a>} />
}

describe('Arc metrics dashboard', () => {
  it('preserves exact projected money and ratios and inspects real sorted counts with the keyboard', () => {
    render(dashboard())
    expect(screen.getByText(cards[0]!.value)).toBeInTheDocument()
    expect(screen.getByText('81.2%')).toBeInTheDocument()
    const chart = screen.getByRole('img', { name: /Attempted Calls, recorded daily snapshots/ })
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(within(screen.getByRole('status')).getByText('2026-10-01')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('1,000')).toBeInTheDocument()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(screen.getByRole('status')).getByText('2,000')).toBeInTheDocument()
    fireEvent.keyDown(chart, { key: 'End' })
    expect(within(screen.getByRole('status')).getByText('2026-10-03')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('3,000')).toBeInTheDocument()
    expect(dailyCalls[0]?.day).toBe('2026-10-03')
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/api/admin/metrics-export?range=last_7')
  })

  it('selects the actual Completed series, clears the prior inspection and clamps to the current data', () => {
    const view = render(dashboard())
    fireEvent.keyDown(screen.getByRole('img'), { key: 'End' })
    fireEvent.click(screen.getByRole('button', { name: 'Completed Calls' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: 'Completed Calls' })).toHaveAttribute('aria-pressed', 'true')
    const chart = screen.getByRole('img', { name: /Completed Calls, recorded daily snapshots/ })
    fireEvent.keyDown(chart, { key: 'Home' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(within(screen.getByRole('status')).getByText('900')).toBeInTheDocument()
    fireEvent.keyDown(chart, { key: 'End' })
    view.rerender(dashboard([{ day: '2026-10-05', attemptedCalls: 20, completedCalls: 15, uncertainCalls: 1 }]))
    expect(within(screen.getByRole('status')).getByText('2026-10-05')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('15')).toBeInTheDocument()
    fireEvent.blur(chart)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not synthesize empty snapshots and keeps a single zero count finite', () => {
    const view = render(dashboard([]))
    expect(screen.getByText('No daily Call snapshots recorded.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    view.rerender(dashboard([{ day: '2026-10-01', attemptedCalls: 0, completedCalls: 0, uncertainCalls: 0 }]))
    const chart = screen.getByRole('img')
    for (const path of chart.querySelectorAll('path')) expect(path.getAttribute('d')).not.toMatch(/NaN|Infinity/u)
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(within(screen.getByRole('status')).getByText('0')).toBeInTheDocument()
  })
})

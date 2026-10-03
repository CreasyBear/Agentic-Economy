/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MetricsDashboard } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import type { AdminMetricCallPoint } from '@/components/ae/admin/metrics/metrics.contracts'

const cards = [{ label: 'Settled Call value', value: 'A$9,007,199,254,740,993.01', delta: 'No prior comparison' }]
const ratios = [{ label: 'Purchase resolution coverage', value: '81.2%' }]
const dailyCalls: readonly AdminMetricCallPoint[] = [
  { day: '2026-10-03', attemptedCalls: 3000, completedCalls: 2900, uncertainCalls: 4 },
  { day: '2026-10-01', attemptedCalls: 1000, completedCalls: 900, uncertainCalls: 2 },
  { day: '2026-10-02', attemptedCalls: 2000, completedCalls: 1900, uncertainCalls: 3 },
]
afterEach(cleanup)

function dashboard(points = dailyCalls, coverageDescription?: string) {
  return <MetricsDashboard cards={cards} ratios={ratios} dailyCalls={points} {...(coverageDescription === undefined ? {} : { coverageDescription, withheldMetricLabels: ['Settled Call value', 'Settled Calls', 'Success rate', 'Transacting Workspaces'] })} controls={<a href="/api/admin/metrics-export?range=last_7">Export CSV</a>} />
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
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
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
    expect(chart.querySelectorAll('circle')).toHaveLength(1)
    const observation = chart.querySelector('circle')
    expect(observation?.getAttribute('cx')).toBe('300')
    expect(observation?.getAttribute('cy')).toBe('180')
    expect(chart.querySelectorAll('path')).toHaveLength(0)
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(within(screen.getByRole('status')).getByText('0')).toBeInTheDocument()
  })

  it('keeps the complete dashboard visible while withholding every range total and ratio', () => {
    const description = '1 of 7 days have completed snapshots. Range totals are withheld.'
    render(dashboard([{ day: '2026-10-02', attemptedCalls: 0, completedCalls: 0, uncertainCalls: 0 }], description))

    expect(screen.getByRole('heading', { name: 'Headline metrics' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(description)
    expect(screen.getAllByRole('term')).toHaveLength(4)
    for (const label of ['Settled Call value', 'Settled Calls', 'Success rate', 'Transacting Workspaces']) {
      const fact = screen.getByText(label).parentElement!
      expect(within(fact).getByText('Not available')).toBeInTheDocument()
      expect(within(fact).getByText('Range totals withheld')).toBeInTheDocument()
    }
    expect(screen.getAllByText('Not available')).toHaveLength(4)
    expect(screen.getAllByText('Range totals withheld')).toHaveLength(4)
    expect(screen.queryByText(cards[0]!.value)).toBeNull()
    expect(screen.queryByText('81.2%')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Ratios' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Export CSV' })).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleDescription('Showing 1 recorded daily snapshot. Missing days are not plotted.')
    fireEvent.keyDown(screen.getByRole('img'), { key: 'Home' })
    const inspection = screen.getByText('2026-10-02').closest('[role="status"]')
    expect(inspection).toHaveTextContent('2026-10-02')
    expect(inspection).toHaveTextContent('0')
  })

  it('plots sparse snapshots as discrete observations without connecting or inventing calendar gaps', () => {
    const sparse = [dailyCalls[0]!, dailyCalls[1]!]
    render(dashboard(sparse))
    const chart = screen.getByRole('img')
    expect(chart).toHaveAccessibleDescription('Showing 2 recorded daily snapshots. Missing days are not plotted.')
    expect(chart.querySelectorAll('circle')).toHaveLength(2)
    expect(chart.querySelectorAll('path')).toHaveLength(0)
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-01')
    expect(screen.getByRole('status')).toHaveTextContent('1,000')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-03')
    expect(screen.getByRole('status')).toHaveTextContent('3,000')
    expect(screen.queryByText('2026-10-02')).toBeNull()
    expect(sparse[0]?.day).toBe('2026-10-03')
  })

  it('withholds range values with zero recorded snapshots and keeps the explicit empty state', () => {
    render(dashboard([], '0 of 7 days have completed snapshots. Range totals are withheld.'))
    expect(screen.getAllByRole('term')).toHaveLength(4)
    expect(screen.getAllByText('Not available')).toHaveLength(4)
    expect(screen.getByText('No daily Call snapshots recorded.')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Ratios' })).toBeNull()
    expect(screen.queryByText(cards[0]!.value)).toBeNull()
  })

  it('uses whole Call counts on the axis when the maximum observed value is seven', () => {
    render(dashboard([{ day: '2026-10-02', attemptedCalls: 7, completedCalls: 5, uncertainCalls: 1 }]))
    const daily = within(screen.getByRole('region', { name: 'Daily Calls' }))
    for (const tick of ['9', '6', '3', '0']) expect(daily.getByText(tick)).toBeInTheDocument()
    expect(daily.queryByText('2.5')).toBeNull()
    expect(daily.queryByText('7.5')).toBeNull()
    fireEvent.keyDown(screen.getByRole('img'), { key: 'Home' })
    expect(screen.getByRole('status')).toHaveTextContent('7')
  })
})

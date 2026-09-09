/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryAnalyticsCharts, type DirectoryAnalyticsChartCoverage, type DirectoryAnalyticsSignals } from '@/components/ae/market/DirectoryAnalyticsCharts'
import { DirectoryConcentration } from '@/components/ae/market/DirectoryConcentration'

const coverage: DirectoryAnalyticsChartCoverage = { total: 100, inputSchema: 80, inputFields: 70, outputSchema: 60, outputFields: 50, outputExample: 40, activityReported: 20 }
const base = { priceBuckets: [], categories: [], coverage }
const risingEntry = { resource: 'https://example.com/a', title: 'Weather API', provider: 'example.com', description: 'd', protocol: 'http', metadataJson: '{}', prices: [] }
const rising: DirectoryAnalyticsSignals['rising'] = [
  { resource: risingEntry.resource, title: 'Weather API', provider: 'example.com', payerDelta: 4, momentumBand: 'rising', item: { entry: risingEntry, search: {} } },
]
const signals: DirectoryAnalyticsSignals = {
  depth: [
    { key: 'unknown', label: 'Not comparable', count: 40 },
    { key: 'broad', label: 'Broad (≈1 call/payer)', count: 30 },
    { key: 'repeat', label: 'Repeat (2–4)', count: 20 },
    { key: 'whale_heavy', label: 'Whale-heavy (10+)', count: 10 },
  ],
  recency: [
    { key: 'unknown', label: 'Not reported', count: 35 },
    { key: 'fresh', label: 'Active <7d', count: 25 },
    { key: 'recent', label: 'Touched 7–30d', count: 25 },
    { key: 'stale', label: 'Stale 30d+', count: 15 },
  ],
  rising,
  falling: [
    { resource: 'https://example.com/b', title: 'Echo Service', provider: 'example.com', payerDelta: -3, momentumBand: 'falling' },
  ],
  concentration: {
    basis: 'declared_calls30d', categoryCount: 2,
    categories: [
      { key: 'research', label: 'Research', toolCount: 12, documentedPayers: 10, totalCalls: 900, totalPayers: 40, top3Share: 0.62, hhi: 0.42 },
      { key: 'creative', label: 'Creative', toolCount: 8, documentedPayers: 6, totalCalls: 200, totalPayers: 12, top3Share: 0.3, hhi: 0.18 },
    ],
  },
}
const topTools = [{ key: 'a', label: 'Weather API', calls: 500 }, { key: 'b', label: 'Geo API', calls: 300 }, { key: 'c', label: 'News API', calls: 100 }]
afterEach(cleanup)

it('renders momentum lists only when supplied, as buttons that open the tool', () => {
  const onSignal = vi.fn()
  render(<DirectoryAnalyticsCharts {...base} signals={signals} onSelectSignal={onSignal} />)
  expect(screen.getByText('Momentum')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Rising' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Falling' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'View Tool: Weather API' })).toBeTruthy()
  expect(screen.getByText('▼ 3 payers')).toBeTruthy()
  expect(screen.getByText('3 fewer paying addresses than the previous 30 days')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View Tool: Weather API' }))
  expect(onSignal).toHaveBeenCalledExactlyOnceWith(signals.rising![0]!.item)
})
it('omits the momentum card entirely when no direction lists are supplied', () => {
  render(<DirectoryAnalyticsCharts {...base} signals={{ depth: signals.depth! }} />)
  expect(screen.queryByText('Momentum')).toBeNull()
  expect(screen.getByText('Payer depth')).toBeTruthy()
})
it('renders depth and freshness bucket charts from supplied counts', () => {
  render(<DirectoryAnalyticsCharts {...base} signals={signals} />)
  expect(screen.getByText('Payer depth')).toBeTruthy()
  expect(screen.getByText('Whale-heavy (10+)')).toBeTruthy()
  expect(screen.getByText('Freshness')).toBeTruthy()
  expect(screen.getByText(/Touched 7–30d/)).toBeTruthy()
  expect(screen.getByText(/Reported last-called dates/)).toBeTruthy()
  expect(screen.getByText('Not comparable')).toBeTruthy()
  expect(screen.getByText('Not reported')).toBeTruthy()
})
it('wires depth-band selection into the caller', () => {
  const onDepth = vi.fn()
  render(<DirectoryAnalyticsCharts {...base} signals={{ depth: signals.depth! }} onSelectDepthBand={onDepth} />)
  fireEvent.click(screen.getAllByText('View counts and filter Tools')[0]!)
  fireEvent.click(screen.getByRole('button', { name: 'Filter Whale-heavy (10+): 10 Tools' }))
  expect(onDepth).toHaveBeenCalledExactlyOnceWith('whale_heavy')
})
it('renders the concentration panel with the top category preselected, ring, HHI badge and top-3 meters', () => {
  render(<DirectoryConcentration concentration={signals.concentration!} topTools={topTools} />)
  const select = screen.getByRole('combobox', { name: 'Category' })
  expect(select.textContent).toContain('Research')
  expect(screen.getByText('Top 3 Tools:')).toBeTruthy()
  expect(screen.getByText(/Moderate concentration · HHI 0.42/)).toBeTruthy()
  expect(screen.getByText(/Herfindahl index over reported call shares; 1 = one tool holds all activity/u)).toBeTruthy()
  const meters = screen.getAllByRole('meter')
  expect(meters).toHaveLength(3)
  expect(meters[0]!.getAttribute('aria-valuenow')).toBe('500')
  expect(within(screen.getByText('Weather API').closest('div[class*="grid"]') ?? document.body).getByText('500 calls')).toBeTruthy()
  expect(screen.getByText('Reported calls, last 30 days.')).toBeTruthy()
})
it('switches category ring and HHI band when another category is selected', () => {
  render(<DirectoryConcentration concentration={signals.concentration!} />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Category' }))
  fireEvent.click(screen.getByRole('option', { name: 'Creative' }))
  expect(screen.getByText(/Low concentration · HHI 0.18/)).toBeTruthy()
  expect(screen.getAllByText('30%').length).toBeGreaterThan(0)
})
it('wires category selection from the top3Share chart into the caller', () => {
  const onCategory = vi.fn()
  render(<DirectoryConcentration concentration={signals.concentration!} onSelectCategory={onCategory} />)
  fireEvent.click(screen.getByText('View categories and filter Tools'))
  fireEvent.click(screen.getByRole('button', { name: /Filter Creative/ }))
  expect(onCategory).toHaveBeenCalledExactlyOnceWith('creative')
})
it('labels every number as reported, never measured', () => {
  render(<DirectoryAnalyticsCharts {...base} signals={signals} />)
  expect(screen.queryByText(/measured/iu)).toBeNull()
  expect(screen.getAllByText(/reported/iu).length).toBeGreaterThan(0)
})

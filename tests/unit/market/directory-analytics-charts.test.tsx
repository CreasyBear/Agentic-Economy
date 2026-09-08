/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryAnalyticsCharts, type DirectoryAnalyticsChartCoverage } from '@/components/ae/market/DirectoryAnalyticsCharts'
const coverage: DirectoryAnalyticsChartCoverage = { total: 100, inputSchema: 80, inputFields: 70, outputSchema: 60, outputFields: 50, outputExample: 40, priced: 90, activityReported: 20 }
const priceBuckets = [{ key: 'small', label: 'Under 0.01 USDC', count: 25 }, { key: 'unknown', label: 'Unknown denomination', count: 75 }]
const adoptionBuckets = [{ key: 'missing', label: 'Not reported', count: 80 }, { key: 'zero', label: 'Zero payers', count: 10 }, { key: 'five_plus', label: '5 or more payers', count: 10 }]
const categories = [{ key: 'research', label: 'Research', count: 12 }, { key: 'creative', label: 'Creative', count: 8 }]
afterEach(cleanup)
it('renders full supplied distributions, distinct missing adoption and exact coverage counts', () => {
  const { container } = render(<DirectoryAnalyticsCharts priceBuckets={priceBuckets} adoptionBuckets={adoptionBuckets} categories={categories} coverage={coverage} />)
  expect(screen.getByText('Published price distribution')).toBeTruthy()
  expect(screen.getByText('Adoption distribution')).toBeTruthy()
  expect(screen.getByText('Named input fields')).toBeTruthy()
  expect(screen.getByText('70 / 100')).toBeTruthy()
  expect(screen.getByText('20 / 100')).toBeTruthy()
  expect(screen.getByText('Not reported')).toBeTruthy()
  expect(screen.getByText('Zero payers')).toBeTruthy()
  expect(container.querySelectorAll('[data-slot="chart"]')).toHaveLength(3)
  expect(screen.queryByText(/growth|rating|quality score/i)).toBeNull()
})
it('exposes accessible drilldowns with exact source bucket keys', () => {
  const onPrice = vi.fn(), onCategory = vi.fn(), onAdoption = vi.fn()
  render(<DirectoryAnalyticsCharts priceBuckets={priceBuckets} adoptionBuckets={adoptionBuckets} categories={categories} coverage={coverage} onSelectPriceBucket={onPrice} onSelectCategory={onCategory} onSelectAdoptionBucket={onAdoption} />)
  for (const summary of screen.getAllByText('View counts and filter Tools')) fireEvent.click(summary)
  fireEvent.click(screen.getByRole('button', { name: 'Filter Unknown denomination: 75 Tools' }))
  fireEvent.click(screen.getByRole('button', { name: 'Filter Creative: 8 Tools' }))
  fireEvent.click(screen.getByRole('button', { name: 'Filter Zero payers: 10 Tools' }))
  expect(onPrice).toHaveBeenCalledExactlyOnceWith('unknown')
  expect(onCategory).toHaveBeenCalledExactlyOnceWith('creative')
  expect(onAdoption).toHaveBeenCalledExactlyOnceWith('zero')
})
it('keeps every category in the numerical view even when the chart shows only the largest eight', () => {
  render(<DirectoryAnalyticsCharts priceBuckets={[]} categories={Array.from({ length: 12 }, (_, index) => ({ key: `category-${index}`, label: `Category ${index}`, count: index + 1 }))} coverage={coverage} />)
  fireEvent.click(screen.getByText('View counts'))
  const table = screen.getByRole('table', { name: 'Largest categories' })
  expect(within(table).getAllByRole('row')).toHaveLength(13)
  expect(within(table).getByText('Category 0')).toBeTruthy()
})
it('does not fabricate percentages or chart data when no generation has observations', () => {
  const { container } = render(<DirectoryAnalyticsCharts priceBuckets={[]} categories={[]} coverage={{ ...coverage, total: 0 }} />)
  expect(screen.getByText('No catalogue observations yet')).toBeTruthy()
  expect(container.querySelector('[data-slot="chart"]')).toBeNull()
})
it('allows the dashboard to keep primary distributions separate from secondary coverage', () => {
  const { rerender } = render(<DirectoryAnalyticsCharts priceBuckets={priceBuckets} adoptionBuckets={adoptionBuckets} categories={categories} coverage={coverage} sections={['price', 'adoption']} />)
  expect(screen.getByText('Published price distribution')).toBeTruthy()
  expect(screen.getByText('Adoption distribution')).toBeTruthy()
  expect(screen.queryByText('What the directory tells you')).toBeNull()
  expect(screen.queryByText('Largest categories')).toBeNull()
  rerender(<DirectoryAnalyticsCharts priceBuckets={priceBuckets} adoptionBuckets={adoptionBuckets} categories={categories} coverage={coverage} sections={['coverage', 'categories']} />)
  expect(screen.getByText('What the directory tells you')).toBeTruthy()
  expect(screen.getByText('Largest categories')).toBeTruthy()
  expect(screen.queryByText('Published price distribution')).toBeNull()
})
it('does not compare network-scoped prices against a whole-catalogue denominator', () => {
  const { priced: _priced, ...wholeCoverage } = coverage
  render(<DirectoryAnalyticsCharts priceBuckets={priceBuckets} priceDescription="Base only: 25 of 40 Tools have comparable prices." categories={categories} coverage={wholeCoverage} />)
  expect(screen.getByText('Base only: 25 of 40 Tools have comparable prices.')).toBeTruthy()
  expect(screen.queryByText('Comparable price')).toBeNull()
  expect(screen.getByText('Named input fields')).toBeTruthy()
  expect(screen.getByText('70 / 100')).toBeTruthy()
})

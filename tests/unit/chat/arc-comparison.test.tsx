/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComparisonTable } from '@/components/arc/market/ComparisonTable'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the anchor and currently selected peer aligned when a phone comparison changes', () => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { this.callback([{ contentRect: { width: 390 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    unobserve() {}
    disconnect() {}
  })
  const columns = ['A', 'B', 'C'].map(id => ({ id, name: `Tool ${id}`, caption: '', action: <a href={`/tools/${id}`}>Inspect {id}</a> }))
  const sections = [{ id: 'facts', title: 'Published facts', rows: [{ id: 'price', feature: 'Price', values: { A: 'A$0.0101', B: 'A$0.0202', C: 'A$0.0303' }, sources: { A: 'AE-observed', B: 'Provider-reported', C: 'Directory-reported' }, retainWhenSame: true }] }]
  const { rerender } = render(<ComparisonTable columns={columns} sections={sections} />)
  const table = screen.getByRole('table', { name: 'Find the better fit' })
  expect(within(table).getByRole('columnheader', { name: 'Tool A' })).toBeInTheDocument()
  expect(within(table).getByRole('columnheader', { name: 'Tool B' })).toBeInTheDocument()
  expect(within(table).queryByRole('columnheader', { name: 'Tool C' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tool C' }))
  expect(within(table).getByRole('columnheader', { name: 'Tool C' })).toBeInTheDocument()
  expect(within(table).queryByText('A$0.0202')).not.toBeInTheDocument()
  expect(within(table).getByText('Directory-reported')).toBeInTheDocument()
  rerender(<ComparisonTable columns={columns.slice(0, 2)} sections={sections} />)
  expect(within(table).getByRole('columnheader', { name: 'Tool B' })).toBeInTheDocument()
  expect(within(table).getByText('A$0.0202')).toBeInTheDocument()
  expect(within(table).queryByText('Directory-reported')).not.toBeInTheDocument()
})

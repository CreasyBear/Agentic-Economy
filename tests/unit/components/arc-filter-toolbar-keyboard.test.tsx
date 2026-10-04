/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import { FilterToolbar, type FilterChip } from '@/components/arc/filter-toolbar/filter-toolbar'

afterEach(cleanup)

function Applied({ action = true }: { action?: boolean }) {
  const [filters, setFilters] = useState<FilterChip[]>([
    { id: 'provider', label: 'Provider', value: 'api.example.com' },
    { id: 'network', label: 'Network', value: 'Base' },
  ])
  return <FilterToolbar filters={filters} onRemove={id => setFilters(previous => previous.filter(filter => filter.id !== id))} onClearAll={() => setFilters([])}>
    {action ? <button type="button" data-filter-trigger="">More filters</button> : null}
  </FilterToolbar>
}

describe('Arc filter toolbar focus and presence', () => {
  it('removes applied filters without exposing outgoing controls and returns focus to the remaining action', () => {
    render(<Applied />)
    const provider = screen.getByRole('button', { name: 'Remove Provider: api.example.com' })
    act(() => provider.focus())
    fireEvent.click(provider)
    expect(screen.queryByRole('button', { name: 'Remove Provider: api.example.com' })).toBeNull()
    const network = screen.getByRole('button', { name: 'Remove Network: Base' })
    expect(network).toHaveFocus()
    fireEvent.click(network)
    expect(screen.queryByRole('button', { name: 'Remove Network: Base' })).toBeNull()
    expect(screen.getByRole('button', { name: 'More filters' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull()
  })

  it('keeps focus on the toolbar after clearing when there is no extra action', () => {
    render(<Applied action={false} />)
    const clear = screen.getByRole('button', { name: 'Clear all' })
    act(() => clear.focus())
    fireEvent.click(clear)
    expect(screen.getByRole('group', { name: 'Active filters' })).toHaveFocus()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('No filters applied')).toBeInTheDocument()
  })

  it('exposes only the current menu step and restores trigger focus on Escape', () => {
    render(<FilterToolbar filters={[]} onRemove={() => {}} addFilter={{ fields: [{ id: 'price', label: 'Price', options: ['Any price', 'Under 1 USDC'] }], onAdd: () => {} }} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    const add = screen.getByRole('button', { name: 'Add filter' })
    act(() => add.focus())
    fireEvent.keyDown(add, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Price' }))
    expect(screen.queryByRole('menuitem', { name: 'Price' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Price' })).toBeInTheDocument()
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menuitemradio', { name: 'Any price' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Back to fields' }))
    expect(screen.queryByRole('button', { name: 'Back to fields' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Price' })).toHaveFocus()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Price' }))
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: 'Any price' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(add).toHaveFocus()
  })
})

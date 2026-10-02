/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SearchIcon } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AeEmptyState,
} from '@/components/ae/feedback/AeEmptyState'
import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'

afterEach(cleanup)

const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
  },
}))

describe('AeEmptyState (W-42)', () => {
  it('frames an optional icon without turning it into a control', () => {
    render(
      <AeEmptyState
        icon={<SearchIcon data-testid="empty-icon" />}
        title="No tools match these filters"
        description="Try a broader search."
      />,
    )

    expect(screen.getByTestId('empty-icon').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'No tools match these filters' })).toBeTruthy()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows a decorative Arc inbox drawing and no invented actions', () => {
    const { container } = render(
      <AeEmptyState title="Nothing here" description="Add your first item." />,
    )

    const illustration = container.querySelector('svg')
    expect(illustration?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(illustration?.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('invokes a recipe and announces its feedback exactly once', () => {
    const onSelect = vi.fn()
    render(
      <AeEmptyState
        title="No calls"
        description="Start from a template."
        actionFeedback="Template applied"
        recipes={[{ id: 'retry', label: 'Retry search', onSelect }]}
      />,
    )

    const recipe = screen.getByRole('button', { name: 'Retry search' })

    fireEvent.click(recipe)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledOnce()
    expect(toastSuccess).toHaveBeenCalledWith('Template applied')
  })

  it('shows financial reassurance with monospace tabular digits', () => {
    render(
      <AeEmptyState
        title="No spend yet"
        description="Charges appear after the first Call."
        financialReassurance="A$0.00 reserved"
      />,
    )

    const reassurance = screen.getByText('A$0.00 reserved')
    expect(reassurance.className).toContain('font-mono')
    expect(reassurance.className).toContain('tabular-nums')
  })
})

describe('AeTableEmptyState (W-42)', () => {
  it('keeps the table empty message and supplied recovery action in one status region', () => {
    const onClear = vi.fn()
    render(
      <AeTableEmptyState title="No rows" description="Try another filter."
        action={<button type="button" onClick={onClear}>Clear filter</button>} />,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain('Try another filter.')
    expect(screen.getByRole('heading', { name: 'No rows' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})

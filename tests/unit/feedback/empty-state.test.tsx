/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SearchIcon } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import {
  AeEmptyState,
  TACTILE,
} from '@/components/ae/feedback/AeEmptyState'
import { AeTableEmptyState } from '@/components/ae/feedback/AeTableEmptyState'

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

  it('reserves illustration and action wells and renders default inbox illustration', () => {
    const { container } = render(
      <AeEmptyState title="Nothing here" description="Add your first item." />,
    )

    expect(container.querySelector('.size-16')).toBeInTheDocument()
    expect(container.querySelector('.min-h-touch')).toBeInTheDocument()
  })

  it('renders tactile recipe chips and fires action feedback toast on select', () => {
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
    for (const token of TACTILE.split(/\s+/u)) {
      expect(recipe.className).toContain(token)
    }

    fireEvent.click(recipe)
    expect(onSelect).toHaveBeenCalledTimes(1)
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
  it('uses a table-scoped well without nesting page min-height', () => {
    const { container } = render(
      <AeTableEmptyState title="No rows" description="Try another filter." />,
    )

    expect(container.querySelector('.min-h-\\[14rem\\]')).toBeInTheDocument()
    expect(container.querySelector('.min-h-64')).toBeNull()
  })
})

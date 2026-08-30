/**
 * @vitest-environment jsdom
 */
import { SearchIcon } from 'lucide-react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'

describe('AeEmptyState', () => {
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
  })
})

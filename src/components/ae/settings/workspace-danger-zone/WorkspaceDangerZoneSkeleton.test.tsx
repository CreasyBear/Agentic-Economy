// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WorkspaceDangerZoneSkeleton } from './WorkspaceDangerZoneSkeleton'

describe('WorkspaceDangerZoneSkeleton', () => {
  it('announces one busy loading region without exposing actions', () => {
    render(<WorkspaceDangerZoneSkeleton />)
    expect(screen.getAllByRole('status', { name: 'Loading workspace actions' })).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Loading workspace actions' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

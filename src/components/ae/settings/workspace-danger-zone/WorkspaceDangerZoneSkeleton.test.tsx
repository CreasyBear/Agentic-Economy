// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { WorkspaceDangerZoneSkeleton } from './WorkspaceDangerZoneSkeleton'

describe('WorkspaceDangerZoneSkeleton', () => {
  it('renders reserved loading shell with skeleton slots', () => {
    const { container } = render(<WorkspaceDangerZoneSkeleton />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })
})

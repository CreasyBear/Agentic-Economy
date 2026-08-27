// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'

afterEach(cleanup)

describe('AeDegradedState', () => {
  it('announces degraded content with alert semantics and recovery action', () => {
    render(
      <AeDegradedState
        title="Recent charges are unavailable"
        description="Try again in a moment."
        action={<button type="button">Try again</button>}
      />,
    )

    const region = screen.getByRole('alert')
    expect(region.textContent).toContain('Recent charges are unavailable')
    expect(screen.getByRole('heading', { level: 2, name: 'Recent charges are unavailable' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})

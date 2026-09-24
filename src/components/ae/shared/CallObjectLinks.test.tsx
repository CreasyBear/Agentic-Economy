/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CallObjectLinks } from './CallObjectLinks'

afterEach(cleanup)

describe('Call object links', () => {
  it('links the exact Tool in an uncertain Call but does not guess a Provider', () => {
    render(<CallObjectLinks view={{ callRef: 'call:v1:uncertain', toolRef: 'tool:v1:weather', provider: { kind: 'absent' } }} />)
    expect(screen.getByRole('link', { name: 'View Tool' })).toHaveAttribute('href', '/tools/tool%3Av1%3Aweather')
    expect(screen.queryByRole('link', { name: /Provider|Host/ })).not.toBeInTheDocument()
  })

  it('links only an explicitly verified Business slug as Provider', () => {
    render(<CallObjectLinks view={{ callRef: 'call:v1:done', toolRef: 'tool:v1:weather', provider: { kind: 'verified_business', slug: 'weather-co', name: 'Weather Co' } }} />)
    expect(screen.getByRole('link', { name: 'View Provider: Weather Co' })).toHaveAttribute('href', '/weather-co')
  })
})

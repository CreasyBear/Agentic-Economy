/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeSiteButton } from '@/components/ae/website'

describe('AeSiteButton', () => {
  it('classes the host control onto the site kit, including the comfort target', () => {
    render(
      <AeSiteButton asChild>
        <a href="/for-agents">Set up an agent</a>
      </AeSiteButton>,
    )

    const link = screen.getByRole('link', { name: 'Set up an agent' })
    expect(link.classList.contains('min-h-touch')).toBe(true)
    expect(link.getAttribute('data-ae-site-button')).toBe('')
    expect(link.getAttribute('data-variant')).toBe('filled')
  })
})

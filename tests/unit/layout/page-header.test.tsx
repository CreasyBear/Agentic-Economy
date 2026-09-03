/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'

describe('AePageHeader', () => {
  it('uses the site eyebrow marker for public page intros', () => {
    render(
      <AePageHeader
        eyebrow="Catalog"
        title="The tool catalog"
        description="Compare exact Operations on price and readiness."
      />,
    )

    expect(screen.getByText('Catalog')).toBeTruthy()
    const heading = screen.getByRole('heading', { level: 1, name: 'The tool catalog' })
    expect(heading.classList.contains('font-display')).toBe(true)
    expect(heading.classList.contains('font-normal')).toBe(true)
    expect(screen.getByText('Compare exact Operations on price and readiness.')).toBeTruthy()
  })

  it('uses the stronger interface face for compact workspaces', () => {
    render(
      <AePageHeader
        variant="workspace"
        eyebrow="Market"
        title="Operation terminal"
        description="Compare price, evidence, and readiness."
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Operation terminal' })
    expect(heading.classList.contains('font-sans')).toBe(true)
    expect(heading.classList.contains('font-bold')).toBe(true)
    expect(heading.classList.contains('font-display')).toBe(false)
  })
})

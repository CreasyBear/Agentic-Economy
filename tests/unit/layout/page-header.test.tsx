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

    const headerSection = screen
      .getByRole('heading', { level: 1, name: 'Operation terminal' })
      .closest('section')
    expect(headerSection?.getAttribute('data-header-profile')).toBe('workspace')

    const heading = screen.getByRole('heading', { level: 1, name: 'Operation terminal' })
    expect(heading.classList.contains('font-sans')).toBe(true)
    expect(heading.classList.contains('font-bold')).toBe(true)
    expect(heading.classList.contains('font-display')).toBe(false)
  })

  it('exposes the editorial header profile for public page intros (default variant)', () => {
    render(
      <AePageHeader
        title="About Agentic Economy"
        description="The commercial boundary for just-in-time service procurement."
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'About Agentic Economy' })
    const section = heading.closest('section')
    expect(section?.getAttribute('data-header-profile')).toBe('editorial')
    expect(section?.className).toMatch(/py-section/)
    expect(section?.className).toMatch(/md:py-page/)
    expect(heading.classList.contains('font-display')).toBe(true)
    expect(heading.classList.contains('font-normal')).toBe(true)
    expect(heading.classList.contains('text-3xl')).toBe(true)
  })

  it('exposes the editorial header profile when variant is page', () => {
    render(
      <AePageHeader
        variant="page"
        title="Editorial page"
        description="Expansive display typography."
      />,
    )

    const section = screen
      .getByRole('heading', { level: 1, name: 'Editorial page' })
      .closest('section')
    expect(section?.getAttribute('data-header-profile')).toBe('editorial')
  })

  it('exposes the market header profile with compact padding and tabular metadata', () => {
    render(
      <AePageHeader
        variant="market"
        title="Tool catalog"
        description="Compare Operations on price and readiness."
        meta="2,412 matching Operations"
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Tool catalog' })
    const section = heading.closest('section')
    expect(section?.getAttribute('data-header-profile')).toBe('market')
    expect(section?.className).toMatch(/py-related/)
    expect(section?.className).toMatch(/sm:py-section/)
    expect(section?.className).not.toMatch(/md:py-page/)

    expect(heading.classList.contains('font-sans')).toBe(true)
    expect(heading.classList.contains('font-semibold')).toBe(true)
    expect(heading.classList.contains('font-display')).toBe(false)

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('2,412 matching Operations')
    expect(status.classList.contains('font-mono')).toBe(true)
    expect(status.classList.contains('tabular-nums')).toBe(true)
    expect(status.classList.contains('text-xs')).toBe(true)
    expect(status.classList.contains('text-muted-foreground')).toBe(true)
  })
})

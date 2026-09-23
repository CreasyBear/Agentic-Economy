/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AeSiteSection } from '@/components/ae/website/AeSiteSection'
import { AeSiteEyebrow, AeSiteHeading } from '@/components/ae/website/AeSiteType'

describe('AePageHeader', () => {
  it('uses a discover eyebrow without a marker for public page intros', () => {
    render(
      <AePageHeader
        eyebrow="Catalog"
        title="The tool catalog"
        description="Compare exact Operations on price and readiness."
      />,
    )

    const eyebrow = screen.getByText('Catalog')
    expect(eyebrow.className).toContain('mb-3')
    expect(eyebrow.className).toContain('block')
    expect(eyebrow.className).toContain('font-eyebrow')
    expect(eyebrow.className).toContain('tracking-eyebrow')

    const heading = screen.getByRole('heading', { level: 1, name: 'The tool catalog' })
    expect(heading.classList.contains('font-display')).toBe(false)
    expect(heading.classList.contains('font-extralight')).toBe(true)
    expect(heading.classList.contains('text-4xl')).toBe(true)
    expect(heading.className).toContain('tracking-[-0.035em]')
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
    expect(heading.classList.contains('font-medium')).toBe(true)
    expect(heading.classList.contains('font-bold')).toBe(false)
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
    expect(section?.className).toMatch(/py-16/)
    expect(section?.className).toMatch(/md:py-24/)
    expect(heading.classList.contains('font-display')).toBe(false)
    expect(heading.classList.contains('font-extralight')).toBe(true)
    expect(heading.classList.contains('text-4xl')).toBe(true)
    expect(heading.className).toContain('md:text-5xl')
    expect(heading.className).toContain('lg:text-6xl')
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

  it('keeps the market profile while using the public type and rhythm canon', () => {
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
    expect(section?.className).toMatch(/py-16/)
    expect(section?.className).toMatch(/md:py-24/)

    expect(heading.classList.contains('font-display')).toBe(false)
    expect(heading.classList.contains('font-extralight')).toBe(true)
    expect(heading.classList.contains('text-4xl')).toBe(true)

    const status = screen.getByRole('status')
    expect(status.textContent).toBe('2,412 matching Operations')
    expect(status.classList.contains('font-mono')).toBe(true)
    expect(status.classList.contains('tabular-nums')).toBe(true)
    expect(status.classList.contains('text-xs')).toBe(true)
    expect(status.classList.contains('text-muted-foreground')).toBe(true)
  })
})

describe('AeSite type and rhythm primitives', () => {
  it('emits the marketing heading, eyebrow, and section canon', () => {
    render(
      <>
        <AeSiteHeading as="h1" size="lg">Hero heading</AeSiteHeading>
        <AeSiteHeading as="h2" size="md">Section heading</AeSiteHeading>
        <AeSiteEyebrow>Section label</AeSiteEyebrow>
        <AeSiteSection ariaLabel="Canonical section">Body</AeSiteSection>
      </>,
    )

    const hero = screen.getByRole('heading', { level: 1, name: 'Hero heading' })
    expect(hero.className).toContain('text-4xl')
    expect(hero.className).toContain('md:text-5xl')
    expect(hero.className).toContain('lg:text-6xl')
    expect(hero.className).toContain('tracking-[-0.035em]')

    const sectionHeading = screen.getByRole('heading', { level: 2, name: 'Section heading' })
    expect(sectionHeading.className).toContain('text-4xl')
    expect(sectionHeading.className).toContain('tracking-[-0.035em]')
    expect(sectionHeading.className).not.toContain('lg:text-5xl')

    const eyebrow = screen.getByText('Section label')
    expect(eyebrow.className).toContain('text-eyebrow')
    expect(eyebrow.className).toContain('font-eyebrow')
    expect(eyebrow.className).toContain('tracking-eyebrow')
    expect(eyebrow.className).toContain('uppercase')
    expect(eyebrow.className).toContain('mb-3')
    expect(eyebrow.className).toContain('block')

    const section = screen.getByRole('region', { name: 'Canonical section' })
    expect(section.className).toContain('py-16')
    expect(section.className).toContain('md:py-24')
  })
})

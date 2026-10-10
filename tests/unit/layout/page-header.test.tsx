/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AeSiteSection } from '@/components/ae/website/AeSiteSection'
import { AeSiteEyebrow, AeSiteHeading } from '@/components/ae/website/AeSiteType'

afterEach(cleanup)

describe('AePageHeader', () => {
  it('names its region with one title and retains the factual context and description', () => {
    render(<AePageHeader eyebrow="Catalog" title="The tool catalog"
      description="Compare exact Operations on price and readiness." />)
    const heading = screen.getByRole('heading', { level: 1, name: 'The tool catalog' })
    const region = screen.getByRole('region', { name: 'The tool catalog' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(region.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(document.getElementById(region.getAttribute('aria-describedby')! as string)?.textContent)
      .toBe('Compare exact Operations on price and readiness.')
    expect(screen.getByText('Catalog')).toBeTruthy()
  })

  it.each([
    ['workspace', 'workspace'], ['page', 'editorial'], ['market', 'market'],
  ] as const)('preserves the %s layout profile', (variant, profile) => {
    render(<AePageHeader variant={variant} title="Tool catalog" description="One bounded result." />)
    expect(screen.getByRole('region', { name: 'Tool catalog' }).getAttribute('data-header-profile')).toBe(profile)
  })

  it('retains live counts and invokes the supplied action', () => {
    const onAction = vi.fn()
    render(<AePageHeader variant="market" title="Tool catalog" description="Compare Operations."
      meta="2,412 matching Operations" actions={<button type="button" onClick={onAction}>Compare</button>} />)
    expect(screen.getByRole('status').textContent).toBe('2,412 matching Operations')
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite')
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('focuses the committed title when requested, including a new title on the same instance', () => {
    const view = render(<AePageHeader focusTitle title="Privacy" description="Privacy details." />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Privacy' }))
    view.rerender(<AePageHeader focusTitle title="Terms" description="Terms details." />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Terms' }))
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
    expect(eyebrow.className).toContain('text-body')
    expect(eyebrow.className).toContain('font-medium')
    expect(eyebrow.className).toContain('uppercase')
    expect(eyebrow.className).toContain('mb-3')
    expect(eyebrow.className).toContain('block')

    const section = screen.getByRole('region', { name: 'Canonical section' })
    expect(section.className).toContain('py-16')
    expect(section.className).toContain('md:py-24')
  })
})

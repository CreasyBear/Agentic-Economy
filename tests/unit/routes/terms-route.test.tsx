/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeTermsPage } from '@/components/ae/legal/terms/AeTermsPage'
import { termsLastUpdated, termsSections, termsTitle } from '@/components/ae/legal/terms/terms.contracts'
import { AeSiteUtilityDocument } from '@/components/ae/website/AeSiteUtilityDocument'
import { utilityDocumentNavigation } from '@/components/ae/website/utility-document.contracts'

afterEach(cleanup)

describe('Terms page', () => {
  it('shows the terms version and links every contents entry to its section', () => {
    render(<AeTermsPage />)

    expect(screen.getByRole('heading', { level: 2, name: '1. Scope and agreement' })).toBeTruthy()
    expect(screen.getByText(/Version 2026-10-11/u)).toBeTruthy()
    expect(screen.getByText(/draws it only after verified settlement and a successful HTTP response/u)).toBeTruthy()
    expect(screen.getByText(/does not revive expired promotional credits/u)).toBeTruthy()
    expect(screen.getByText(/Business customers may also have statutory protections/u)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Trust centre' }).some(link => link.getAttribute('href') === '/trust')).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: termsTitle })).toBeTruthy()
    expect(screen.getByText(`Legal · Last updated ${termsLastUpdated} · Version 2026-10-11`)).toBeTruthy()
    for (const [index, section] of termsSections.entries()) {
      const region = screen.getByRole('region', { name: `${index + 1}. ${section.heading}` })
      expect(Array.from(region.querySelectorAll('p'), (p) => p.textContent)).toEqual(section.body)
    }

    const contents = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(contents).getAllByRole('link')
    expect(links).toHaveLength(15)
    for (const link of links) {
      const href = link.getAttribute('href')
      expect(href?.startsWith('#')).toBe(true)
      expect(document.getElementById(href?.slice(1) ?? '')).toBeTruthy()
    }
  })

  it('controls only the reading index and keeps the legal body present', () => {
    render(<AeTermsPage />)
    const toggle = screen.getByRole('button', { name: 'On this page' })
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(panel).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel?.getAttribute('data-open')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel?.getAttribute('data-open')).toBe('true')
    fireEvent.click(within(panel!).getAllByRole('link')[0]!)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel?.getAttribute('data-open')).toBe('false')
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(termsSections.length)
  })

  it('preserves optional document content and native company destinations', () => {
    const { container, rerender } = render(
      <AeSiteUtilityDocument title="Published record" lastUpdated="2 October 2026" version="3"
        description="Current published description" className="caller-document"
        sections={[{ id: 'known-section', heading: 'Known section', body: ['First paragraph', 'Second paragraph'] }]}
        intro={<p>Original opening</p>} footer={<p>Original ending</p>} />,
    )
    expect(container.querySelector('.caller-document')).toBeTruthy()
    expect(screen.getByText('Legal · Last updated 2 October 2026 · Version 3')).toBeTruthy()
    expect(screen.getByText('Original opening')).toBeTruthy()
    expect(screen.getByText('Original ending')).toBeTruthy()
    expect(document.getElementById('known-section')?.getAttribute('tabindex')).toBe('-1')
    const company = screen.getByRole('navigation', { name: 'Company and website' })
    expect(within(company).getAllByRole('link').map((link) => link.getAttribute('href')))
      .toEqual(utilityDocumentNavigation.map((item) => item.to))
    rerender(<AeSiteUtilityDocument title="Published record" lastUpdated="2 October 2026" sections={[]} />)
    expect(screen.queryByText('Original opening')).toBeNull()
    expect(screen.queryByText('Original ending')).toBeNull()
    expect(screen.queryByText('Current published description')).toBeNull()
    expect(screen.getByText('Legal · Last updated 2 October 2026')).toBeTruthy()
  })
})

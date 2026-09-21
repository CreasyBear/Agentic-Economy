/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeTermsPage } from '@/components/ae/legal/terms/AeTermsPage'

describe('Terms page', () => {
  it('links its table of contents to existing sections and uses Provider vocabulary', () => {
    render(<AeTermsPage />)

    expect(screen.getByText('Search the catalogue by capability, category, Provider, or task.')).toBeTruthy()

    const contents = screen.getByRole('navigation', { name: 'Terms sections' })
    const links = within(contents).getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      const href = link.getAttribute('href')
      expect(href?.startsWith('#')).toBe(true)
      expect(document.getElementById(href?.slice(1) ?? '')).toBeTruthy()
    }
  })
})

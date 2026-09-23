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
  it('renders the published terms and links every contents entry to its section', () => {
    render(<AeTermsPage />)

    expect(screen.getByRole('heading', { level: 2, name: '1. Scope and agreement' })).toBeTruthy()

    const contents = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(contents).getAllByRole('link')
    expect(links).toHaveLength(15)
    for (const link of links) {
      const href = link.getAttribute('href')
      expect(href?.startsWith('#')).toBe(true)
      expect(document.getElementById(href?.slice(1) ?? '')).toBeTruthy()
    }
  })
})

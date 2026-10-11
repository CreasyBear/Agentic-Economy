/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeTrustPage } from '@/components/ae/legal/trust/AeTrustPage'

afterEach(cleanup)

describe('Trust centre', () => {
  it('offers seven linked topics and discloses the pre-payment release of Tool inputs', () => {
    render(<AeTrustPage />)
    expect(screen.getByText(/Version 2026-10-11/u)).toBeInTheDocument()
    const contents = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(contents).getAllByRole('link')
    expect(links).toHaveLength(7)
    for (const link of links) {
      const href = link.getAttribute('href')
      expect(href).toMatch(/^#[a-z-]+$/u)
      expect(document.getElementById(href?.slice(1) ?? '')).toBeInTheDocument()
    }
    expect(screen.getByText(/actual inputs to the selected Tool Provider before payment/u)).toBeInTheDocument()
    for (const [name, href] of [['Terms', '/terms'], ['Privacy policy', '/privacy'], ['Support', '/support'], ['Status', '/status']] as const) {
      expect(screen.getAllByRole('link', { name }).some(link => link.getAttribute('href') === href)).toBe(true)
    }
  })
})

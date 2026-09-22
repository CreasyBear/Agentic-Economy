/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
  }: {
    children: ReactNode
    to: string
  }) => <a href={to}>{children}</a>,
}))

afterEach(cleanup)

describe('AePublicPage', () => {
  it('lets editorial pages own their intro', () => {
    render(
      <AePublicPage>
        <h1>Ask a question</h1>
      </AePublicPage>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Ask a question' })).toBeTruthy()
    expect(screen.queryByText('Catalog')).toBeNull()
  })

  it('renders the shared tool intro so record pages cannot invent a third header', () => {
    render(
      <AePublicPage
        kind="document"
        eyebrow="Legal"
        title="Privacy"
        description="What the market handles when you browse, call, pay for, or publish Operations."
      >
        <p>Document body</p>
      </AePublicPage>,
    )

    const main = within(screen.getByRole('main'))
    expect(main.getByText('Legal')).toBeTruthy()
    expect(main.getByRole('heading', { level: 1, name: 'Privacy' })).toBeTruthy()
    expect(main.getByText('Document body')).toBeTruthy()
  })

  it('mounts one responsive footer with the canonical public link groups', () => {
    render(
      <AePublicPage>
        <h1>About</h1>
      </AePublicPage>,
    )

    const footer = screen.getByRole('contentinfo')
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
    expect(
      within(footer).getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Resources links', 'Help links', 'Legal links', 'Machines links'])
    for (const [label, href] of [
      ['API reference', '/developers/api'],
      ['Support', '/support'],
      ['Status', '/status'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Remove a listing', '/privacy/remove-business'],
      ['llms.txt', '/llms.txt'],
      ['SKILL.md', '/SKILL.md'],
      ['.well-known/ucp', '/.well-known/ucp'],
      ['glossary.md', '/glossary.md'],
    ] as const) {
      expect(
        within(footer).getAllByRole('link', { name: label })
          .every((link) => link.getAttribute('href') === href),
      ).toBe(true)
    }
  })

  it('promotes a workspace to the outer shell instead of nesting it in a document page', () => {
    render(
      <AePublicPage
        kind="workspace"
        eyebrow="Operation"
        title="Invoice extraction"
        description="One bounded result."
      >
        <p>Workspace panes</p>
      </AePublicPage>,
    )

    expect(document.querySelector('[data-shell-mode="workspace"]')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Invoice extraction' })).toBeTruthy()
    expect(screen.getByText('Workspace panes')).toBeTruthy()
  })
})

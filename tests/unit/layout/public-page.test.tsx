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
    reloadDocument,
  }: {
    children: ReactNode
    to: string
    reloadDocument?: boolean
  }) => <a href={to} data-reload-document={reloadDocument ? 'true' : undefined}>{children}</a>,
  useRouter: () => ({
    navigate: vi.fn(),
    preloadRoute: vi.fn().mockResolvedValue(undefined),
  }),
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
    const navigation = within(footer).getByRole('navigation', { name: 'Footer' })
    expect(['Resources', 'Help', 'Legal', 'Machines'].map(name =>
      within(navigation).getByRole('region', { name }).querySelector('h2')?.textContent,
    )).toEqual(['Resources', 'Help', 'Legal', 'Machines'])
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
      const link = within(navigation).getByRole('link', { name: label })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('data-reload-document')).toBe(
        ['llms.txt', 'SKILL.md', '.well-known/ucp', 'glossary.md'].includes(label) ? 'true' : null,
      )
    }
  })

  it('keeps public business identity and social destinations without invented status or signup controls', () => {
    render(<AePublicPage><h1>About</h1></AePublicPage>)
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'ABN 98 700 838 115' }).getAttribute('href')).toBe('https://abr.business.gov.au/ABN/View?abn=98700838115')
    const socials = within(footer.getByRole('navigation', { name: 'Follow Agentic Economy' }))
    expect(socials.getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toBe('https://www.linkedin.com/company/aecon-ai/')
    expect(socials.getByRole('link', { name: 'X' }).getAttribute('href')).toBe('https://x.com/Aeconai')
    expect(socials.getByRole('link', { name: 'Facebook' }).getAttribute('href')).toBe('https://www.facebook.com/profile.php?id=61594070258261')
    expect(footer.queryByRole('textbox')).toBeNull()
    expect(footer.queryByText('All systems normal')).toBeNull()
  })

  it('omits only the optional closer while keeping the footer navigation', () => {
    const view = render(<AePublicPage><h1>About</h1></AePublicPage>)
    expect(screen.getByRole('region', { name: 'Take control of your Agentic future' })).toBeTruthy()
    view.rerender(<AePublicPage hideFooterCloser><h1>About</h1></AePublicPage>)
    expect(screen.queryByRole('region', { name: 'Take control of your Agentic future' })).toBeNull()
    expect(within(screen.getByRole('contentinfo')).getByRole('navigation', { name: 'Footer' })).toBeTruthy()
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

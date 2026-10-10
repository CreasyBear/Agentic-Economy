/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'

const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  preloadRoute: vi.fn().mockResolvedValue(undefined),
}))

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
  useRouter: () => router,
  useLocation: () => ({ pathname: '/' }),
}))

afterEach(() => {
  cleanup()
  router.navigate.mockClear()
  router.preloadRoute.mockClear()
})


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
    expect(['Product', 'Company', 'For agents'].map(name =>
      within(navigation).getByRole('heading', { level: 2, name }).textContent,
    )).toEqual(['Product', 'Company', 'For agents'])
    const legal = within(within(footer).getByRole('list', { name: 'Legal' }))
    for (const [label, href] of [
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Remove a listing', '/privacy/remove-business'],
    ] as const) {
      expect(legal.getByRole('link', { name: label }).getAttribute('href')).toBe(href)
    }
    for (const [label, href] of [
      ['Docs', '/developers/api'],
      ['Support', '/support'],
      ['Status', '/status'],
      ['llms.txt', '/llms.txt'],
      ['SKILL.md', '/SKILL.md'],
      ['.well-known/ucp', '/.well-known/ucp'],
      ['glossary.md', '/glossary.md'],
    ] as const) {
      expect(within(navigation).getByRole('link', { name: label }).getAttribute('href')).toBe(href)
    }

    fireEvent.click(within(navigation).getByRole('link', { name: 'Support' }))
    expect(router.navigate).toHaveBeenCalledWith({ href: '/support' })
    router.navigate.mockClear()

    for (const label of ['llms.txt', 'SKILL.md', '.well-known/ucp', 'glossary.md']) {
      const link = within(navigation).getByRole('link', { name: label })
      let interceptedByRouter = false
      const observeDocumentNavigation = (event: MouseEvent) => {
        if (event.target !== link) return
        interceptedByRouter = event.defaultPrevented
        event.preventDefault()
      }
      document.addEventListener('click', observeDocumentNavigation)
      try {
        fireEvent.click(link)
      } finally {
        document.removeEventListener('click', observeDocumentNavigation)
      }
      expect(interceptedByRouter).toBe(false)
    }
    expect(router.navigate).not.toHaveBeenCalled()
  })
  it('keeps public business identity and social destinations without invented status or signup controls', () => {
    render(<AePublicPage><h1>About</h1></AePublicPage>)
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'ABN 98 700 838 115' }).getAttribute('href')).toBe('https://abr.business.gov.au/ABN/View?abn=98700838115')
    const socials = footer.getByRole('list', { name: 'Social' })
    expect(within(socials).getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toBe('https://www.linkedin.com/company/aecon-ai/')
    expect(within(socials).getByRole('link', { name: 'X' }).getAttribute('href')).toBe('https://x.com/Aeconai')
    expect(within(socials).getByRole('link', { name: 'Facebook' }).getAttribute('href')).toBe('https://www.facebook.com/profile.php?id=61594070258261')
    expect(footer.queryByRole('textbox')).toBeNull()
    expect(footer.queryByText('All systems normal')).toBeNull()
  })

  it('renders the one site footer with the header destinations, and none on minimal pages', () => {
    const view = render(<AePublicPage><h1>About</h1></AePublicPage>)
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'Tools' }).getAttribute('href')).toBe('/market')
    expect(footer.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('/developers/api')
    expect(footer.getByRole('link', { name: 'For providers' }).getAttribute('href')).toBe('/for-providers')
    view.rerender(<AePublicPage footer="none"><h1>Sign in</h1></AePublicPage>)
    expect(screen.queryByRole('contentinfo')).toBeNull()
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

/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'

vi.mock('@tanstack/react-router', () => {
  function footerRoute(
    to: string,
    label: string,
    column: string,
    order: number,
    hasComponent = true,
  ) {
    return {
      to,
      options: {
        staticData: { nav: { label, footer: { column, order } } },
        ...(hasComponent ? { component: () => null } : {}),
      },
    }
  }

  return {
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useRouter: () => ({
      routesByPath: {
        '/developers/api': footerRoute('/developers/api', 'API reference', 'Resources', 0),
        '/support': footerRoute('/support', 'Help', 'Help', 0),
        '/status': footerRoute('/status', 'System status', 'Help', 1),
        '/privacy': footerRoute('/privacy', 'Privacy', 'Legal', 0),
        '/terms': footerRoute('/terms', 'Terms', 'Legal', 1),
        '/privacy/remove-business': footerRoute('/privacy/remove-business', 'Remove a listing', 'Legal', 2),
        '/llms.txt': footerRoute('/llms.txt', 'llms.txt', 'Machines', 0, false),
        '/SKILL.md': footerRoute('/SKILL.md', 'SKILL.md', 'Machines', 1, false),
        '/.well-known/ucp': footerRoute('/.well-known/ucp', '.well-known/ucp', 'Machines', 2, false),
        '/glossary.md': footerRoute('/glossary.md', 'glossary.md', 'Machines', 3, false),
      },
    }),
  }
})

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

  it('mounts one responsive footer with the real public link groups', () => {
    render(
      <AePublicPage>
        <h1>About</h1>
      </AePublicPage>,
    )

    const footer = screen.getByRole('contentinfo')
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
    for (const group of ['Resources', 'Help', 'Legal', 'Machines']) {
      expect(within(footer).getByRole('button', { name: `${group} links` })).toBeTruthy()
    }
    for (const label of [
      'API reference',
      'Help',
      'System status',
      'Privacy',
      'Terms',
      'Remove a listing',
      'llms.txt',
      'SKILL.md',
      '.well-known/ucp',
      'glossary.md',
    ]) {
      expect(footer.textContent).toContain(label)
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

/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import actionLinkStyles from '@/components/ae/shared/action-link/action-link.module.css'

const routeState = vi.hoisted(() => ({
  components: new Map<string, ComponentType>(),
  location: { pathname: '/privacy' },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => {
    routeState.components.set(path, options.component)
    return {
      ...options,
      options,
      useSearch: () => ({}),
      useLoaderData: () => path === '/'
        ? { read: { kind: 'ok', tools: [], matchedCount: 0 }, canonicalBaseUrl: 'https://ae.example' }
        : path === '/about'
          ? 'https://ae.example'
          : undefined,
      useNavigate: () => vi.fn(),
    }
  },
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  linkOptions: <T,>(options: T): T => options,
  redirect: vi.fn(),
  useLocation: () => routeState.location,
  useNavigate: () => vi.fn(),
  // AePublicPage renders AePublicSiteFooter, which reads the route table via
  // useRouter(); an empty table is enough to render its (empty) columns.
  useRouter: () => ({ routesByPath: {} }),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}))

import { ABOUT } from '@/content/brand-copy'
import '@/routes/privacy'
import '@/routes/terms'
import '@/routes/about'

afterEach(cleanup)

describe('public semantic comfort', () => {
  it('keeps the Terms outline sequential and its standalone rail actions comfortable', () => {
    renderRoute('/terms')

    const article = screen.getByRole('article')
    const headings = within(article).getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H1', ...Array(15).fill('H2')])
    const contents = within(article).getByRole('navigation', { name: 'On this page' })
    for (const link of within(contents).getAllByRole('link')) {
      expect(document.querySelector(link.getAttribute('href') ?? '')).toBeTruthy()
    }
    const company = screen.getByRole('navigation', { name: 'Company and website' })
    for (const link of within(company).getAllByRole('link')) {
      expect(link.classList.contains('arc-document-company-link')).toBe(true)
    }
    expect(within(article).getByText(/an authorised Agent acts for that Customer/)).toBeTruthy()
    expect(within(article).getByText(/which Tools it may use/)).toBeTruthy()
    expect(within(article).getByText(/AE supplies its routing service to the Customer as principal/)).toBeTruthy()
    expect(within(article).getByText(/available Provider or endpoint identity/)).toBeTruthy()
    expect(within(article).queryByText(/supplying party/)).toBeNull()
    expect(within(article).queryByText(/paid request/)).toBeNull()
  })

  it('keeps the Privacy outline sequential with working contents and correction links', () => {
    routeState.location = { pathname: '/privacy' }
    renderRoute('/privacy')

    const article = screen.getByRole('article')
    const headings = within(article).getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H1', ...Array(16).fill('H2')])
    const contents = within(article).getByRole('navigation', { name: 'On this page' })
    for (const link of within(contents).getAllByRole('link')) {
      expect(document.querySelector(link.getAttribute('href') ?? '')).toBeTruthy()
    }
    expect(within(article).getByRole('link', { name: 'Request a correction or removal' }).getAttribute('href'))
      .toBe('/privacy/remove-business')
    expect(within(article).getByRole('link', { name: 'Contact Support about your data' }).getAttribute('href'))
      .toBe('/support')
    expect(within(article).queryByText(/Analytics preferences in the footer/)).toBeNull()
  })

  it('keeps About sequential and its actions comfortable', () => {
    renderRoute('/about')
    const about = within(screen.getByRole('main'))

    expect(screen.getByRole('heading', { level: 1, name: 'Tools agents can call.' })).toBeTruthy()
    expect(
      screen.getByText('Agents buy Tools. Providers set prices and receive AUD payouts after completed Calls.'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.editorialTitle })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.featuresHeading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.ctaHeading })).toBeTruthy()
    const cta = about.getByRole('region', { name: ABOUT.ctaHeading })
    const primaryCta = within(cta).getByRole('link', { name: ABOUT.ctaPrimary })
    expect(Array.from(primaryCta.classList)).toContain(actionLinkStyles.primary)
    expect(Array.from(primaryCta.classList)).toContain(actionLinkStyles.md)
    expect(primaryCta.getAttribute('href')).toBe('/market')
    expect(within(cta).queryByRole('link', { name: 'Add Tool' })).toBeNull()
    expect(about.queryByRole('link', { name: 'Add Tool' })).toBeNull()
    expect(
      about.getByRole('link', { name: 'ABN 98 700 838 115 (opens in a new tab)' }).getAttribute('href'),
    ).toBe('https://abr.business.gov.au/ABN/View?abn=98700838115')
    expect(about.getByRole('link', { name: 'support@aecon.ai' }).getAttribute('href'))
      .toBe('mailto:support@aecon.ai')
  })

})

function renderRoute(path: '/privacy' | '/terms' | '/about') {
  const Component = routeState.components.get(path)
  if (Component === undefined) throw new Error(`Route component ${path} was not captured.`)
  render(<Component />)
}

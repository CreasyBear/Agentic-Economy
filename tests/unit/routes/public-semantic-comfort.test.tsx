/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

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
  // AePublicPage renders AeSiteFooter, which reads the route table via
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
      expect(link.classList.contains('min-h-touch')).toBe(true)
    }
  })

  it('keeps the Privacy outline sequential with working contents and correction links', () => {
    routeState.location = { pathname: '/privacy' }
    renderRoute('/privacy')

    const article = screen.getByRole('article')
    const headings = within(article).getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H1', ...Array(15).fill('H2')])
    const contents = within(article).getByRole('navigation', { name: 'On this page' })
    for (const link of within(contents).getAllByRole('link')) {
      expect(document.querySelector(link.getAttribute('href') ?? '')).toBeTruthy()
    }
    expect(within(article).getByRole('link', { name: 'Request a correction or removal' }).getAttribute('href'))
      .toBe('/privacy/remove-business')
  })

  it('keeps About sequential and its actions comfortable', () => {
    renderRoute('/about')

    expect(screen.getByRole('heading', { level: 1, name: 'Tools agents can call.' })).toBeTruthy()
    expect(
      screen.getByText('Agents buy Tools. Providers set prices and receive AUD payouts after completed Calls.'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.editorialTitle })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.featuresHeading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.ctaHeading })).toBeTruthy()
    expect(screen.getByRole('link', { name: ABOUT.ctaPrimary }).classList.contains('h-12')).toBe(true)
  })

})

function renderRoute(path: '/privacy' | '/terms' | '/about') {
  const Component = routeState.components.get(path)
  if (Component === undefined) throw new Error(`Route component ${path} was not captured.`)
  render(<Component />)
}

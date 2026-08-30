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
        ? { read: { kind: 'ok', operations: [], matchedCount: 0 }, canonicalBaseUrl: 'https://ae.example' }
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
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

import { ABOUT, HOME } from '@/content/brand-copy'
import '@/routes/index'
import '@/routes/privacy'
import '@/routes/terms'
import '@/routes/about'

afterEach(cleanup)

describe('public semantic comfort', () => {
  it('keeps the Terms outline sequential and its standalone actions comfortable', () => {
    renderRoute('/terms')

    const headings = screen.getAllByRole('heading')
    expect(headings.map((heading) => heading.tagName)).toEqual(['H1', 'H2', 'H3', 'H3', 'H3'])
    expect(screen.getByRole('heading', { level: 2, name: 'What these terms mean in practice' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse catalog' }).classList.contains('min-h-touch')).toBe(true)
    expect(screen.getByRole('link', { name: /Publish an Operation/ }).classList.contains('min-h-touch')).toBe(true)
  })

  it('gives every privacy tab a comfortable standalone target', () => {
    routeState.location = { pathname: '/privacy' }
    renderRoute('/privacy')

    const tablist = screen.getByRole('tablist', { name: 'Privacy moments' })
    expect(tablist.classList.contains('min-h-touch')).toBe(true)
    for (const tab of within(tablist).getAllByRole('tab')) {
      expect(tab.classList.contains('min-h-touch')).toBe(true)
    }
  })

  it('gives homepage actions a comfortable standalone target', () => {
    renderRoute('/')

    for (const name of ['Browse Operations', 'Publish an Operation'] as const) {
      const links = screen.getAllByRole('link', { name })
      expect(links.length).toBeGreaterThan(0)
      for (const link of links) expect(link.classList.contains('min-h-touch')).toBe(true)
    }
    expect(screen.getByRole('link', { name: HOME.aboutLink }).classList.contains('min-h-touch')).toBe(true)
  })

  it('keeps About sequential and its door actions comfortable', () => {
    renderRoute('/about')

    expect(screen.getByRole('heading', { level: 1, name: ABOUT.heading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.doorsHeading })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: ABOUT.suppliersHeading })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse the live catalog' }).classList.contains('min-h-touch')).toBe(true)
    const machines = screen.getByRole('navigation', { name: 'Machine-readable files' })
    expect(within(machines).getByRole('link', { name: /llms\.txt/ }).getAttribute('href')).toBe('/llms.txt')
    expect(within(machines).getByRole('link', { name: /SKILL\.md/ }).getAttribute('href')).toBe('/SKILL.md')
    expect(within(machines).getByRole('link', { name: /well-known\/ucp/ }).getAttribute('href')).toBe('/.well-known/ucp')
  })

})

function renderRoute(path: '/' | '/privacy' | '/terms' | '/about') {
  const Component = routeState.components.get(path)
  if (Component === undefined) throw new Error(`Route component ${path} was not captured.`)
  render(<Component />)
}

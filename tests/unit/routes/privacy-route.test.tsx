/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({
  component: undefined as ComponentType | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.component = options.component
    return { ...options, options }
  },
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  Outlet: () => null,
  useLocation: () => ({ pathname: '/privacy' }),
  useRouter: () => ({ routesByPath: {} }),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn, validator: () => ({ handler: (fn: unknown) => fn }) }),
}))

import '@/routes/privacy'

afterEach(cleanup)

describe('privacy route', () => {
  it('renders the alpha privacy draft, links its contents, and offers correction or removal', () => {
    const Component = routeState.component
    if (Component === undefined) throw new Error('privacy_route_component_missing')

    render(<Component />)

    expect(screen.getByText('How Agentic Economy collects and uses data.')).toBeTruthy()
    expect(screen.getByText(/Alpha draft for review/u)).toBeTruthy()
    expect(screen.getByText(/retention schedule are required before publication/u)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '1. Who this policy covers' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Request a correction or removal' }).getAttribute('href'))
      .toBe('/privacy/remove-business')

    const contents = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(contents).getAllByRole('link')
    expect(links).toHaveLength(15)
    for (const link of links) {
      const href = link.getAttribute('href')
      expect(href).toMatch(/^#[a-z-]+$/)
      expect(document.querySelector(href!)).toBeTruthy()
    }
  })
})

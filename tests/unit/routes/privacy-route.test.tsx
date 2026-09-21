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
  it('explains data use and links every contents entry to an on-page section', () => {
    const Component = routeState.component
    if (Component === undefined) throw new Error('privacy_route_component_missing')

    render(<Component />)

    expect(screen.getByText('How Agentic Economy collects and uses data.')).toBeTruthy()

    const contents = screen.getByRole('navigation', { name: 'Privacy sections' })
    for (const link of within(contents).getAllByRole('link')) {
      const href = link.getAttribute('href')
      expect(href).toMatch(/^#[a-z-]+$/)
      expect(document.querySelector(href!)).toBeTruthy()
    }
  })
})

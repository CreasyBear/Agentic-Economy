/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

const clerkSignedIn = vi.hoisted(() => ({ value: false }))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: clerkSignedIn.value }),
  Show: ({ when, children, fallback }: { when: string; children?: ReactNode; fallback?: ReactNode }) => {
    if (when === 'signed-out') return clerkSignedIn.value ? (fallback ?? null) : (children ?? null)
    if (when === 'signed-in') return clerkSignedIn.value ? (children ?? null) : null
    return children ?? null
  },
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
}))

afterEach(cleanup)

describe('AeAppShell', () => {
  it('renders exactly one persistent app header with the skip link and public primary nav', () => {
    clerkSignedIn.value = false
    renderAppShell()

    expect(document.querySelectorAll('[data-shell="app-header"]')).toHaveLength(1)
    expect(screen.getByTestId('skip-to-content').getAttribute('href')).toBe('#main-content')

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(['Market', 'For agents', 'For providers']).toEqual(
      Array.from(nav.querySelectorAll('a')).map((link) => link.textContent),
    )
    expect(screen.getByRole('link', { name: 'Sign in' }).className).toMatch(/md:inline-flex/)
  })

  it('renders the canonical sidebar and no destination row when signed in', () => {
    clerkSignedIn.value = true
    renderAppShell()

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    const nav = screen.getByRole('navigation', { name: 'App navigation' })
    expect(Array.from(nav.querySelectorAll('a')).map((link) => link.textContent)).toEqual([
      'Market',
      'Agents',
      'Calls',
      'Credit',
      'Tools',
      'Earnings',
      'Settings',
      'Support',
      'Status',
    ])
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByTestId('org-switcher')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('shows admin destinations in mobile navigation on admin routes', () => {
    clerkSignedIn.value = true
    renderAppShell('/admin/index-health')

    const nav = screen.getByRole('navigation', { name: 'Admin primary navigation' })
    expect(Array.from(nav.querySelectorAll('a')).map(link => link.textContent)).toEqual([
      'Catalog health',
      'Audit',
    ])
  })
})

function renderAppShell(pathname = clerkSignedIn.value ? '/market' : '/'): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', header: { order: 0, audience: 'always' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-agents',
      staticData: { nav: { label: 'For agents', header: { order: 1, audience: 'public' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-providers',
      staticData: { nav: { label: 'For providers', header: { order: 2, audience: 'public' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/activity',
      staticData: { nav: { label: 'Calls', header: { order: 2, audience: 'signed-in' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent-access',
      staticData: { nav: { label: 'Agents', header: { order: 1, audience: 'signed-in' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations',
      staticData: { nav: { label: 'Tools', header: { order: 3, audience: 'signed-in' } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/index-health' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/audit-events' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeAppShell><p>Page content</p></AeAppShell>
    </RouterContextProvider>,
  )
}

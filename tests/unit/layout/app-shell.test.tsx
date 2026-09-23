/**
 * @vitest-environment jsdom
 */
import { getFunctionName, type FunctionReference } from 'convex/server'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

import type { OperatorSurface } from '@/lib/operator/operator-context'
import { AeAppShell } from '@/components/ae/layout/AeAppShell'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

const clerkSignedIn = vi.hoisted(() => ({ value: false }))
const entitlement = vi.hoisted<{
  isAuthenticated: boolean
  result: { kind: 'authorized'; allowedSurfaces: readonly OperatorSurface[] } | { kind: 'denied' } | undefined
}>(() => ({
  isAuthenticated: false,
  result: undefined,
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: entitlement.isAuthenticated }),
  useQuery: (query: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    if (getFunctionName(query) !== 'operatorContext:readCurrent') throw new Error('Unexpected query')
    return entitlement.result
  },
}))

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

afterEach(() => {
  cleanup()
  entitlement.isAuthenticated = false
  entitlement.result = undefined
})

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
    expect(screen.queryByRole('button', { name: 'Workspace menu' })).toBeNull()
  })

  it('opens workspace destinations from the header menu when signed in', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    renderAppShell()

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
    const menu = screen.getByRole('menu')
    expect(Array.from(menu.querySelectorAll('a')).map((link) => link.textContent)).toEqual([
      'Market',
      'Chat',
      'Agents',
      'Calls',
      'Credit',
      'Tools',
      'Earnings',
      'Settings',
      'Support',
      'Status',
    ])
    expect(within(menu).getByRole('menuitem', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByTestId('org-switcher')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('shows one Admin group on an owner page for an active admin session', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = { kind: 'authorized', allowedSurfaces: ['owner', 'admin'] }
    renderAppShell('/owner/operations')

    fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByText('Admin')).toHaveLength(1)
    expect(['Overview', 'Search', 'Exceptions', 'Providers', 'Metrics', 'Audit'].map(label =>
      within(menu).getByRole('menuitem', { name: label }).textContent
    )).toEqual(['Overview', 'Search', 'Exceptions', 'Providers', 'Metrics', 'Audit'])
    expect(within(screen.getByRole('navigation', { name: 'Owner primary navigation' })).queryByRole('link', { name: 'Admin' })).toBeNull()
  })

  it('shows Admin navigation with the longest route active for an entitled session', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = { kind: 'authorized', allowedSurfaces: ['owner', 'admin'] }
    renderAppShell('/admin/metrics')

    const nav = screen.getByRole('navigation', { name: 'Admin primary navigation' })
    expect(Array.from(nav.querySelectorAll('a')).map(link => link.textContent)).toEqual([
      'Home', 'Search', 'Queue', 'Providers', 'Metrics', 'Audit',
    ])
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Metrics' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByText('Admin')).toHaveLength(1)
    expect(within(menu).getByRole('menuitem', { name: 'Metrics' }).getAttribute('aria-current')).toBe('page')
    expect(within(menu).getByRole('menuitem', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
  })

  it('keeps Developer navigation alongside one Admin group for an entitled developer path', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = { kind: 'authorized', allowedSurfaces: ['owner', 'admin', 'developer'] }
    renderAppShell('/developers/discovery')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByText('Admin')).toHaveLength(1)
    expect(within(menu).getAllByText('Developer')).toHaveLength(1)
    expect(within(menu).getByRole('menuitem', { name: 'Discovery' })).toBeTruthy()
  })

  const deniedContexts: { pathname: string; result: typeof entitlement.result }[] = [
    { pathname: '/admin/search', result: { kind: 'authorized', allowedSurfaces: ['owner'] } },
    { pathname: '/admin/search', result: undefined },
  ]
  it.each(deniedContexts)('does not disclose Admin navigation without a resolved admin entitlement at $pathname', ({ pathname, result }) => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = result
    renderAppShell(pathname)
    expect(screen.queryByRole('navigation', { name: 'Admin primary navigation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
    expect(within(screen.getByRole('menu')).queryByText('Admin')).toBeNull()
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
    createRoute({ getParentRoute: () => rootRoute, path: '/developers/discovery' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/search' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/exceptions' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/providers' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/metrics' }),
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

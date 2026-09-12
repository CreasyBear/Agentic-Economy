/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
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

afterEach(cleanup)

describe('AeAppShell', () => {
  it('renders exactly one persistent app header with the skip link and primary nav', () => {
    renderAppShell()

    expect(document.querySelectorAll('[data-shell="app-header"]')).toHaveLength(1)
    expect(screen.getByTestId('skip-to-content').getAttribute('href')).toBe('#main-content')

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(['Market', 'For agents', 'For providers', 'Calls']).toEqual(
      Array.from(nav.querySelectorAll('a')).map((link) => link.textContent),
    )
  })
})

function renderAppShell(): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', header: { order: 0 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-agents',
      staticData: { nav: { label: 'For agents', header: { order: 1 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-providers',
      staticData: { nav: { label: 'For providers', header: { order: 2 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/activity',
      staticData: { nav: { label: 'Calls', header: { order: 3 } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeAppShell><p>Page content</p></AeAppShell>
    </RouterContextProvider>,
  )
}

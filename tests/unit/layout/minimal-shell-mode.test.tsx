/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
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

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  Show: ({ when, children, fallback }: { when: string; children: ReactNode; fallback?: ReactNode }) =>
    when === 'signed-out' ? children : (fallback ?? null),
  UserButton: () => <button type="button" aria-label="Account menu" />,
}))

afterEach(cleanup)

describe('minimal shell mode (S-11)', () => {
  it('renders a distraction-free header on routes with shellMode minimal', async () => {
    await renderAppShellAt('/sign-in/', { shellMode: 'minimal' })

    expect(document.querySelectorAll('[data-shell="app-header"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Agentic Economy home' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to market' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to market' }).getAttribute('href')).toBe('/market')
  })

  it('suppresses primary navigation and Find Tools on minimal shell routes', async () => {
    await renderAppShellAt('/sign-in/', { shellMode: 'minimal' })

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Find Tools' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open public menu' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('renders full primary navigation and Find Tools on standard public routes', async () => {
    await renderAppShellAt('/market')

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find Tools' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
  })
})

async function renderAppShellAt(
  initialPath: string,
  options?: { shellMode?: 'minimal' },
): Promise<void> {
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
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/sign-in/$',
      ...(options?.shellMode === 'minimal' ? { staticData: { shellMode: 'minimal' as const } } : {}),
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  await router.load()

  render(
    <RouterContextProvider router={router}>
      <AeAppShell><p>Page content</p></AeAppShell>
    </RouterContextProvider>,
  )
}

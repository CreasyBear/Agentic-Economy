/**
 * @vitest-environment jsdom
 */
import type * as ConvexReactModule from 'convex/react'
import type { ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'

const authState = vi.hoisted(() => ({
  isSignedIn: false, isLoaded: true,
  userId: null as string | null, sessionId: null as string | null, orgId: null as string | null,
}))

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

// Vitest hoists the mock factory, so its shared helper must be loaded inside it.
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReactModule>()),
  ...(await import('../../helpers/shell-convex-mock')).shellConvexMock,
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => authState,
  useUser: () => ({ user: null }),
  Show: ({ when, children, fallback }: { when: string; children?: ReactNode; fallback?: ReactNode }) => {
    if (when === 'signed-out') return children ?? null
    if (when === 'signed-in') return null
    return fallback ?? null
  },
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => null,
}))

afterEach(() => {
  cleanup()
  authState.isSignedIn = false; authState.isLoaded = true
  authState.userId = null; authState.sessionId = null; authState.orgId = null
})

describe('minimal shell mode (S-11)', () => {
  it('renders a distraction-free header on routes with shellMode minimal', async () => {
    await renderAppShellAt('/sign-in/', { shellMode: 'minimal' })

    expect(document.querySelectorAll('[data-shell="app-header"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Agentic Economy home' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse Tools' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')).toBe('/market')
  })

  it('suppresses primary navigation and Find Tools on minimal shell routes', async () => {
    await renderAppShellAt('/sign-in/', { shellMode: 'minimal' })

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Find Tools' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open public menu' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('retires private route observations when identity changes inside the minimal auth shell', async () => {
    authState.isSignedIn = true; authState.userId = 'user_alpha'; authState.sessionId = 'session_alpha'; authState.orgId = 'org_alpha'
    let finish!: (value: string) => void
    const current = new Promise<string>(resolve => { finish = resolve })
    const read = vi.fn<() => Promise<string>>().mockResolvedValueOnce('Alpha private record').mockImplementation(() => current)
    const root = createRootRoute()
    const privateRoute = createRoute({ getParentRoute: () => root, path: '/owner/operations/$toolRef',
      loader: () => read(), component: () => <p>{privateRoute.useLoaderData()}</p> })
    const router = createRouter({ routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/sign-in/$', staticData: { shellMode: 'minimal' } }),
      privateRoute,
    ]), history: createMemoryHistory({ initialEntries: ['/owner/operations/private'] }) })
    await router.load()
    const fixture = () => <RouterContextProvider router={router}><AeAppShell><RouterProvider router={router} /></AeAppShell></RouterContextProvider>
    const view = render(fixture())
    await screen.findByText('Alpha private record')
    await act(async () => { await router.navigate({ to: '/sign-in/$', params: { _splat: '' } }) })
    expect(screen.getByRole('link', { name: 'Browse Tools' })).toBeTruthy()
    authState.isSignedIn = false; authState.userId = null; authState.sessionId = null; authState.orgId = null
    view.rerender(fixture())
    await waitFor(() => expect(screen.queryByTestId('workspace-transition-scrim')).toBeNull())
    expect(router.state.location.pathname).toBe('/sign-in')
    expect(screen.getByRole('link', { name: 'Browse Tools' })).toBeTruthy()
    authState.isSignedIn = true; authState.userId = 'user_beta'; authState.sessionId = 'session_beta'; authState.orgId = 'org_beta'
    view.rerender(fixture())
    await waitFor(() => expect(screen.queryByTestId('workspace-transition-scrim')).toBeNull())
    let navigation!: Promise<void>
    act(() => { navigation = router.navigate({ to: '/owner/operations/$toolRef', params: { toolRef: 'private' } }) })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    try {
      expect(screen.queryByText('Alpha private record')).toBeNull()
    } finally {
      await act(async () => { finish('Current private record'); await navigation })
    }
    await screen.findByText('Current private record')
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

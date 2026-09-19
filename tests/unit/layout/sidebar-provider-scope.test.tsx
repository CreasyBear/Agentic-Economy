/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
import { AeOperatorPage, OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'user_test',
      fullName: 'Test User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
    sessionId: 'session_test',
  }),
  Show: ({ when, children, fallback }: { when: string; children: ReactNode; fallback?: ReactNode }) =>
    when === 'signed-out' ? children : (fallback ?? null),
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
}))

afterEach(() => {
  cleanup()
  document.cookie = 'sidebar_state=; max-age=0; path=/'
})

describe('SidebarProvider scope (S-01)', () => {
  it('does not mount sidebar wrapper on public AeAppShell', () => {
    renderPublicShell()

    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toBeNull()
  })

  it('does not set sidebar_state cookie when Cmd+B is pressed on a public page', () => {
    renderPublicShell()

    const cookiesBefore = document.cookie
    fireEvent.keyDown(window, { key: 'b', metaKey: true })

    expect(document.cookie).toBe(cookiesBefore)
    expect(document.cookie).not.toMatch(/sidebar_state=/)
  })

  it('sets --header-height on the public app shell root', () => {
    renderPublicShell()

    const skip = screen.getByTestId('skip-to-content')
    const shellRoot = skip.parentElement
    expect(shellRoot).toBeTruthy()
    expect(shellRoot?.style.getPropertyValue('--header-height')).toBe('4rem')
  })

  it('mounts sidebar wrapper in the operator layout composition', () => {
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/owner/operations',
        staticData: { shell: 'operator' },
      }),
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/owner/operations'] }),
    })

    render(
      <RouterContextProvider router={router}>
        <SidebarProvider className="contents" defaultOpen>
          <OperatorChromeProvider
            sidebar={<AeOperatorSidebar operatorRole="owner" currentPath="/owner/operations" />}
          >
            <AeOperatorPage
              operatorRole="owner"
              title="Tools"
              description="Publish tools."
              currentPath="/owner/operations"
            >
              <div>Body</div>
            </AeOperatorPage>
          </OperatorChromeProvider>
        </SidebarProvider>
      </RouterContextProvider>,
    )

    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toBeTruthy()
  })

  it('renders isolated AeOperatorPage without SidebarProvider', () => {
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/owner/operations',
        staticData: { shell: 'operator' },
      }),
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/owner/operations'] }),
    })

    expect(() =>
      render(
        <RouterContextProvider router={router}>
          <AeOperatorPage
            operatorRole="owner"
            title="Tools"
            description="Publish the exact tools agents can inspect and call."
            currentPath="/owner/operations"
          >
            <div>Tools body</div>
          </AeOperatorPage>
        </RouterContextProvider>,
      ),
    ).not.toThrow()

    expect(screen.getByRole('heading', { level: 1, name: 'Tools' })).toBeTruthy()
    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toBeNull()
  })
})

function renderPublicShell(): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/market'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeAppShell><p>Public page</p></AeAppShell>
    </RouterContextProvider>,
  )
}

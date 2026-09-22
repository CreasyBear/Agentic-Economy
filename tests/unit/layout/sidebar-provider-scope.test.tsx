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
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'

const clerkSignedIn = vi.hoisted(() => ({ value: false }))

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

vi.mock('@/components/ae/command-panel', () => ({
  CommandPanelProvider: ({ children }: { children: ReactNode }) => children,
  AeCommandPanel: () => null,
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: clerkSignedIn.value }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: clerkSignedIn.value,
    user: {
      id: 'user_test',
      fullName: 'Test User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
    sessionId: 'session_test',
  }),
  Show: ({ when, children, fallback }: { when: string; children: ReactNode; fallback?: ReactNode }) =>
    when === 'signed-out'
      ? (clerkSignedIn.value ? (fallback ?? null) : children)
      : (clerkSignedIn.value ? children : (fallback ?? null)),
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
}))

afterEach(() => {
  cleanup()
  document.cookie = 'sidebar_state=; max-age=0; path=/'
  clerkSignedIn.value = false
})

describe('SidebarProvider scope (S-01)', () => {
  it('keeps the routed page under the same provider boundary across auth resolution', () => {
    clerkSignedIn.value = false
    renderPublicShell()
    const signedOutChain = pageWrapperChain(screen.getByText('Public page'))

    cleanup()
    clerkSignedIn.value = true
    renderPublicShell()
    const signedInChain = pageWrapperChain(screen.getByText('Public page'))

    expect(signedOutChain).toEqual(signedInChain)
    expect(signedOutChain).toMatchInlineSnapshot(`
      [
        "div",
        "main[data-slot=sidebar-inset]",
        "div[data-slot=sidebar-wrapper]",
      ]
    `)
  })


  it('sets --header-height on the public app shell root', () => {
    renderPublicShell()

    const skip = screen.getByTestId('skip-to-content')
    const shellRoot = skip.parentElement
    expect(shellRoot).toBeTruthy()
    expect(shellRoot?.style.getPropertyValue('--header-height')).toBe('4rem')
  })

  it('mounts one sidebar wrapper in the signed-in root frame', () => {
    clerkSignedIn.value = true
    renderPublicShell()

    expect(document.querySelectorAll('[data-slot="sidebar-wrapper"]')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: 'App navigation' })).toBeTruthy()
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

function pageWrapperChain(page: HTMLElement): string[] {
  const content = page.parentElement
  const inset = content?.parentElement
  const provider = inset?.parentElement
  return [content, inset, provider].map(element => {
    if (element === null || element === undefined) return 'missing'
    const slot = element.dataset.slot
    return `${element.tagName.toLowerCase()}${slot === undefined ? '' : `[data-slot=${slot}]`}`
  })
}

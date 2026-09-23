/**
 * @vitest-environment jsdom
 */
import type * as ConvexReactModule from 'convex/react'
import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { Boxes as NavIcon } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { AeAppSidebar } from '@/components/ae/layout/app-shell/AeAppSidebar'
import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { AeSitePrimaryNav } from '@/components/ae/website/AeSiteNav'
import { SidebarProvider } from '@/components/ui/sidebar'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

// Vitest hoists the mock factory, so its shared helper must be loaded inside it.
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReactModule>()),
  ...(await import('../../helpers/shell-convex-mock')).shellConvexMock,
}))

vi.mock('@/components/ae/command-panel', () => ({
  CommandPanelProvider: ({ children }: { children: ReactNode }) => children,
  AeCommandPanel: () => null,
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: false }),
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
  Show: ({ when, children, fallback }: { when: string; children?: ReactNode; fallback?: ReactNode }) => {
    if (when === 'signed-out') return children ?? null
    if (when === 'signed-in') return null
    return fallback ?? null
  },
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
}))

afterEach(cleanup)

const TACTILE_SCALE = 'active:scale-[0.98]'
const MOTION_REDUCE_TRANSITION = 'motion-reduce:transition-none'
const MOTION_REDUCE_SCALE = 'motion-reduce:active:scale-100'

function expectTactileNavLink(className: string) {
  expect(className).toContain(TACTILE_SCALE)
  expect(className).toContain(MOTION_REDUCE_TRANSITION)
  expect(className).toContain(MOTION_REDUCE_SCALE)
}

describe('tactile navigation physics (S-09)', () => {
  it('AppHeaderNavLink renders with active scale and motion-reduction classes', () => {
    renderAppShell()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const marketLink = within(nav).getByRole('link', { name: 'Market' })
    expectTactileNavLink(marketLink.className)
    expect(marketLink.className).toContain('transition-[color,transform]')
    expect(marketLink.className).not.toContain('transition-all')
  })

  it('BrandLink renders with active scale and motion-reduction classes', () => {
    renderAppShell()

    const brand = screen.getByRole('link', { name: 'Agentic Economy home' })
    expectTactileNavLink(brand.className)
    expect(brand.className).not.toContain('transition-all')
  })

  it('AeAppSidebar nav buttons include active scale and motion-reduction classes', () => {
    renderOperatorSidebar('/owner/operations')

    const sidebarNav = screen.getByRole('navigation', { name: 'App navigation' })
    const toolsLink = within(sidebarNav).getByRole('link', { name: 'Tools' })
    expectTactileNavLink(toolsLink.className)
    expect(toolsLink.className).not.toContain('transition-all')
  })

  it('PublicNavLink renders with active scale and motion-reduction classes', () => {
    renderPublicPrimaryNav()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const agentsLink = within(nav).getByRole('link', { name: 'For agents' })
    expectTactileNavLink(agentsLink.className)
    expect(agentsLink.className).not.toContain('transition-all')
  })

  it('AeOwnerMobileNavigation links have active scale and motion-reduction classes', () => {
    renderOwnerMobileNav('/market')

    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    for (const link of within(navigation).getAllByRole('link')) {
      expectTactileNavLink(link.className)
      expect(link.className).not.toContain('transition-all')
    }
  })
})

function renderAppShell(): void {
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
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeAppShell>
        <p>Page content</p>
      </AeAppShell>
    </RouterContextProvider>,
  )
}

function renderPublicPrimaryNav(): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
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
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/market'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeSitePrimaryNav />
    </RouterContextProvider>,
  )
}

function renderOperatorSidebar(pathname: string): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner',
      staticData: {
        nav: {
          label: 'Overview',
          operator: { roles: ['owner'], group: 'Workspace', groupOrder: -1, order: 0, icon: NavIcon, tier: 'core' },
        },
      },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations',
      staticData: {
        nav: {
          label: 'Tools',
          operator: { roles: ['owner'], group: 'Supply', groupOrder: 1, order: 0, icon: NavIcon, tier: 'core' },
        },
      },
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  render(
    <RouterContextProvider router={router}>
      <SidebarProvider>
        <OperatorChromeProvider>
          <AeAppSidebar operatorRole="owner" pathname={pathname} hash="" />
        </OperatorChromeProvider>
      </SidebarProvider>
    </RouterContextProvider>,
  )
}

function renderOwnerMobileNav(pathname: string): void {
  const rootRoute = createRootRoute()
  const ownerNav = {
    roles: ['owner'] as const,
    group: 'Workspace',
    groupOrder: 0,
    order: 0,
    icon: NavIcon,
    tier: 'core' as const,
  }
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 0 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent-access',
      staticData: { nav: { label: 'Agents', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 10 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/activity',
      staticData: { nav: { label: 'Calls', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 20 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations',
      staticData: { nav: { label: 'Tools', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 30 } } },
    }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [pathname] }) })

  render(
    <RouterContextProvider router={router}>
      <AeOwnerMobileNavigation currentPath={pathname} />
    </RouterContextProvider>,
  )
}

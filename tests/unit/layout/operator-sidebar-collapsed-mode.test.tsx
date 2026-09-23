/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import '../../setup/jsdom-dialog'

import { AeAppSidebar } from '@/components/ae/layout/app-shell/AeAppSidebar'
import { AeOperatorPage, OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { Sidebar, SidebarRail, SidebarProvider } from '@/components/ui/sidebar'

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

const RAIL_TOGGLE_LABEL = 'Toggle Sidebar (⌘B)'

describe('collapsed sidebar icon mode (S-14)', () => {
  it('SidebarRail exposes the toggle shortcut on title and aria-label', () => {
    render(
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon">
          <SidebarRail />
        </Sidebar>
      </SidebarProvider>,
    )

    const rail = document.querySelector('[data-slot="sidebar-rail"]')
    expect(rail).toBeTruthy()
    expect(rail?.getAttribute('title')).toBe(RAIL_TOGGLE_LABEL)
    expect(rail?.getAttribute('aria-label')).toBe(RAIL_TOGGLE_LABEL)
  })

  it('app nav buttons use a 3px leading active indicator', () => {
    renderOperatorSidebar({ pathname: '/owner/operations', defaultOpen: true })

    const sidebarNav = screen.getByRole('navigation', { name: 'App navigation' })
    const toolsLink = within(sidebarNav).getByRole('link', { name: 'Tools' })
    expect(toolsLink.className).toContain('border-s-[3px]')

    const rail = document.querySelector('[data-slot="sidebar-rail"]')
    expect(rail).toBeTruthy()
    expect(rail?.getAttribute('aria-label')).toBe('Collapse navigation')
    expect(rail?.getAttribute('title')).toContain('(⌘B)')
  })

  it('collapsed nav items with badges show indicator dots and enriched tooltips', async () => {
    renderOperatorSidebar({
      pathname: '/owner/operations',
      defaultOpen: false,
      navBadges: { '/owner/operations': 4 },
    })

    const sidebarNav = screen.getByRole('navigation', { name: 'App navigation' })
    const toolsLink = within(sidebarNav).getByRole('link', { name: 'Tools' })
    const toolsItem = toolsLink.closest('[data-slot="sidebar-menu-item"]')
    expect(toolsItem).toBeTruthy()
    expect(toolsItem?.querySelector('[data-slot="collapsed-badge-dot"]')).toBeTruthy()

    fireEvent.pointerEnter(toolsLink)
    fireEvent.focus(toolsLink)
    fireEvent.mouseEnter(toolsLink)
    const tooltip = await screen.findByText('Tools (4)')
    expect(tooltip).toBeTruthy()
  })
})

function renderOperatorSidebar(options: {
  pathname: string
  defaultOpen?: boolean
  navBadges?: Record<string, number>
}): void {
  const { pathname, defaultOpen = true, navBadges } = options
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
      <SidebarProvider defaultOpen={defaultOpen}>
        <OperatorChromeProvider>
          <AeAppSidebar operatorRole="owner" pathname={pathname} hash="" />
          <AeOperatorPage
            operatorRole="owner"
            title="Tools"
            description="Manage Tools."
            currentPath={pathname}
            {...(navBadges === undefined ? {} : { navBadges })}
          >
            <div>Tools body</div>
          </AeOperatorPage>
        </OperatorChromeProvider>
      </SidebarProvider>
    </RouterContextProvider>,
  )
}
